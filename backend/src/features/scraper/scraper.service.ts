import type { TraderRepository } from "../traders/trader.types";
import type { QuestRepository } from "../quests/quest.types";
import { parseQuestsPage } from "./wiki-parser";
import type { ScraperService, ScrapeSummary } from "./scraper.types";

const QUESTS_PAGE_API_URL =
  "https://escapefromtarkov.fandom.com/api.php?action=parse&page=Quests&format=json&prop=text";

export async function fetchQuestsPageJson(): Promise<string> {
  const response = await fetch(QUESTS_PAGE_API_URL, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch quests page: HTTP ${response.status}`);
  }
  return response.text();
}

function slugifyTraderName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, "-");
}

export interface ScraperServiceDeps {
  traderRepository: TraderRepository;
  questRepository: QuestRepository;
  fetchQuestsPageJson: () => Promise<string>;
}

export function createScraperService(deps: ScraperServiceDeps): ScraperService {
  return {
    async runScrape(): Promise<ScrapeSummary> {
      const json = await deps.fetchQuestsPageJson();
      const parsedTraders = parseQuestsPage(json);

      let added = 0;
      let updated = 0;
      const seenSlugs: string[] = [];

      for (const parsedTrader of parsedTraders) {
        const trader = await deps.traderRepository.upsertByName({
          name: parsedTrader.name,
          slug: slugifyTraderName(parsedTrader.name),
          tabOrder: parsedTrader.tabOrder,
        });

        for (const parsedQuest of parsedTrader.quests) {
          const existingCount = await countExistingBySlug(deps.questRepository, parsedQuest.wikiSlug);
          const quest = await deps.questRepository.upsertBySlug({
            traderId: trader.id,
            name: parsedQuest.name,
            wikiSlug: parsedQuest.wikiSlug,
            wikiUrl: parsedQuest.wikiUrl,
            objectives: parsedQuest.objectives,
            rewards: parsedQuest.rewards,
          });
          seenSlugs.push(quest.wikiSlug);
          if (existingCount === 0) added += 1;
          else updated += 1;
        }
      }

      const deactivated = await deps.questRepository.deactivateNotIn(seenSlugs);

      return { added, updated, deactivated, totalQuests: seenSlugs.length };
    },
  };
}

async function countExistingBySlug(
  questRepository: QuestRepository,
  wikiSlug: string
): Promise<number> {
  const grouped = await questRepository.findAllActiveGroupedByTrader();
  const exists = grouped.some((trader) => trader.quests.some((q) => q.wikiSlug === wikiSlug));
  return exists ? 1 : 0;
}
