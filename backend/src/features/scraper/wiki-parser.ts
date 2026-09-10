import * as cheerio from "cheerio";
import type { ParsedQuest, ParsedTrader } from "./scraper.types";
import type { RequiredItemEntry, QuestRequirements } from "../quests/quest.types";

const WIKI_BASE_URL = "https://escapefromtarkov.fandom.com";

// Wiki links to these generic glossary pages aren't useful in-app
// ("in raid" → Found in raid, EXP → EXP) — keep the text, drop the link.
const UNLINKED_WIKI_PATHS = ["/wiki/Found_in_raid", "/wiki/EXP"];

const RELATED_ITEMS_CAPTION = "Related Quest Items";

/**
 * Renders one HTML element down to a safe HTML fragment: wiki-relative links
 * become absolute and open in a new tab, and the wiki's <font color="red|green">
 * markup (used for "in raid", +/- rep amounts, and a "Yes" find-in-raid cell)
 * becomes Tailwind classes instead. Nested <ul>/<ol> (e.g. optional
 * sub-objectives) are kept as an indented sub-list rather than flattened.
 */
function sanitizeHtmlFragment($: cheerio.CheerioAPI, el: any): string {
  const $el = $(el).clone();
  $el.find("ul, ol").attr("class", "list-disc list-inside space-y-0.5 pl-4 mt-0.5");

  $el.find('font[color="red"]').each((_, e) => {
    const $e = $(e);
    $e.replaceWith(`<span class="text-red-400">${$e.html() ?? ""}</span>`);
  });
  $el.find('font[color="green"]').each((_, e) => {
    const $e = $(e);
    $e.replaceWith(`<span class="text-green-400">${$e.html() ?? ""}</span>`);
  });
  $el.find("font").each((_, e) => {
    const $e = $(e);
    $e.replaceWith($e.html() ?? "");
  });

  $el
    .find("a")
    .filter((_, e) => UNLINKED_WIKI_PATHS.includes($(e).attr("href") ?? ""))
    .each((_, e) => {
      const $e = $(e);
      $e.replaceWith($e.html() ?? "");
    });

  $el.find("a").each((_, e) => {
    const $e = $(e);
    const href = $e.attr("href") ?? "";
    if (href.startsWith("/")) {
      $e.attr("href", `${WIKI_BASE_URL}${href}`);
    }
    $e.attr("target", "_blank");
    $e.attr("rel", "noopener");
    $e.attr("class", "hover:text-[var(--color-accent)]");
  });

  return ($el.html() ?? "").trim();
}

// Only the top-level <li>s become their own entry; a nested <li> (one whose
// parent <ul>/<ol> is itself inside another <li>) is rendered as part of its
// parent's HTML instead, so it isn't picked up here too.
function extractListItems($: cheerio.CheerioAPI, cell: cheerio.Cheerio<any>): string[] {
  const cellEl = cell.get(0);
  return cell
    .find("li")
    .filter((_, li) => $(li).parentsUntil(cellEl, "ul, ol").length <= 1)
    .map((_, li) => sanitizeHtmlFragment($, li))
    .get();
}

