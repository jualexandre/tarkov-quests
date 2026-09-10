import { describe, it, expect, vi } from "vitest";
import { createScraperService } from "./scraper.service";
import type { TraderRepository } from "../traders/trader.types";
import type { QuestRepository } from "../quests/quest.types";
import { EMPTY_QUEST_REQUIREMENTS } from "../quests/quest.types";

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

function buildFakeDetailResponseWithoutItems(): string {
  return JSON.stringify({ parse: { text: { "*": "<p>No items on this page.</p>" } } });
}

function buildFakeDetailResponseWithItem(): string {
  return JSON.stringify({
    parse: {
      text: {
        "*": `
          <table class="wikitable">
            <tbody>
              <tr><th colspan="7">Related Quest Items</th></tr>
              <tr><th>Icon</th><th>Item name</th><th>Amount</th><th>Requirement</th><th>Find in raid</th><th>Notes</th></tr>
              <tr>
                <td><img data-src="https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/d/d0/Docs_0060_icon.png" /></td>
                <td><a href="/wiki/Secure_Folder_0060">Secure Folder 0060</a></td>
                <td>1</td>
                <td>Handover item</td>
                <th><font color="red">Yes</font></th>
                <td>Quest item, transferred on pickup.</td>
              </tr>
            </tbody>
          </table>
        `,
      },
    },
  });
}

function buildFakeDetailResponseWithAlternatives(): string {
  return JSON.stringify({
    parse: {
      text: {
        "*": `
          <table class="wikitable">
            <tbody>
              <tr><th colspan="6">Related Quest Items</th></tr>
              <tr><th>Icon</th><th>Item name</th><th>Amount</th><th>Requirement</th><th>Find in Raid</th><th>Notes</th></tr>
              <tr>
                <th><img data-src="https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/f/f1/Yellow_flare_icon.png" /></th>
                <td><a href="/wiki/RSP-30">RSP-30 reactive signal cartridge (Yellow)</a></td>
                <td>1</td>
                <td>Required</td>
                <th>N/A</th>
                <td>Must be fired into the sky.</td>
              </tr>
              <tr><th colspan="6">OR</th></tr>
              <tr>
                <th><img data-src="https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/f/f7/SP-81_Icon.png" /></th>
                <td><a href="/wiki/ZiD_SP-81">ZiD SP-81 26x75 signal pistol</a></td>
                <td>1</td>
                <td>Required</td>
                <th>N/A</th>
                <td>Used to fire the flare cartridge.</td>
              </tr>
            </tbody>
          </table>
        `,
      },
    },
  });
}

