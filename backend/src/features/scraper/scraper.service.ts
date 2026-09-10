import type { TraderRepository } from "../traders/trader.types";
import type { QuestRepository, RequiredItem } from "../quests/quest.types";
import { parseQuestsPage, parseRequiredItems } from "./wiki-parser";
import { mapWithConcurrency } from "./concurrency";
import type { ScraperService, ScrapeSummary } from "./scraper.types";

const QUESTS_PAGE_API_URL =
  "https://escapefromtarkov.fandom.com/api.php?action=parse&page=Quests&format=json&prop=text";
const DETAIL_FETCH_CONCURRENCY = 8;

export async function fetchQuestsPageJson(): Promise<string> {
  const response = await fetch(QUESTS_PAGE_API_URL, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch quests page: HTTP ${response.status}`);
  }
  return response.text();
}

export async function fetchQuestDetailJson(wikiSlug: string): Promise<string> {
  const url = `https://escapefromtarkov.fandom.com/api.php?action=parse&page=${wikiSlug}&format=json&prop=text`;
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) {
    throw new Error(`Failed to fetch quest detail page for "${wikiSlug}": HTTP ${response.status}`);
  }
  return response.text();
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, "-");
}

function itemSlugFromWikiUrl(wikiUrl: string | null, fallbackName: string): string {
  if (wikiUrl) {
    const marker = "/wiki/";
    const index = wikiUrl.indexOf(marker);
    if (index !== -1) {
      return wikiUrl.slice(index + marker.length).split(/[?#]/)[0];
    }
  }
  return slugify(fallbackName);
}

export interface ScraperServiceDeps {
  traderRepository: TraderRepository;
  questRepository: QuestRepository;
  fetchQuestsPageJson: () => Promise<string>;
  fetchQuestDetailJson: (wikiSlug: string) => Promise<string>;
  downloadTraderImage: (imageUrl: string | null, slug: string) => Promise<string | null>;
  downloadItemImage: (imageUrl: string | null, slug: string) => Promise<string | null>;
}

async function fetchRequiredItems(
  wikiSlug: string,
  deps: Pick<ScraperServiceDeps, "fetchQuestDetailJson" | "downloadItemImage">
): Promise<RequiredItem[]> {
  try {
    const detailJson = await deps.fetchQuestDetailJson(wikiSlug);
    const items = parseRequiredItems(detailJson);
    return await Promise.all(
      items.map(async (item) => ({
        ...item,
        iconUrl: await deps.downloadItemImage(item.iconUrl, itemSlugFromWikiUrl(item.wikiUrl, item.name)),
      }))
    );
  } catch (err) {
    console.warn(`Failed to fetch required items for "${wikiSlug}": ${(err as Error).message}`);
    return [];
  }
}

export function createScraperService(deps: ScraperServiceDeps): ScraperService {
  return {
    async runScrape(): Promise<ScrapeSummary> {
      const json = await deps.fetchQuestsPageJson();
      const parsedTraders = parseQuestsPage(json);

      const questsToUpsert: Array<{
        traderId: number;
        parsedQuest: (typeof parsedTraders)[number]["quests"][number];
      }> = [];

      for (const parsedTrader of parsedTraders) {
        const slug = slugify(parsedTrader.name);
        const imageUrl = await deps.downloadTraderImage(parsedTrader.imageUrl, slug);
        const trader = await deps.traderRepository.upsertByName({
          name: parsedTrader.name,
          slug,
          tabOrder: parsedTrader.tabOrder,
          imageUrl,
        });

        for (const parsedQuest of parsedTrader.quests) {
          questsToUpsert.push({ traderId: trader.id, parsedQuest });
        }
      }

      const requiredItemsByWikiSlug = new Map<string, RequiredItem[]>();
      await mapWithConcurrency(questsToUpsert, DETAIL_FETCH_CONCURRENCY, async ({ parsedQuest }) => {
        const items = await fetchRequiredItems(parsedQuest.wikiSlug, deps);
        requiredItemsByWikiSlug.set(parsedQuest.wikiSlug, items);
      });

      const existingGrouped = await deps.questRepository.findAllActiveGroupedByTrader();
      const existingSlugs = new Set<string>(
        existingGrouped.flatMap((trader) => trader.quests.map((q) => q.wikiSlug))
      );

      let added = 0;
      let updated = 0;
      const seenSlugs: string[] = [];

      for (const { traderId, parsedQuest } of questsToUpsert) {
        const quest = await deps.questRepository.upsertBySlug({
          traderId,
          name: parsedQuest.name,
          wikiSlug: parsedQuest.wikiSlug,
          wikiUrl: parsedQuest.wikiUrl,
          objectives: parsedQuest.objectives,
          rewards: parsedQuest.rewards,
          requiredItems: requiredItemsByWikiSlug.get(parsedQuest.wikiSlug) ?? [],
        });
        seenSlugs.push(quest.wikiSlug);
        if (existingSlugs.has(parsedQuest.wikiSlug)) updated += 1;
        else added += 1;
      }

      if (seenSlugs.length === 0) {
        throw new Error("Scrape parsed 0 quests; refusing to deactivate the entire database");
      }

      const deactivated = await deps.questRepository.deactivateNotIn(seenSlugs);

      return { added, updated, deactivated, totalQuests: seenSlugs.length };
    },
  };
}
