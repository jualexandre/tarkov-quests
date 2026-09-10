import type { TraderRepository } from "../traders/trader.types";
import type { QuestRepository, RequiredItem } from "../quests/quest.types";
import { parseQuestsPage, parseRequiredItems } from "./wiki-parser";
import { mapWithConcurrency } from "./concurrency";
import type { ScraperService, ScrapeSummary } from "./scraper.types";

const QUESTS_PAGE_API_URL =
  "https://escapefromtarkov.fandom.com/api.php?action=parse&page=Quests&format=json&prop=text";
const DETAIL_FETCH_CONCURRENCY = 8;
const ICON_DOWNLOAD_CONCURRENCY = 8;
const REQUEST_TIMEOUT_MS = 20_000;

export async function fetchQuestsPageJson(): Promise<string> {
  const response = await fetch(QUESTS_PAGE_API_URL, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch quests page: HTTP ${response.status}`);
  }
  return response.text();
}

export async function fetchQuestDetailJson(wikiSlug: string): Promise<string> {
  const url = `https://escapefromtarkov.fandom.com/api.php?action=parse&page=${wikiSlug}&format=json&prop=text`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch quest detail page for "${wikiSlug}": HTTP ${response.status}`);
  }
  return response.text();
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, "-");
}

function rawItemSlug(wikiUrl: string | null, fallbackName: string): string {
  if (wikiUrl) {
    const marker = "/wiki/";
    const index = wikiUrl.indexOf(marker);
    if (index !== -1) {
      return wikiUrl.slice(index + marker.length).split(/[?#]/)[0];
    }
  }
  return slugify(fallbackName);
}

/**
 * The wiki is third-party, user-editable HTML, and the slug ends up in a filesystem
 * path. Reduce it to a safe single path segment so it can never traverse directories.
 */
function itemSlugFromWikiUrl(wikiUrl: string | null, fallbackName: string): string {
  return rawItemSlug(wikiUrl, fallbackName).replace(/[^A-Za-z0-9_-]/g, "_");
}

export interface ScraperServiceDeps {
  traderRepository: TraderRepository;
  questRepository: QuestRepository;
  fetchQuestsPageJson: () => Promise<string>;
  fetchQuestDetailJson: (wikiSlug: string) => Promise<string>;
  downloadTraderImage: (imageUrl: string | null, slug: string) => Promise<string | null>;
  downloadItemImage: (imageUrl: string | null, slug: string) => Promise<string | null>;
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

      // Phase A: fetch and parse each quest's detail page. Icon URLs stay remote here.
      const requiredItemsByWikiSlug = new Map<string, RequiredItem[]>();
      let detailFetchFailures = 0;
      await mapWithConcurrency(questsToUpsert, DETAIL_FETCH_CONCURRENCY, async ({ parsedQuest }) => {
        try {
          const detailJson = await deps.fetchQuestDetailJson(parsedQuest.wikiSlug);
          requiredItemsByWikiSlug.set(parsedQuest.wikiSlug, parseRequiredItems(detailJson));
        } catch (err) {
          detailFetchFailures += 1;
          console.warn(
            `Failed to fetch required items for "${parsedQuest.wikiSlug}": ${(err as Error).message}`
          );
          requiredItemsByWikiSlug.set(parsedQuest.wikiSlug, []);
        }
      });

      // Phase B: download every item icon under a single global concurrency bound.
      // `.flat()` keeps the same object references held by the per-quest arrays above,
      // so mutating `iconUrl` in place updates what the upsert loop reads.
      const allRequiredItems = [...requiredItemsByWikiSlug.values()].flat();
      await mapWithConcurrency(allRequiredItems, ICON_DOWNLOAD_CONCURRENCY, async (item) => {
        item.iconUrl = await deps.downloadItemImage(
          item.iconUrl,
          itemSlugFromWikiUrl(item.wikiUrl, item.name)
        );
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

      return { added, updated, deactivated, totalQuests: seenSlugs.length, detailFetchFailures };
    },
  };
}