function buildFakeDetailResponseWithRequirements(): string {
  return JSON.stringify({
    parse: {
      text: {
        "*": `
          <h2><span class="mw-headline" id="Requirements">Requirements</span></h2>
          <ul><li>Must be level 30 to start this quest.</li></ul>
          <table class="va-infobox-group"><tbody>
            <tr><th class="va-infobox-header" colspan="3">Related quests</th></tr>
            <tr>
              <td class="va-infobox-content">Previous:<br /><a href="/wiki/Debut">Debut</a></td>
              <td class="va-infobox-content">Leads to:<br />-</td>
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
      requirements: EMPTY_QUEST_REQUIREMENTS,
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
    const fetchQuestDetailJson = vi.fn().mockResolvedValue(buildFakeDetailResponseWithoutItems());
    const downloadTraderImage = vi.fn().mockResolvedValue("/api/trader-images/prapor.png");
    const downloadItemImage = vi.fn().mockResolvedValue(null);

    const service = createScraperService({
      traderRepository,
      questRepository,
      fetchQuestsPageJson,
      fetchQuestDetailJson,
      downloadTraderImage,
      downloadItemImage,
    });
    const summary = await service.runScrape();

    expect(downloadTraderImage).toHaveBeenCalledWith("https://example.com/prapor.png", "prapor");
    expect(fetchQuestDetailJson).toHaveBeenCalledWith("Debut");
    expect(traderRepository.upsertByName).toHaveBeenCalledWith({
      name: "Prapor",
      slug: "prapor",
      tabOrder: 0,
      imageUrl: "/api/trader-images/prapor.png",
    });
    expect(questRepository.upsertBySlug).toHaveBeenCalledWith({
      traderId: 1,
      name: "Debut",
      wikiSlug: "Debut",
      wikiUrl: "/wiki/Debut",
      objectives: ["Eliminate 5 Scavs"],
      rewards: ["+1200 EXP"],
      requiredItems: [],
      requirements: EMPTY_QUEST_REQUIREMENTS,
    });
    expect(questRepository.deactivateNotIn).toHaveBeenCalledWith(["Debut"]);
    expect(summary).toEqual({
      added: 1,
      updated: 0,
      deactivated: 2,
      totalQuests: 1,
      detailFetchFailures: 0,
    });
  });

  it("fetches, parses, and localizes required items from each quest's detail page", async () => {
    const upsertedTrader = { id: 1, name: "Prapor", slug: "prapor", tabOrder: 0 };
    const upsertedQuest = {
      id: 1,
      traderId: 1,
      name: "Debut",
      wikiSlug: "Debut",
      wikiUrl: "/wiki/Debut",
      objectives: [],
      rewards: [],
      requiredItems: [],
      requirements: EMPTY_QUEST_REQUIREMENTS,
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
      deactivateNotIn: vi.fn().mockResolvedValue(0),
    };
    const fetchQuestsPageJson = vi.fn().mockResolvedValue(buildFakeApiResponse());
    const fetchQuestDetailJson = vi.fn().mockResolvedValue(buildFakeDetailResponseWithItem());
    const downloadTraderImage = vi.fn().mockResolvedValue("/api/trader-images/prapor.png");
    const downloadItemImage = vi.fn().mockResolvedValue("/api/item-images/Secure_Folder_0060.png");

    const service = createScraperService({
      traderRepository,
      questRepository,
      fetchQuestsPageJson,
      fetchQuestDetailJson,
      downloadTraderImage,
      downloadItemImage,
    });
    await service.runScrape();

    expect(downloadItemImage).toHaveBeenCalledWith(
      "https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/d/d0/Docs_0060_icon.png",
      "Secure_Folder_0060"
    );
    expect(questRepository.upsertBySlug).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredItems: [
          {
            kind: "item",
            name: "Secure Folder 0060",
            wikiUrl: "https://escapefromtarkov.fandom.com/wiki/Secure_Folder_0060",
            iconUrl: "/api/item-images/Secure_Folder_0060.png",
            amount: 1,
            requirement: "Handover item",
            findInRaid: true,
            notes: "Quest item, transferred on pickup.",
          },
        ],
      })
    );
  });

  it("parses and includes a quest's level and prerequisite requirements from its detail page", async () => {
    const upsertedTrader = { id: 1, name: "Prapor", slug: "prapor", tabOrder: 0 };
    const upsertedQuest = {
      id: 1,
      traderId: 1,
      name: "Debut",
      wikiSlug: "Debut",
      wikiUrl: "/wiki/Debut",
      objectives: [],
      rewards: [],
      requiredItems: [],
      requirements: EMPTY_QUEST_REQUIREMENTS,
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
      deactivateNotIn: vi.fn().mockResolvedValue(0),
    };
    const fetchQuestsPageJson = vi.fn().mockResolvedValue(buildFakeApiResponse());
    const fetchQuestDetailJson = vi.fn().mockResolvedValue(buildFakeDetailResponseWithRequirements());
    const downloadTraderImage = vi.fn().mockResolvedValue("/api/trader-images/prapor.png");
    const downloadItemImage = vi.fn().mockResolvedValue(null);

    const service = createScraperService({
      traderRepository,
      questRepository,
      fetchQuestsPageJson,
      fetchQuestDetailJson,
      downloadTraderImage,
      downloadItemImage,
    });
    await service.runScrape();

    expect(questRepository.upsertBySlug).toHaveBeenCalledWith(
      expect.objectContaining({
        requirements: { minLevel: 30, prerequisiteQuestSlugs: ["Debut"], loyaltyNotes: [] },
      })
    );
  });

  it("keeps a divider entry between alternative items and never tries to download an icon for it", async () => {
    const upsertedTrader = { id: 1, name: "Prapor", slug: "prapor", tabOrder: 0 };
    const upsertedQuest = {
      id: 1,
      traderId: 1,
      name: "Debut",
      wikiSlug: "Debut",
      wikiUrl: "/wiki/Debut",
      objectives: [],
      rewards: [],
      requiredItems: [],
      requirements: EMPTY_QUEST_REQUIREMENTS,
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
      deactivateNotIn: vi.fn().mockResolvedValue(0),
    };
    const fetchQuestsPageJson = vi.fn().mockResolvedValue(buildFakeApiResponse());
    const fetchQuestDetailJson = vi.fn().mockResolvedValue(buildFakeDetailResponseWithAlternatives());
    const downloadTraderImage = vi.fn().mockResolvedValue("/api/trader-images/prapor.png");
    const downloadItemImage = vi.fn().mockResolvedValue("/api/item-images/item.png");

    const service = createScraperService({
      traderRepository,
      questRepository,
      fetchQuestsPageJson,
      fetchQuestDetailJson,
      downloadTraderImage,
      downloadItemImage,
    });
    await service.runScrape();

    expect(downloadItemImage).toHaveBeenCalledTimes(2);
    expect(questRepository.upsertBySlug).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredItems: [
          expect.objectContaining({ kind: "item", name: "RSP-30 reactive signal cartridge (Yellow)" }),
          { kind: "divider", label: "OR" },
          expect.objectContaining({ kind: "item", name: "ZiD SP-81 26x75 signal pistol" }),
        ],
      })
    );
  });

  it("reports the failure, uses an empty required-items list, and keeps scraping when a quest's detail-page fetch fails", async () => {
    const upsertedTrader = { id: 1, name: "Prapor", slug: "prapor", tabOrder: 0 };
    const upsertedQuest = {
      id: 1,
      traderId: 1,
      name: "Debut",
      wikiSlug: "Debut",
      wikiUrl: "/wiki/Debut",
      objectives: [],
      rewards: [],
      requiredItems: [],
      requirements: EMPTY_QUEST_REQUIREMENTS,
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
      deactivateNotIn: vi.fn().mockResolvedValue(0),
    };
    const fetchQuestsPageJson = vi.fn().mockResolvedValue(buildFakeApiResponse());
    const fetchQuestDetailJson = vi.fn().mockRejectedValue(new Error("HTTP 503"));
    const downloadTraderImage = vi.fn().mockResolvedValue(null);
    const downloadItemImage = vi.fn();

    const service = createScraperService({
      traderRepository,
      questRepository,
      fetchQuestsPageJson,
      fetchQuestDetailJson,
      downloadTraderImage,
      downloadItemImage,
    });
    const summary = await service.runScrape();

    expect(summary.totalQuests).toBe(1);
    expect(summary.detailFetchFailures).toBe(1);
    expect(downloadItemImage).not.toHaveBeenCalled();
    expect(questRepository.upsertBySlug).toHaveBeenCalledWith(
      expect.objectContaining({ requiredItems: [], requirements: EMPTY_QUEST_REQUIREMENTS })
    );
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
    const fetchQuestDetailJson = vi.fn();
    const downloadTraderImage = vi.fn().mockResolvedValue(null);
    const downloadItemImage = vi.fn();

    const service = createScraperService({
      traderRepository,
      questRepository,
      fetchQuestsPageJson,
      fetchQuestDetailJson,
      downloadTraderImage,
      downloadItemImage,
    });

    await expect(service.runScrape()).rejects.toThrow(
      "Scrape parsed 0 quests; refusing to deactivate the entire database"
    );
    expect(questRepository.deactivateNotIn).not.toHaveBeenCalled();
  });
});
