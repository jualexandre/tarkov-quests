import * as cheerio from "cheerio";
import type { ParsedQuest, ParsedTrader } from "./scraper.types";

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

          const objectives = $(cells[objectivesCellIndex])
            .find("li")
            .map((_, li) => $(li).text().trim())
            .get();
          const rewards = $(cells[rewardsCellIndex])
            .find("li")
            .map((_, li) => $(li).text().trim())
            .get();

          quests.push({ name: questName, wikiSlug, wikiUrl: href, objectives, rewards });
        });
    }

    return { name, tabOrder, imageUrl, quests };
  });
}
