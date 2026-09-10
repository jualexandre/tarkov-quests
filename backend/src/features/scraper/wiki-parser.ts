import * as cheerio from "cheerio";
import type { ParsedQuest, ParsedTrader } from "./scraper.types";
import type { RequiredItem } from "../quests/quest.types";

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

function extractItemLink(
  $: cheerio.CheerioAPI,
  cell: cheerio.Cheerio<any>
): { name: string; wikiUrl: string | null } {
  const link = cell.find("a").first();
  if (link.length === 0) {
    return { name: cell.text().trim(), wikiUrl: null };
  }
  const href = link.attr("href") ?? "";
  const wikiUrl = href.startsWith("/") ? `${WIKI_BASE_URL}${href}` : href || null;
  return { name: link.text().trim(), wikiUrl };
}

/**
 * Parses the "Related Quest Items" table from a quest's detail page, if
 * present. A quest with no required items simply has no such table on its
 * page, so an absent table means an empty result, not an error. The table's
 * first two rows are always a single-cell caption and a column-header row
 * (a shared wiki template), so data rows start at index 2.
 */
export function parseRequiredItems(apiResponseJson: string): RequiredItem[] {
  const parsed = JSON.parse(apiResponseJson);
  const html: string = parsed.parse.text["*"];
  const $ = cheerio.load(html);

  const table = $("table.wikitable")
    .filter((_, t) => $(t).find("tr").first().text().trim().includes(RELATED_ITEMS_CAPTION))
    .first();

  if (table.length === 0) return [];

  const rows = table.find("tbody > tr").toArray();
  return rows.slice(2).map((row) => {
    // A table-progress-tracking table (e.g. quests with in-progress checkboxes)
    // prefixes each data row with a checkbox cell that has no header counterpart,
    // which would otherwise shift every column by one.
    const cells = $(row).children("td, th").not(".table-progress-checkbox-cell");
    const iconUrl = extractIconUrl($, cells.eq(0));
    const { name, wikiUrl } = extractItemLink($, cells.eq(1));
    const amount = parseInt(cells.eq(2).text().trim(), 10) || 0;
    const requirement = cells.eq(3).text().trim();
    const findInRaid = cells.eq(4).text().trim().toLowerCase() === "yes";
    const notes = sanitizeHtmlFragment($, cells.eq(5).get(0));

    return { name, wikiUrl, iconUrl, amount, requirement, findInRaid, notes };
  });
}