export function parseQuestsPage(apiResponseJson: string): ParsedTrader[] {
  const parsed = JSON.parse(apiResponseJson);
  const html: string = parsed.parse.text["*"];
  const $ = cheerio.load(html);

  const traderTabs = $("li.wds-tabs__tab span[title]")
    .map((_, el) => {
      const span = $(el);
      const img = span.find("img").first();
      return {
        name: span.attr("title") ?? "",
        imageUrl: img.attr("data-src") ?? img.attr("src") ?? null,
      };
    })
    .get()
    .filter((trader) => trader.name.length > 0);

  const tables = $("table.table-progress-tracking").toArray();

  return traderTabs.map(({ name, imageUrl }, tabOrder) => {
    const table = tables[tabOrder];
    const quests: ParsedQuest[] = [];

    if (table) {
      $(table)
        .find("tbody > tr")
        .each((_, row) => {
          const cells = $(row).find("td");
          if (cells.length < 3) return; // header row has no <td>

          const nameCell = $(cells[0]).length && $(cells[0]).find("a").length
            ? cells[0]
            : cells[1];
          const link = $(nameCell).find("a").first();
          if (link.length === 0) return;

          const href = link.attr("href") ?? "";
          const wikiSlug = href.replace(/^\/wiki\//, "");
          const questName = link.text().trim();

          const objectivesCellIndex = cells.length >= 4 ? 2 : 1;
          const rewardsCellIndex = cells.length >= 4 ? 3 : 2;

          const objectives = extractListItems($, $(cells[objectivesCellIndex]));
          const rewards = extractListItems($, $(cells[rewardsCellIndex]));

          quests.push({ name: questName, wikiSlug, wikiUrl: href, objectives, rewards });
        });
    }

    return { name, tabOrder, imageUrl, quests };
  });
}

function extractIconUrl($: cheerio.CheerioAPI, cell: cheerio.Cheerio<any>): string | null {
  const img = cell.find("img").first();
  if (img.length === 0) return null;
  return img.attr("data-src") ?? img.attr("src") ?? null;
}

/**
 * A generic item's name cell links only the category word ("Any <a>food</a>
 * item"), so the display name always comes from the whole cell's text —
 * using the link's own text instead would drop the surrounding "Any"/"item".
 * The link, when present, is only used for the wiki URL.
 */
function extractItemLink(
  $: cheerio.CheerioAPI,
  cell: cheerio.Cheerio<any>
): { name: string; wikiUrl: string | null } {
  const name = cell.text().trim();
  const link = cell.find("a").first();
  if (link.length === 0) {
    return { name, wikiUrl: null };
  }
  const href = link.attr("href") ?? "";
  const wikiUrl = href.startsWith("/") ? `${WIKI_BASE_URL}${href}` : href || null;
  return { name, wikiUrl };
}

type RequiredItemColumn = "icon" | "name" | "amount" | "requirement" | "findInRaid" | "notes";

// Header labels vary across pages ("Item" instead of "Item name", "Note"
// instead of "Notes", and a couple of pages using an entirely different
// Name/Quantity/Requirements template) — surveyed across every quest on the wiki.
const COLUMN_LABELS: Record<string, RequiredItemColumn> = {
  icon: "icon",
  "item name": "name",
  item: "name",
  name: "name",
  amount: "amount",
  quantity: "amount",
  requirement: "requirement",
  requirements: "requirement",
  "find in raid": "findInRaid",
  notes: "notes",
  note: "notes",
};

/**
 * Not every "Related Quest Items" table has every column — a generic item
 * (e.g. "Any food item") has no icon to show, so its table omits the Icon
 * (and often Notes) column entirely, shifting every other column left. Reading
 * the header row's own labels, instead of assuming fixed positions, keeps
 * name/amount/requirement aligned regardless of which columns are present.
 */
function detectColumns($: cheerio.CheerioAPI, headerRow: cheerio.Cheerio<any>): Record<RequiredItemColumn, number> {
  const columns: Record<RequiredItemColumn, number> = {
    icon: -1,
    name: -1,
    amount: -1,
    requirement: -1,
    findInRaid: -1,
    notes: -1,
  };
  headerRow.children("th, td").each((index, cell) => {
    const column = COLUMN_LABELS[$(cell).text().trim().toLowerCase()];
    if (column) columns[column] = index;
  });
  return columns;
}

/**
 * A row's Icon/Item-name cell sometimes lists several interchangeable items
 * ("Ushanka ear flap hat<br>or<br>Domontovich ushanka hat<br>or<br>...")
 * instead of one — the wiki packs an alternative-item choice into a single
 * row rather than separate rows. Each `<a>`/`<img>` in such a cell is one
 * alternative, always in the same order in both the icon and name cells.
 */
function extractIconAlternatives($: cheerio.CheerioAPI, cell: cheerio.Cheerio<any>): Array<string | null> {
  const imgs = cell.find("img");
  if (imgs.length <= 1) return [extractIconUrl($, cell)];
  return imgs
    .map((_, img) => {
      const $img = $(img);
      return $img.attr("data-src") ?? $img.attr("src") ?? null;
    })
    .get();
}

function extractNameAlternatives(
  $: cheerio.CheerioAPI,
  cell: cheerio.Cheerio<any>
): Array<{ name: string; wikiUrl: string | null }> {
  const links = cell.find("a");
  if (links.length <= 1) return [extractItemLink($, cell)];
  return links
    .map((_, a) => {
      const $a = $(a);
      const href = $a.attr("href") ?? "";
      const wikiUrl = href.startsWith("/") ? `${WIKI_BASE_URL}${href}` : href || null;
      return { name: $a.text().trim(), wikiUrl };
    })
    .get();
}

/**
 * Parses the "Related Quest Items" table from a quest's detail page, if
 * present. A quest with no required items simply has no such table on its
 * page, so an absent table means an empty result, not an error. The table's
 * first two rows are always a single-cell caption and a column-header row
 * (a shared wiki template), so data rows start at index 2. The caption's
 * casing varies ("Related quest items" on a couple of pages), hence the
 * case-insensitive match.
 *
 * Two distinct patterns express "you only need one of the below options":
 * a single-cell divider row between otherwise ordinary rows (e.g. "OR"), or
 * several alternatives packed into one row's Icon/Item-name cells. Both are
 * normalized to the same output — items interleaved with `{kind: "divider"}`
 * entries — so the UI only has to handle one shape.
 *
 * A shared note spanning several rows is marked with `rowspan` on that one
 * cell instead of being repeated, which otherwise shifts every following
 * row's remaining cells left by one. Column values are read from a
 * reconstructed per-row grid that carries a `rowspan`-ed cell forward for as
 * many rows as it covers, so this never desyncs column alignment.
 */
export function parseRequiredItems(apiResponseJson: string): RequiredItemEntry[] {
  const parsed = JSON.parse(apiResponseJson);
  const html: string = parsed.parse.text["*"];
  const $ = cheerio.load(html);

  const table = $("table.wikitable")
    .filter((_, t) =>
      $(t).find("tr").first().text().trim().toLowerCase().includes(RELATED_ITEMS_CAPTION.toLowerCase())
    )
    .first();

  if (table.length === 0) return [];

  const rows = table.find("tbody > tr").toArray();
  if (rows.length < 2) return [];

  const headerRow = $(rows[1]);
  const columns = detectColumns($, headerRow);
  const columnCount = headerRow.children("th, td").length;

  const entries: RequiredItemEntry[] = [];
  const rowspanCarries: Array<{ cell: any; remaining: number } | null> = new Array(columnCount).fill(null);

  for (const row of rows.slice(2)) {
    // A table-progress-tracking table (e.g. quests with in-progress checkboxes)
    // prefixes each data row with a checkbox cell that has no header counterpart,
    // which would otherwise shift every column by one.
    const rawCells = $(row).children("td, th").not(".table-progress-checkbox-cell").toArray();

    if (rawCells.length <= 1) {
      entries.push({ kind: "divider", label: $(rawCells[0]).text().trim() });
      continue;
    }

    // Reconstruct this row's full column grid: a column still covered by a
    // previous row's rowspan reuses that cell instead of consuming the next
    // one of this row's own (fewer) cells.
    const rowCells: Array<any | null> = new Array(columnCount).fill(null);
    let pointer = 0;
    for (let col = 0; col < columnCount; col++) {
      const carry = rowspanCarries[col];
      if (carry && carry.remaining > 0) {
        rowCells[col] = carry.cell;
        carry.remaining -= 1;
        if (carry.remaining === 0) rowspanCarries[col] = null;
        continue;
      }
      const cellNode = rawCells[pointer] ?? null;
      pointer += 1;
      rowCells[col] = cellNode;
      if (cellNode) {
        const rowspan = parseInt($(cellNode).attr("rowspan") ?? "1", 10) || 1;
        if (rowspan > 1) rowspanCarries[col] = { cell: cellNode, remaining: rowspan - 1 };
      }
    }

    // A missing column (-1) or one this row has no cell for falls back to an
    // empty selection so every extractor below degrades to its "absent" case.
    const emptyCell = $(row).children().slice(0, 0);
    const cellAt = (column: RequiredItemColumn): cheerio.Cheerio<any> => {
      const index = columns[column];
      const node = index === -1 ? null : rowCells[index];
      return node ? $(node) : emptyCell;
    };

    const amountText = cellAt("amount").text().trim();
    const parsedAmount = amountText === "" ? NaN : parseInt(amountText, 10);
    const amount = Number.isNaN(parsedAmount) ? null : parsedAmount;
    const requirement = cellAt("requirement").text().trim();
    const findInRaid = cellAt("findInRaid").text().trim().toLowerCase() === "yes";
    const notes = sanitizeHtmlFragment($, cellAt("notes").get(0));

    // The name cell is the authority on how many alternatives this row holds
    // (each one a distinct, individually meaningful choice). The icon cell
    // sometimes shows a whole illustrative gallery instead of one icon per
    // alternative (e.g. "Any PMC figurine" pictures every figurine that
    // qualifies) — icons are only paired up index-by-index when their count
    // actually matches; otherwise every alternative just gets no icon, except
    // the first, which falls back to the cell's first image as a stand-in.
    const nameAlternatives = extractNameAlternatives($, cellAt("name"));
    const iconAlternatives = extractIconAlternatives($, cellAt("icon"));
    const iconsPairUp = iconAlternatives.length === nameAlternatives.length;

    for (let i = 0; i < nameAlternatives.length; i++) {
      if (i > 0) entries.push({ kind: "divider", label: "OR" });
      const { name, wikiUrl } = nameAlternatives[i];
      const iconUrl = iconsPairUp ? iconAlternatives[i] : i === 0 ? extractIconUrl($, cellAt("icon")) : null;
      entries.push({ kind: "item", name, wikiUrl, iconUrl, amount, requirement, findInRaid, notes });
    }
  }

  return entries;
}

const RELATED_QUESTS_HEADER = "Related quests";

/**
 * Parses a quest's own level/prior-quest gating from its detail page. Both
 * blocks are independent and optional: a quest can have neither, either, or
 * both. Trader-loyalty-level lines are kept as informational text only (this
 * app tracks no trader reputation), never parsed into `minLevel`.
 */
export function parseRequirements(apiResponseJson: string): QuestRequirements {
  const parsed = JSON.parse(apiResponseJson);
  const html: string = parsed.parse.text["*"];
  const $ = cheerio.load(html);

  let minLevel: number | null = null;
  const loyaltyNotes: string[] = [];

  const requirementsList = $("#Requirements").first().closest("h2").next("ul");
  requirementsList.children("li").each((_, li) => {
    const text = $(li).text().trim();
    const levelMatch = text.match(/level\s+(\d+)/i);
    if (levelMatch && !text.toLowerCase().includes("loyalty")) {
      minLevel = parseInt(levelMatch[1], 10);
      return;
    }
    loyaltyNotes.push(sanitizeHtmlFragment($, li));
  });

  const relatedQuestsHeader = $(".va-infobox-header")
    .filter((_, el) => $(el).text().trim() === RELATED_QUESTS_HEADER)
    .first();

  let prerequisiteQuestSlugs: string[] = [];
  if (relatedQuestsHeader.length > 0) {
    const group = relatedQuestsHeader.closest("table.va-infobox-group");
    const previousCell = group
      .find(".va-infobox-content")
      .filter((_, el) => $(el).text().trim().startsWith("Previous:"))
      .first();
    prerequisiteQuestSlugs = previousCell
      .find("a")
      .map((_, a) => ($(a).attr("href") ?? "").replace(/^\/wiki\//, ""))
      .get();
  }

  return { minLevel, prerequisiteQuestSlugs, loyaltyNotes };
}
