import { describe, it, expect, vi } from "vitest";
import { createScraperService } from "./scraper.service";
import type { TraderRepository } from "../traders/trader.types";
import type { QuestRepository } from "../quests/quest.types";

function buildFakeApiResponse() {
  return JSON.stringify({
    parse: {
      text: {
        "*": `
          <ul class="wds-tabs"><li class="wds-tabs__tab"><span title="Prapor"><img src="https://example.com/prapor.png" /></span></li></ul>
          <table class="table-progress-tracking wikitable sortable"><tbody>
            <tr><th>icon</th><th>Quest</th><th>Objectives</th><th>Rewards</th></tr>
            <tr>
              <td>checkbox</td>
              <td><a href="/wiki/Debut">Debut</a></td>
              <td><ul><li>Eliminate 5 Scavs</li></ul></td>
              <td><ul><li>+1200 EXP</li></ul></td>
            </tr>
          </tbody></table>
        `,
      },
    },
  });
}

describe("createScraperService", () => {
  it("upserts the trader and quest parsed from the page, then deactivates unseen quests", async () => {
    const upsertedTrader = { id: 1, name: "Prapor", slug: "prapor", tabOrder: 0 };
    const upsertedQuest = {
      id: 1,
      traderId: 1,
      name: "Debut",
      wikiSlug: "Debut",
      wikiUrl: "/wiki/Debut",
      objectives: ["Eliminate 5 Scavs"],
      rewards: ["+1200 EXP"],
      requiredItems: [],
      completed: false,
      active: true,
      lastSeenAt: new Date(),
    };

    const traderRepository: TraderRepository = {
      upsertByName: vi.fn().mockResolvedValue(upsertedTrader),
      findAll: vi.fn(),
    };
    const questRepository: QuestRepository = {
      upsertBySlug: vi.fn().mockResolvedValue(upsertedQuest),
      updateCompleted: vi.fn(),
      findAllActiveGroupedByTrader: vi.fn().mockResolvedValue([]),
      deactivateNotIn: vi.fn().mockResolvedValue(2),
    };
    const fetchQuestsPageJson = vi.fn().mockResolvedValue(buildFakeApiResponse());
    const downloadTraderImage = vi.fn().mockResolvedValue("/trader-images/prapor.png");

    const service = createScraperService({
      traderRepository,
      questRepository,
      fetchQuestsPageJson,
      downloadTraderImage,
    });
    const summary = await service.runScrape();

    expect(downloadTraderImage).toHaveBeenCalledWith("https://example.com/prapor.png", "prapor");
    expect(traderRepository.upsertByName).toHaveBeenCalledWith({
      name: "Prapor",
      slug: "prapor",
      tabOrder: 0,
      imageUrl: "/trader-images/prapor.png",
    });
    expect(questRepository.upsertBySlug).toHaveBeenCalledWith({
      traderId: 1,
      name: "Debut",
      wikiSlug: "Debut",
      wikiUrl: "/wiki/Debut",
      objectives: ["Eliminate 5 Scavs"],
      rewards: ["+1200 EXP"],
      requiredItems: [],
    });
    expect(questRepository.deactivateNotIn).toHaveBeenCalledWith(["Debut"]);
    expect(summary).toEqual({ added: 1, updated: 0, deactivated: 2, totalQuests: 1 });
  });

  it("refuses to deactivate every quest when the parsed page yields zero quests", async () => {
    const emptyPageResponse = JSON.stringify({
      parse: {
        text: {
          "*": `
            <ul class="wds-tabs"><li class="wds-tabs__tab"><span title="Prapor"></span></li></ul>
            <table class="table-progress-tracking wikitable sortable"><tbody>
              <tr><th>icon</th><th>Quest</th><th>Objectives</th><th>Rewards</th></tr>
            </tbody></table>
          `,
        },
      },
    });

    const traderRepository: TraderRepository = {
      upsertByName: vi.fn().mockResolvedValue({ id: 1, name: "Prapor", slug: "prapor", tabOrder: 0 }),
      findAll: vi.fn(),
    };
    const questRepository: QuestRepository = {
      upsertBySlug: vi.fn(),
      updateCompleted: vi.fn(),
      findAllActiveGroupedByTrader: vi.fn().mockResolvedValue([]),
      deactivateNotIn: vi.fn().mockResolvedValue(0),
    };
    const fetchQuestsPageJson = vi.fn().mockResolvedValue(emptyPageResponse);
    const downloadTraderImage = vi.fn().mockResolvedValue(null);

    const service = createScraperService({
      traderRepository,
      questRepository,
      fetchQuestsPageJson,
      downloadTraderImage,
    });

    await expect(service.runScrape()).rejects.toThrow(
      "Scrape parsed 0 quests; refusing to deactivate the entire database"
    );
    expect(questRepository.deactivateNotIn).not.toHaveBeenCalled();
  });
});
