import * as cheerio from "cheerio";
import type { ParsedQuest, ParsedTrader } from "./scraper.types";

const WIKI_BASE_URL = "https://escapefromtarkov.fandom.com";

// Wiki links to these generic glossary pages aren't useful in-app
// ("in raid" → Found in raid, EXP → EXP) — keep the text, drop the link.
const UNLINKED_WIKI_PATHS = ["/wiki/Found_in_raid", "/wiki/EXP"];

/**
 * Renders one <li> (objective or reward line) down to a safe HTML fragment:
 * wiki-relative links become absolute and open in a new tab, and the wiki's
 * <font color="red|green"> markup (used for "in raid" and +/- rep amounts)
 * becomes Tailwind classes instead. Nested <ul> are stripped because the
 * caller already flattens nested <li>s into their own top-level entries.
 */
function sanitizeListItem($: cheerio.CheerioAPI, li: any): string {
  const $li = $(li).clone();
  $li.find("ul, ol").remove();

  $li.find('font[color="red"]').each((_, el) => {
    const $el = $(el);
    $el.replaceWith(`<span class="text-red-400">${$el.html() ?? ""}</span>`);
  });
  $li.find('font[color="green"]').each((_, el) => {
    const $el = $(el);
    $el.replaceWith(`<span class="text-green-400">${$el.html() ?? ""}</span>`);
  });
  $li.find("font").each((_, el) => {
    const $el = $(el);
    $el.replaceWith($el.html() ?? "");
  });

  $li
    .find("a")
    .filter((_, el) => UNLINKED_WIKI_PATHS.includes($(el).attr("href") ?? ""))
    .each((_, el) => {
      const $el = $(el);
      $el.replaceWith($el.html() ?? "");
    });

  $li.find("a").each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href") ?? "";
    if (href.startsWith("/")) {
      $el.attr("href", `${WIKI_BASE_URL}${href}`);
    }
    $el.attr("target", "_blank");
    $el.attr("rel", "noopener");
    $el.attr("class", "hover:text-[var(--color-accent)]");
  });

  return ($li.html() ?? "").trim();
}

function extractListItems($: cheerio.CheerioAPI, cell: cheerio.Cheerio<any>): string[] {
  return cell
    .find("li")
    .map((_, li) => sanitizeListItem($, li))
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
