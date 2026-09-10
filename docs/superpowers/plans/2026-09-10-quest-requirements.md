# Quest Requirements & Lock State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse each quest's level and prior-quest requirements from its wiki detail page, store them, and show them in the UI — graying out a quest (with a lock icon and tooltip) while a player-entered character level or an incomplete prerequisite quest keeps it out of reach.

**Architecture:** Backend: a new `parseRequirements()` reads the same per-quest detail-page HTML already fetched for required items (no new HTTP call), producing `{ minLevel, prerequisiteQuestSlugs, loyaltyNotes }`, stored as a new JSON column on `Quest`. Frontend: a pure function (`evaluateRequirements`) combines a quest's `requirements` with a player-entered level (persisted in `localStorage`) and a cross-trader map of `wikiSlug → { name, completed }` (derived from all loaded traders) into a `locked` verdict, rendered by a small presentational component nested under the existing "Show on Wiki" link.

**Tech Stack:** Node/Express/Prisma/cheerio (backend), Angular 22 standalone components + NGXS (frontend), Vitest on both sides.

**Spec:** `docs/superpowers/specs/2026-09-10-quest-requirements-design.md`

## Global Constraints

- Trader loyalty-level requirements are display-only info and never gray out a quest (this app tracks no trader reputation).
- No heuristic inference of prerequisites from quest naming (e.g. "Part 3" needing "Part 2") — only what the wiki's own "Previous:" data expresses.
- A prerequisite `wikiSlug` not found in our own quest set is ignored for gating (fails open), never grays out the quest.
- The completion checkbox stays clickable regardless of lock state.
- Run backend tests with: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml run --rm backend npm test` (optionally append `-- <path-fragment>` to filter, e.g. `-- wiki-parser`).
- Run frontend tests with: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml run --rm frontend npm test`.
- Never run `npm test`/`npm run dev`/`npm start` directly on the host — this project is only ever run through Docker Compose.

---

## Task 1: Backend data model for quest requirements

**Files:**
- Modify: `backend/src/features/quests/quest.types.ts`
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/features/quests/quest.repository.ts`
- Modify: `backend/src/features/quests/quest.repository.test.ts`
- Modify: `backend/src/features/quests/quest.routes.test.ts`
- Modify: `backend/src/features/scraper/scraper.service.ts`
- Modify: `backend/src/features/scraper/scraper.service.test.ts`

**Interfaces:**
- Produces: `QuestRequirements` (`{ minLevel: number | null; prerequisiteQuestSlugs: string[]; loyaltyNotes: string[] }`) and `EMPTY_QUEST_REQUIREMENTS` constant, both exported from `backend/src/features/quests/quest.types.ts`. `Quest.requirements: QuestRequirements` and `UpsertQuestInput.requirements: QuestRequirements` are now required fields used by every later backend task.

- [ ] **Step 1: Add the `QuestRequirements` type and extend `Quest`/`UpsertQuestInput`**

In `backend/src/features/quests/quest.types.ts`, add this new interface and constant right after the `RequiredItemEntry` type union (before `export interface Quest`):

```ts
export interface QuestRequirements {
  minLevel: number | null;
  prerequisiteQuestSlugs: string[];
  loyaltyNotes: string[];
}

export const EMPTY_QUEST_REQUIREMENTS: QuestRequirements = {
  minLevel: null,
  prerequisiteQuestSlugs: [],
  loyaltyNotes: [],
};
```

Then extend `Quest` and `UpsertQuestInput` to include it, right after their existing `requiredItems` field:

```ts
export interface Quest {
  id: number;
  traderId: number;
  name: string;
  wikiSlug: string;
  wikiUrl: string;
  objectives: string[];
  rewards: string[];
  requiredItems: RequiredItemEntry[];
  requirements: QuestRequirements;
  completed: boolean;
  active: boolean;
  lastSeenAt: Date;
}
```

```ts
export interface UpsertQuestInput {
  traderId: number;
  name: string;
  wikiSlug: string;
  wikiUrl: string;
  objectives: string[];
  rewards: string[];
  requiredItems: RequiredItemEntry[];
  requirements: QuestRequirements;
}
```

- [ ] **Step 2: Add the Prisma column**

In `backend/prisma/schema.prisma`, add this field to `model Quest`, right after `requiredItems`:

```prisma
  requirements  String   @default("{\"minLevel\":null,\"prerequisiteQuestSlugs\":[],\"loyaltyNotes\":[]}")
```

- [ ] **Step 3: Serialize/deserialize `requirements` in the repository**

In `backend/src/features/quests/quest.repository.ts`, add `requirements: string;` to the `toQuest` row parameter type, and `requirements: JSON.parse(row.requirements),` to its returned object:

```ts
function toQuest(row: {
  id: number;
  traderId: number;
  name: string;
  wikiSlug: string;
  wikiUrl: string;
  objectives: string;
  rewards: string;
  requiredItems: string;
  requirements: string;
  completed: boolean;
  active: boolean;
  lastSeenAt: Date;
}): Quest {
  return {
    ...row,
    objectives: JSON.parse(row.objectives),
    rewards: JSON.parse(row.rewards),
    requiredItems: JSON.parse(row.requiredItems),
    requirements: JSON.parse(row.requirements),
  };
}
```

In `upsertBySlug`, add `requirements: JSON.stringify(input.requirements),` to the `data` object:

```ts
  async upsertBySlug(input: UpsertQuestInput): Promise<Quest> {
    const data = {
      traderId: input.traderId,
      name: input.name,
      wikiUrl: input.wikiUrl,
      objectives: JSON.stringify(input.objectives),
      rewards: JSON.stringify(input.rewards),
      requiredItems: JSON.stringify(input.requiredItems),
      requirements: JSON.stringify(input.requirements),
      active: true,
      lastSeenAt: new Date(),
    };
    const row = await this.prisma.quest.upsert({
      where: { wikiSlug: input.wikiSlug },
      create: { ...data, wikiSlug: input.wikiSlug },
      update: data,
    });
    return toQuest(row);
  }
```

- [ ] **Step 4: Add the repository round-trip test**

In `backend/src/features/quests/quest.repository.test.ts`, add `EMPTY_QUEST_REQUIREMENTS` and `QuestRequirements` to the existing type-only import from `./quest.types`, then add this test right after the `"stores and returns requiredItems through JSON encoding"` test:

```ts
  it("stores and returns requirements through JSON encoding", async () => {
    const requirements: QuestRequirements = {
      minLevel: 30,
      prerequisiteQuestSlugs: ["The_Punisher_-_Part_2"],
      loyaltyNotes: ["Must reach Loyalty Level 2 with Prapor to obtain this quest."],
    };
    const quest = await repo.upsertBySlug({
      traderId,
      name: "The Punisher - Part 3",
      wikiSlug: "The_Punisher_-_Part_3",
      wikiUrl: "/wiki/The_Punisher_-_Part_3",
      objectives: [],
      rewards: [],
      requiredItems: [],
      requirements,
    });
    expect(quest.requirements).toEqual(requirements);
  });
```

- [ ] **Step 5: Fix every other `upsertBySlug` call in this file to pass `requirements`**

`UpsertQuestInput.requirements` is now required, so every other call in `quest.repository.test.ts` needs `requirements: EMPTY_QUEST_REQUIREMENTS,` added right after its `requiredItems: [...]`/`requiredItems: []` line. There are 8 other calls in this file:
- 1 in "creates a quest on first upsert with completed defaulting to false"
- 1 in "stores and returns requiredItems through JSON encoding" (its `requiredItems: [item],` line — this test still needs `requirements` even though it isn't testing that field)
- 2 in "preserves completed=true across a second upsert of the same wikiSlug" (`first` and `second`)
- 2 in "findAllActiveGroupedByTrader returns only active quests, grouped and ordered by trader tabOrder" (the "Debut" and "Old Quest" calls)
- 2 in "deactivateNotIn returns the count of quests it deactivated" (the "Debut" and "Delivery from the Past" calls)

Add the line to each.

- [ ] **Step 6: Fix `quest.routes.test.ts`'s mocked quest**

In `backend/src/features/quests/quest.routes.test.ts`, add `import { EMPTY_QUEST_REQUIREMENTS } from "./quest.types";` and add `requirements: EMPTY_QUEST_REQUIREMENTS,` to the `updatedQuest` object literal, right after its `requiredItems: [],` line.

- [ ] **Step 7: Fix `scraper.service.ts` to satisfy the new required field**

In `backend/src/features/scraper/scraper.service.ts`, change the type-only import to also bring in `QuestRequirements`, and add a plain (non-type) import for `EMPTY_QUEST_REQUIREMENTS`:

```ts
import type { QuestRepository, RequiredItem, RequiredItemEntry, QuestRequirements } from "../quests/quest.types";
import { EMPTY_QUEST_REQUIREMENTS } from "../quests/quest.types";
```

Then add `requirements: EMPTY_QUEST_REQUIREMENTS,` to the `questRepository.upsertBySlug` call inside `runScrape()`, right after its `requiredItems: requiredItemsByWikiSlug.get(parsedQuest.wikiSlug) ?? [],` line. (Task 3 replaces this placeholder with real parsed data — for now every scraped quest gets the empty default, keeping the build green.)

- [ ] **Step 8: Fix every `scraper.service.test.ts` quest fixture and assertion**

In `backend/src/features/scraper/scraper.service.test.ts`, add `import { EMPTY_QUEST_REQUIREMENTS } from "../quests/quest.types";`. Add `requirements: EMPTY_QUEST_REQUIREMENTS,` to each of the four `upsertedQuest` object literals (right after their `requiredItems: [],` line): in "upserts the trader and quest...", "fetches, parses, and localizes required items...", "keeps a divider entry...", and "reports the failure...". Also add `requirements: EMPTY_QUEST_REQUIREMENTS,` to the exact-match expectation in the first test ("upserts the trader and quest parsed from the page..."):

```ts
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
```

- [ ] **Step 9: Run the backend test suite and verify it passes**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml run --rm backend npm test`
Expected: all test files pass, including the new "stores and returns requirements through JSON encoding" test.

- [ ] **Step 10: Commit**

```bash
git add backend/src/features/quests/quest.types.ts backend/prisma/schema.prisma \
  backend/src/features/quests/quest.repository.ts backend/src/features/quests/quest.repository.test.ts \
  backend/src/features/quests/quest.routes.test.ts backend/src/features/scraper/scraper.service.ts \
  backend/src/features/scraper/scraper.service.test.ts
git commit -m "$(cat <<'EOF'
feat(backend): add quest requirements data model

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Parse level/prerequisite requirements from a quest's detail page

**Files:**
- Modify: `backend/src/features/scraper/wiki-parser.ts`
- Modify: `backend/src/features/scraper/wiki-parser.test.ts`

**Interfaces:**
- Consumes: `QuestRequirements`, `EMPTY_QUEST_REQUIREMENTS` from Task 1 (`../quests/quest.types`).
- Produces: `parseRequirements(apiResponseJson: string): QuestRequirements`, exported from `wiki-parser.ts`, consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

In `backend/src/features/scraper/wiki-parser.test.ts`, add `parseRequirements` to the import from `./wiki-parser`, then add this new `describe` block at the end of the file:

```ts
describe("parseRequirements", () => {
  function buildDetailJson(bodyHtml: string): string {
    return JSON.stringify({ parse: { text: { "*": bodyHtml } } });
  }

  it("returns all-empty defaults when the page has neither a Requirements section nor a Related quests block", () => {
    const requirements = parseRequirements(buildDetailJson("<p>Nothing here.</p>"));
    expect(requirements).toEqual({ minLevel: null, prerequisiteQuestSlugs: [], loyaltyNotes: [] });
  });

  it("parses a plain level requirement", () => {
    const html = `
      <h2><span class="mw-headline" id="Requirements">Requirements</span></h2>
      <ul><li>Must be level 30 to start this quest.</li></ul>
    `;
    const requirements = parseRequirements(buildDetailJson(html));
    expect(requirements.minLevel).toBe(30);
    expect(requirements.loyaltyNotes).toEqual([]);
  });

  it("keeps a loyalty-level line as an informational note instead of a level requirement", () => {
    const html = `
      <h2><span class="mw-headline" id="Requirements">Requirements</span></h2>
      <ul><li>Must reach Loyalty Level 2 with <a href="/wiki/Prapor">Prapor</a> to obtain this quest.</li></ul>
    `;
    const requirements = parseRequirements(buildDetailJson(html));
    expect(requirements.minLevel).toBeNull();
    expect(requirements.loyaltyNotes).toHaveLength(1);
    expect(requirements.loyaltyNotes[0]).toContain("Loyalty Level 2");
    expect(requirements.loyaltyNotes[0]).toContain("Prapor");
  });

  it("parses both a level requirement and a loyalty note from the same page", () => {
    const html = `
      <h2><span class="mw-headline" id="Requirements">Requirements</span></h2>
      <ul>
        <li>Must be level 27 to start this quest.</li>
        <li>Must reach Loyalty Level 4 with <a href="/wiki/Mechanic">Mechanic</a> to obtain this quest.</li>
      </ul>
    `;
    const requirements = parseRequirements(buildDetailJson(html));
    expect(requirements.minLevel).toBe(27);
    expect(requirements.loyaltyNotes).toHaveLength(1);
    expect(requirements.loyaltyNotes[0]).toContain("Mechanic");
  });

  it("keeps links inside a loyalty note absolute and opening in a new tab", () => {
    const html = `
      <h2><span class="mw-headline" id="Requirements">Requirements</span></h2>
      <ul><li>Must reach Loyalty Level 2 with <a href="/wiki/Prapor">Prapor</a> to obtain this quest.</li></ul>
    `;
    const requirements = parseRequirements(buildDetailJson(html));
    expect(requirements.loyaltyNotes[0]).toContain('href="https://escapefromtarkov.fandom.com/wiki/Prapor"');
    expect(requirements.loyaltyNotes[0]).toContain('target="_blank"');
  });

  it("parses a single prerequisite quest from the Related quests infobox", () => {
    const html = `
      <table class="va-infobox-group"><tbody>
        <tr><th class="va-infobox-header" colspan="3">Related quests</th></tr>
        <tr>
          <td class="va-infobox-content">Previous:<br /><a href="/wiki/The_Punisher_-_Part_2">The Punisher - Part 2</a></td>
          <td class="va-infobox-content">Leads to:<br /><a href="/wiki/The_Punisher_-_Part_4">The Punisher - Part 4</a></td>
        </tr>
      </tbody></table>
    `;
    const requirements = parseRequirements(buildDetailJson(html));
    expect(requirements.prerequisiteQuestSlugs).toEqual(["The_Punisher_-_Part_2"]);
  });

  it("parses multiple prerequisite quests when Previous lists more than one link", () => {
    const html = `
      <table class="va-infobox-group"><tbody>
        <tr><th class="va-infobox-header" colspan="3">Related quests</th></tr>
        <tr>
          <td class="va-infobox-content">Previous:<br /><a href="/wiki/Quest_A">Quest A</a><br /><a href="/wiki/Quest_B">Quest B</a></td>
          <td class="va-infobox-content">Leads to:<br /><a href="/wiki/Quest_C">Quest C</a></td>
        </tr>
      </tbody></table>
    `;
    const requirements = parseRequirements(buildDetailJson(html));
    expect(requirements.prerequisiteQuestSlugs).toEqual(["Quest_A", "Quest_B"]);
  });

  it("returns no prerequisites when Previous is the '-' placeholder (first quest in a chain)", () => {
    const html = `
      <table class="va-infobox-group"><tbody>
        <tr><th class="va-infobox-header" colspan="3">Related quests</th></tr>
        <tr>
          <td class="va-infobox-content">Previous:<br />-</td>
          <td class="va-infobox-content">Leads to:<br /><a href="/wiki/The_Punisher_-_Part_2">The Punisher - Part 2</a></td>
        </tr>
      </tbody></table>
    `;
    const requirements = parseRequirements(buildDetailJson(html));
    expect(requirements.prerequisiteQuestSlugs).toEqual([]);
  });

  it("returns no prerequisites when the page has no Related quests infobox at all", () => {
    const requirements = parseRequirements(buildDetailJson("<p>Standalone quest, no chain.</p>"));
    expect(requirements.prerequisiteQuestSlugs).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml run --rm backend npm test -- wiki-parser`
Expected: FAIL with `parseRequirements is not a function` (or a TypeScript error that it doesn't exist on the module).

- [ ] **Step 3: Implement `parseRequirements`**

In `backend/src/features/scraper/wiki-parser.ts`, change the type-only import at the top to include `QuestRequirements`:

```ts
import type { RequiredItemEntry, QuestRequirements } from "../quests/quest.types";
```

Then add this at the end of the file:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml run --rm backend npm test -- wiki-parser`
Expected: PASS, all `parseRequirements` tests green, no regressions in the existing `parseQuestsPage`/`parseRequiredItems` tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/features/scraper/wiki-parser.ts backend/src/features/scraper/wiki-parser.test.ts
git commit -m "$(cat <<'EOF'
feat(backend): parse quest level and prerequisite requirements from the wiki

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wire `parseRequirements` into the scraper

**Files:**
- Modify: `backend/src/features/scraper/scraper.service.ts`
- Modify: `backend/src/features/scraper/scraper.service.test.ts`

**Interfaces:**
- Consumes: `parseRequirements` from Task 2, `EMPTY_QUEST_REQUIREMENTS`/`QuestRequirements` already imported in Task 1.

- [ ] **Step 1: Write the failing test**

In `backend/src/features/scraper/scraper.service.test.ts`, add this fixture builder next to the other `buildFakeDetailResponseWith*` functions:

```ts
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
```

Then add this test after "fetches, parses, and localizes required items from each quest's detail page":

```ts
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
```

Also update the existing "reports the failure, uses an empty required-items list, and keeps scraping when a quest's detail-page fetch fails" test's final assertion to also cover `requirements`:

```ts
    expect(questRepository.upsertBySlug).toHaveBeenCalledWith(
      expect.objectContaining({ requiredItems: [], requirements: EMPTY_QUEST_REQUIREMENTS })
    );
```

- [ ] **Step 2: Run the tests to verify the new one fails**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml run --rm backend npm test -- scraper.service`
Expected: FAIL on the new test — `requirements` is `EMPTY_QUEST_REQUIREMENTS` (the Task 1 placeholder) instead of the parsed value.

- [ ] **Step 3: Wire the real parser into `runScrape`**

In `backend/src/features/scraper/scraper.service.ts`, change the wiki-parser import to also bring in `parseRequirements`:

```ts
import { parseQuestsPage, parseRequiredItems, parseRequirements } from "./wiki-parser";
```

Replace the Phase A block:

```ts
      const requiredItemsByWikiSlug = new Map<string, RequiredItemEntry[]>();
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
```

with:

```ts
      const requiredItemsByWikiSlug = new Map<string, RequiredItemEntry[]>();
      const requirementsByWikiSlug = new Map<string, QuestRequirements>();
      let detailFetchFailures = 0;
      await mapWithConcurrency(questsToUpsert, DETAIL_FETCH_CONCURRENCY, async ({ parsedQuest }) => {
        try {
          const detailJson = await deps.fetchQuestDetailJson(parsedQuest.wikiSlug);
          requiredItemsByWikiSlug.set(parsedQuest.wikiSlug, parseRequiredItems(detailJson));
          requirementsByWikiSlug.set(parsedQuest.wikiSlug, parseRequirements(detailJson));
        } catch (err) {
          detailFetchFailures += 1;
          console.warn(
            `Failed to fetch required items for "${parsedQuest.wikiSlug}": ${(err as Error).message}`
          );
          requiredItemsByWikiSlug.set(parsedQuest.wikiSlug, []);
          requirementsByWikiSlug.set(parsedQuest.wikiSlug, EMPTY_QUEST_REQUIREMENTS);
        }
      });
```

And in the upsert loop, replace the placeholder line:

```ts
          requiredItems: requiredItemsByWikiSlug.get(parsedQuest.wikiSlug) ?? [],
          requirements: EMPTY_QUEST_REQUIREMENTS,
```

with:

```ts
          requiredItems: requiredItemsByWikiSlug.get(parsedQuest.wikiSlug) ?? [],
          requirements: requirementsByWikiSlug.get(parsedQuest.wikiSlug) ?? EMPTY_QUEST_REQUIREMENTS,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml run --rm backend npm test`
Expected: PASS, full backend suite green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/features/scraper/scraper.service.ts backend/src/features/scraper/scraper.service.test.ts
git commit -m "$(cat <<'EOF'
feat(backend): populate quest requirements during scraping

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Frontend requirements DTO and pure lock-evaluation logic

**Files:**
- Modify: `frontend/src/app/core/api/quests.api.ts`
- Create: `frontend/src/app/core/quest-lock.ts`
- Create: `frontend/src/app/core/quest-lock.spec.ts`
- Modify: `frontend/src/app/features/quests/quest-table/quest-table.component.spec.ts`
- Modify: `frontend/src/app/features/quests/search-results/search-results.component.spec.ts`
- Modify: `frontend/src/app/features/quests/quests-page/quests-page.component.spec.ts`

**Interfaces:**
- Produces: `QuestRequirementsDto` (`quests.api.ts`) added to `QuestDto.requirements`. `evaluateRequirements(requirements, playerLevel, completionBySlug): RequirementsStatus`, `QuestCompletionInfo`, `PrerequisiteStatus`, `RequirementsStatus` from `core/quest-lock.ts`, consumed by Tasks 6-8.

- [ ] **Step 1: Add `QuestRequirementsDto` and extend `QuestDto`**

In `frontend/src/app/core/api/quests.api.ts`, add this interface right after `RequiredItemEntryDto`:

```ts
export interface QuestRequirementsDto {
  minLevel: number | null;
  prerequisiteQuestSlugs: string[];
  loyaltyNotes: string[];
}
```

Then add `requirements: QuestRequirementsDto;` to `QuestDto`, right after `requiredItems`:

```ts
export interface QuestDto {
  id: number;
  traderId: number;
  name: string;
  wikiSlug: string;
  wikiUrl: string;
  objectives: string[];
  rewards: string[];
  requiredItems: RequiredItemEntryDto[];
  requirements: QuestRequirementsDto;
  completed: boolean;
  active: boolean;
  lastSeenAt: string;
}
```

- [ ] **Step 2: Write the failing tests for `evaluateRequirements`**

Create `frontend/src/app/core/quest-lock.spec.ts`:

```ts
import { evaluateRequirements } from "./quest-lock";

describe("evaluateRequirements", () => {
  const noRequirements = { minLevel: null, prerequisiteQuestSlugs: [], loyaltyNotes: [] };

  it("is not locked and levelMet is null when there is no level requirement and no player level", () => {
    const status = evaluateRequirements(noRequirements, null, new Map());
    expect(status).toEqual({ levelMet: null, prerequisites: [], locked: false });
  });

  it("levelMet is null (unknown) when a level is required but the player level isn't set", () => {
    const status = evaluateRequirements({ ...noRequirements, minLevel: 30 }, null, new Map());
    expect(status.levelMet).toBeNull();
    expect(status.locked).toBe(false);
  });

  it("locks when the player's level is below the required level", () => {
    const status = evaluateRequirements({ ...noRequirements, minLevel: 30 }, 20, new Map());
    expect(status.levelMet).toBe(false);
    expect(status.locked).toBe(true);
  });

  it("does not lock when the player's level meets the requirement", () => {
    const status = evaluateRequirements({ ...noRequirements, minLevel: 30 }, 30, new Map());
    expect(status.levelMet).toBe(true);
    expect(status.locked).toBe(false);
  });

  it("locks when a prerequisite quest is known and not completed", () => {
    const completionBySlug = new Map([["Debut", { name: "Debut", completed: false }]]);
    const status = evaluateRequirements(
      { ...noRequirements, prerequisiteQuestSlugs: ["Debut"] },
      null,
      completionBySlug
    );
    expect(status.prerequisites).toEqual([{ name: "Debut", completed: false }]);
    expect(status.locked).toBe(true);
  });

  it("does not lock when the known prerequisite quest is completed", () => {
    const completionBySlug = new Map([["Debut", { name: "Debut", completed: true }]]);
    const status = evaluateRequirements(
      { ...noRequirements, prerequisiteQuestSlugs: ["Debut"] },
      null,
      completionBySlug
    );
    expect(status.locked).toBe(false);
  });

  it("ignores a prerequisite slug that isn't in the completion map", () => {
    const status = evaluateRequirements(
      { ...noRequirements, prerequisiteQuestSlugs: ["Unknown_Quest"] },
      null,
      new Map()
    );
    expect(status.prerequisites).toEqual([]);
    expect(status.locked).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml run --rm frontend npm test`
Expected: FAIL — `quest-lock.ts` does not exist yet.

- [ ] **Step 4: Implement `evaluateRequirements`**

Create `frontend/src/app/core/quest-lock.ts`:

```ts
import type { QuestRequirementsDto } from "./api/quests.api";

export interface QuestCompletionInfo {
  name: string;
  completed: boolean;
}

export interface PrerequisiteStatus {
  name: string;
  completed: boolean;
}

export interface RequirementsStatus {
  levelMet: boolean | null;
  prerequisites: PrerequisiteStatus[];
  locked: boolean;
}

export function evaluateRequirements(
  requirements: QuestRequirementsDto,
  playerLevel: number | null,
  completionBySlug: ReadonlyMap<string, QuestCompletionInfo>
): RequirementsStatus {
  const levelMet =
    requirements.minLevel === null || playerLevel === null ? null : playerLevel >= requirements.minLevel;

  const prerequisites: PrerequisiteStatus[] = requirements.prerequisiteQuestSlugs
    .map((slug) => completionBySlug.get(slug))
    .filter((entry): entry is QuestCompletionInfo => entry !== undefined)
    .map((entry) => ({ name: entry.name, completed: entry.completed }));

  const locked = levelMet === false || prerequisites.some((p) => !p.completed);

  return { levelMet, prerequisites, locked };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml run --rm frontend npm test`
Expected: the new `quest-lock.spec.ts` tests pass. The overall suite now fails to compile because `QuestDto` requires `requirements` wherever a full quest object is built — fixed in the next step.

- [ ] **Step 6: Fix existing quest fixtures to include `requirements`**

In `frontend/src/app/features/quests/quest-table/quest-table.component.spec.ts`, add `requirements: { minLevel: null, prerequisiteQuestSlugs: [], loyaltyNotes: [] },` to the quest object inside the `trader` constant (right after its `requiredItems: [...]` array), and to the quest object built inside `buildTrader`'s `.map(...)` callback (right after its `requiredItems: [],` line).

In `frontend/src/app/features/quests/search-results/search-results.component.spec.ts`, add the same `requirements: { minLevel: null, prerequisiteQuestSlugs: [], loyaltyNotes: [] },` line to both quest objects in the `results` array (the "Debut" one, after its `requiredItems: [...]`, and the "Shortage" one, after its `requiredItems: []`).

In `frontend/src/app/features/quests/quests-page/quests-page.component.spec.ts`, add `requirements: { minLevel: null, prerequisiteQuestSlugs: [], loyaltyNotes: [] },` to the object returned by the `buildQuest` helper, right after its `requiredItems: [],` line (this is overridable via `overrides` like every other field).

- [ ] **Step 7: Run the full frontend suite and verify it passes**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml run --rm frontend npm test`
Expected: PASS, full frontend suite green (no behavior changes yet — `requirements` is inert data at this point).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/core/api/quests.api.ts frontend/src/app/core/quest-lock.ts frontend/src/app/core/quest-lock.spec.ts \
  frontend/src/app/features/quests/quest-table/quest-table.component.spec.ts \
  frontend/src/app/features/quests/search-results/search-results.component.spec.ts \
  frontend/src/app/features/quests/quests-page/quests-page.component.spec.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add quest requirements DTO and lock-evaluation logic

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `QuestRequirementsComponent` (presentational)

**Files:**
- Create: `frontend/src/app/shared/quest-requirements/quest-requirements.component.ts`
- Create: `frontend/src/app/shared/quest-requirements/quest-requirements.component.html`
- Create: `frontend/src/app/shared/quest-requirements/quest-requirements.component.spec.ts`

**Interfaces:**
- Consumes: `PrerequisiteStatus` from Task 4 (`../../core/quest-lock`).
- Produces: `<app-quest-requirements [minLevel] [levelMet] [prerequisites] [loyaltyNotes]>`, consumed by Task 6.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/shared/quest-requirements/quest-requirements.component.spec.ts`:

```ts
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { QuestRequirementsComponent } from "./quest-requirements.component";

describe("QuestRequirementsComponent", () => {
  let fixture: ComponentFixture<QuestRequirementsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [QuestRequirementsComponent] });
    fixture = TestBed.createComponent(QuestRequirementsComponent);
  });

  it("renders nothing when there are no requirements at all", () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent?.trim()).toBe("");
  });

  it("shows the required level with a checkmark when met", () => {
    fixture.componentRef.setInput("minLevel", 30);
    fixture.componentRef.setInput("levelMet", true);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Level 30 required");
    expect(el.textContent).toContain("✓");
    expect(el.querySelector("span")?.className).toContain("text-green-400");
  });

  it("shows the required level with a lock icon when not met", () => {
    fixture.componentRef.setInput("minLevel", 30);
    fixture.componentRef.setInput("levelMet", false);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("🔒");
    expect(el.querySelector("span")?.className).toContain("text-red-400");
  });

  it("shows the required level with no icon when unknown (player level not entered)", () => {
    fixture.componentRef.setInput("minLevel", 30);
    fixture.componentRef.setInput("levelMet", null);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).not.toContain("✓");
    expect(el.textContent).not.toContain("🔒");
    expect(el.textContent).toContain("Level 30 required");
  });

  it("lists each prerequisite quest with a checkmark or lock icon depending on completion", () => {
    fixture.componentRef.setInput("prerequisites", [
      { name: "The Punisher - Part 1", completed: true },
      { name: "The Punisher - Part 2", completed: false },
    ]);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const spans = Array.from(el.querySelectorAll("span"));
    expect(spans[0].textContent).toContain("✓");
    expect(spans[0].textContent).toContain("The Punisher - Part 1");
    expect(spans[1].textContent).toContain("🔒");
    expect(spans[1].textContent).toContain("The Punisher - Part 2");
  });

  it("renders loyalty notes as informational text", () => {
    fixture.componentRef.setInput("loyaltyNotes", ["Must reach Loyalty Level 2 with Prapor to obtain this quest."]);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Must reach Loyalty Level 2 with Prapor");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml run --rm frontend npm test`
Expected: FAIL — the component doesn't exist yet.

- [ ] **Step 3: Implement the component**

Create `frontend/src/app/shared/quest-requirements/quest-requirements.component.ts`:

```ts
import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import type { PrerequisiteStatus } from "../../core/quest-lock";

@Component({
  selector: "app-quest-requirements",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./quest-requirements.component.html",
  host: { class: "contents" },
})
export class QuestRequirementsComponent {
  @Input() minLevel: number | null = null;
  @Input() levelMet: boolean | null = null;
  @Input() prerequisites: PrerequisiteStatus[] = [];
  @Input() loyaltyNotes: string[] = [];
}
```

Create `frontend/src/app/shared/quest-requirements/quest-requirements.component.html`:

```html
@if (minLevel !== null || prerequisites.length > 0 || loyaltyNotes.length > 0) {
  <div class="mt-1 flex flex-col gap-0.5 text-xs">
    @if (minLevel !== null) {
      <span
        [class.text-green-400]="levelMet === true"
        [class.text-red-400]="levelMet === false"
        [class.text-[var(--color-text-muted)]]="levelMet === null"
      >
        @if (levelMet === true) {
          ✓
        } @else if (levelMet === false) {
          🔒
        }
        Level {{ minLevel }} required
      </span>
    }
    @for (prerequisite of prerequisites; track prerequisite.name) {
      <span [class.text-green-400]="prerequisite.completed" [class.text-red-400]="!prerequisite.completed">
        {{ prerequisite.completed ? "✓" : "🔒" }} {{ prerequisite.name }}
      </span>
    }
    @for (note of loyaltyNotes; track $index) {
      <span class="text-[var(--color-text-muted)]" [innerHTML]="note"></span>
    }
  </div>
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml run --rm frontend npm test`
Expected: PASS, all `QuestRequirementsComponent` tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/shared/quest-requirements/
git commit -m "$(cat <<'EOF'
feat(frontend): add QuestRequirementsComponent

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Lock state in `QuestCellComponent`

**Files:**
- Modify: `frontend/src/app/shared/quest-cell/quest-cell.component.ts`
- Modify: `frontend/src/app/shared/quest-cell/quest-cell.component.html`
- Modify: `frontend/src/app/shared/quest-cell/quest-cell.component.spec.ts`

**Interfaces:**
- Consumes: `evaluateRequirements`, `QuestCompletionInfo`, `RequirementsStatus` from Task 4; `QuestRequirementsComponent` from Task 5; `QuestRequirementsDto` from Task 4.
- Produces: `QuestCellDto.requirements: QuestRequirementsDto`; `QuestCellComponent` inputs `playerLevel: number | null` (default `null`) and `completionBySlug: ReadonlyMap<string, QuestCompletionInfo>` (default empty `Map`), consumed by Task 7.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `frontend/src/app/shared/quest-cell/quest-cell.component.spec.ts` with:

```ts
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { QuestCellComponent } from "./quest-cell.component";
import type { QuestCompletionInfo } from "../../core/quest-lock";

describe("QuestCellComponent", () => {
  let fixture: ComponentFixture<QuestCellComponent>;

  const noRequirements = { minLevel: null, prerequisiteQuestSlugs: [], loyaltyNotes: [] };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [QuestCellComponent] });
    fixture = TestBed.createComponent(QuestCellComponent);
    fixture.componentInstance.quest = {
      id: 1,
      name: "Debut",
      completed: false,
      wikiUrl: "/wiki/Debut",
      requirements: noRequirements,
    };
    fixture.detectChanges();
  });

  it("renders the quest name as plain text alongside a 'Show on Wiki' link to the quest's wiki page", () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Debut");

    const link = el.querySelector("a") as HTMLAnchorElement;
    expect(link.textContent).toContain("Show on Wiki");
    expect(link.href).toContain("/wiki/Debut");
  });

  it("shows the name struck through when completed", () => {
    fixture.componentRef.setInput("quest", {
      id: 1,
      name: "Debut",
      completed: true,
      wikiUrl: "/wiki/Debut",
      requirements: noRequirements,
    });
    fixture.detectChanges();
    const name = (fixture.nativeElement as HTMLElement).querySelector("p") as HTMLElement;
    expect(name.className).toContain("line-through");
  });

  it("emits toggled with the new completed value when the checkbox changes", () => {
    const emitted: Array<{ id: number; completed: boolean }> = [];
    fixture.componentInstance.toggled.subscribe((v) => emitted.push(v));

    const checkbox = (fixture.nativeElement as HTMLElement).querySelector("input[type=checkbox]") as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));

    expect(emitted).toEqual([{ id: 1, completed: true }]);
  });

  it("does not show a lock icon when there are no requirements", () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).not.toContain("🔒");
  });

  it("shows a lock icon and dims the name when the player's level is below the required level", () => {
    fixture.componentRef.setInput("quest", {
      id: 1,
      name: "Fertilizers",
      completed: false,
      wikiUrl: "/wiki/Fertilizers",
      requirements: { minLevel: 30, prerequisiteQuestSlugs: [], loyaltyNotes: [] },
    });
    fixture.componentRef.setInput("playerLevel", 20);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("🔒");
    const name = el.querySelector("p") as HTMLElement;
    expect(name.className).toContain("opacity-60");
  });

  it("does not lock by level when the player level has not been entered", () => {
    fixture.componentRef.setInput("quest", {
      id: 1,
      name: "Fertilizers",
      completed: false,
      wikiUrl: "/wiki/Fertilizers",
      requirements: { minLevel: 30, prerequisiteQuestSlugs: [], loyaltyNotes: [] },
    });
    fixture.componentRef.setInput("playerLevel", null);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).not.toContain("🔒");
  });

  it("shows a lock icon when a prerequisite quest is known and not completed", () => {
    fixture.componentRef.setInput("quest", {
      id: 3,
      name: "The Punisher - Part 3",
      completed: false,
      wikiUrl: "/wiki/The_Punisher_-_Part_3",
      requirements: { minLevel: null, prerequisiteQuestSlugs: ["The_Punisher_-_Part_2"], loyaltyNotes: [] },
    });
    const completionBySlug: ReadonlyMap<string, QuestCompletionInfo> = new Map([
      ["The_Punisher_-_Part_2", { name: "The Punisher - Part 2", completed: false }],
    ]);
    fixture.componentRef.setInput("completionBySlug", completionBySlug);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("🔒");
    expect(el.textContent).toContain("The Punisher - Part 2");
  });

  it("does not lock when the known prerequisite quest is completed", () => {
    fixture.componentRef.setInput("quest", {
      id: 3,
      name: "The Punisher - Part 3",
      completed: false,
      wikiUrl: "/wiki/The_Punisher_-_Part_3",
      requirements: { minLevel: null, prerequisiteQuestSlugs: ["The_Punisher_-_Part_2"], loyaltyNotes: [] },
    });
    const completionBySlug: ReadonlyMap<string, QuestCompletionInfo> = new Map([
      ["The_Punisher_-_Part_2", { name: "The Punisher - Part 2", completed: true }],
    ]);
    fixture.componentRef.setInput("completionBySlug", completionBySlug);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).not.toContain("🔒");
  });

  it("renders loyalty notes as plain informational text without locking the quest", () => {
    fixture.componentRef.setInput("quest", {
      id: 4,
      name: "Setup",
      completed: false,
      wikiUrl: "/wiki/Setup",
      requirements: {
        minLevel: null,
        prerequisiteQuestSlugs: [],
        loyaltyNotes: ["Must reach Loyalty Level 2 with Skier to obtain this quest."],
      },
    });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Must reach Loyalty Level 2 with Skier");
    expect(el.textContent).not.toContain("🔒");
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml run --rm frontend npm test`
Expected: FAIL to compile — `QuestCellDto` has no `requirements` field yet, and `playerLevel`/`completionBySlug` inputs don't exist.

- [ ] **Step 3: Implement lock state in the component**

Replace `frontend/src/app/shared/quest-cell/quest-cell.component.ts` with:

```ts
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { WIKI_BASE_URL } from "../../core/wiki";
import { evaluateRequirements } from "../../core/quest-lock";
import type { QuestCompletionInfo, RequirementsStatus } from "../../core/quest-lock";
import type { QuestRequirementsDto, QuestToggledEvent } from "../../core/api/quests.api";
import { QuestRequirementsComponent } from "../quest-requirements/quest-requirements.component";

export interface QuestCellDto {
  id: number;
  name: string;
  completed: boolean;
  wikiUrl: string;
  requirements: QuestRequirementsDto;
}

@Component({
  selector: "app-quest-cell",
  standalone: true,
  imports: [CommonModule, QuestRequirementsComponent],
  templateUrl: "./quest-cell.component.html",
  host: { class: "contents" },
})
export class QuestCellComponent {
  @Input({ required: true }) quest!: QuestCellDto;
  @Input() playerLevel: number | null = null;
  @Input() completionBySlug: ReadonlyMap<string, QuestCompletionInfo> = new Map();
  @Output() toggled = new EventEmitter<QuestToggledEvent>();

  wikiBaseUrl = WIKI_BASE_URL;

  get requirementsStatus(): RequirementsStatus {
    return evaluateRequirements(this.quest.requirements, this.playerLevel, this.completionBySlug);
  }

  get isLocked(): boolean {
    return this.requirementsStatus.locked;
  }

  get lockTooltip(): string {
    const status = this.requirementsStatus;
    const reasons: string[] = [];
    if (status.levelMet === false) {
      reasons.push(`Requires level ${this.quest.requirements.minLevel}`);
    }
    for (const prerequisite of status.prerequisites) {
      if (!prerequisite.completed) {
        reasons.push(`Complete "${prerequisite.name}" first`);
      }
    }
    return reasons.join(", ");
  }

  onToggleCompleted(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.toggled.emit({ id: this.quest.id, completed: checked });
  }
}
```

Replace `frontend/src/app/shared/quest-cell/quest-cell.component.html` with:

```html
<div class="flex items-start gap-2">
  <input
    type="checkbox"
    class="mt-1 h-4 w-4 accent-[var(--color-accent)]"
    [checked]="quest.completed"
    (change)="onToggleCompleted($event)"
  />
  <div>
    <p
      class="font-medium"
      [class.line-through]="quest.completed"
      [class.text-[var(--color-text-muted)]]="quest.completed"
      [class.opacity-60]="isLocked"
    >
      {{ quest.name }}
      @if (isLocked) {
        <span [title]="lockTooltip">🔒</span>
      }
    </p>
    <a
      [href]="wikiBaseUrl + quest.wikiUrl"
      target="_blank"
      rel="noopener"
      class="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
    >
      Show on Wiki
    </a>
    <app-quest-requirements
      [minLevel]="quest.requirements.minLevel"
      [levelMet]="requirementsStatus.levelMet"
      [prerequisites]="requirementsStatus.prerequisites"
      [loyaltyNotes]="quest.requirements.loyaltyNotes"
    ></app-quest-requirements>
  </div>
</div>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml run --rm frontend npm test`
Expected: PASS, all `QuestCellComponent` tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/shared/quest-cell/
git commit -m "$(cat <<'EOF'
feat(frontend): gray out quest-cell when level or prerequisites aren't met

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Thread `playerLevel`/`completionBySlug` through `quest-table` and `search-results`

**Files:**
- Modify: `frontend/src/app/features/quests/quest-table/quest-table.component.ts`
- Modify: `frontend/src/app/features/quests/quest-table/quest-table.component.html`
- Modify: `frontend/src/app/features/quests/quest-table/quest-table.component.spec.ts`
- Modify: `frontend/src/app/features/quests/search-results/search-results.component.ts`
- Modify: `frontend/src/app/features/quests/search-results/search-results.component.html`
- Modify: `frontend/src/app/features/quests/search-results/search-results.component.spec.ts`

**Interfaces:**
- Consumes: `QuestCompletionInfo` from Task 4; the `playerLevel`/`completionBySlug` inputs added to `QuestCellComponent` in Task 6.
- Produces: `QuestTableComponent`/`SearchResultsComponent` gain `@Input() playerLevel: number | null = null;` and `@Input() completionBySlug: ReadonlyMap<string, QuestCompletionInfo> = new Map();`, consumed by Task 8.

- [ ] **Step 1: Write the failing tests**

Add this test to `frontend/src/app/features/quests/quest-table/quest-table.component.spec.ts`, right after "emits questToggled with the new completed value when the checkbox changes":

```ts
  it("passes playerLevel and completionBySlug down so a locked quest renders its lock icon", () => {
    const lockedTrader: TraderDto = {
      ...trader,
      quests: [
        {
          ...trader.quests[0],
          requirements: { minLevel: 30, prerequisiteQuestSlugs: [], loyaltyNotes: [] },
        },
      ],
    };
    fixture.componentRef.setInput("trader", lockedTrader);
    fixture.componentRef.setInput("playerLevel", 10);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("🔒");
  });
```

Add this test to `frontend/src/app/features/quests/search-results/search-results.component.spec.ts`, right after "renders each result's required items":

```ts
  it("passes playerLevel and completionBySlug down so a locked quest renders its lock icon", () => {
    const lockedResults = [
      { ...results[0], requirements: { minLevel: 30, prerequisiteQuestSlugs: [], loyaltyNotes: [] } },
      results[1],
    ];
    fixture.componentRef.setInput("results", lockedResults);
    fixture.componentRef.setInput("playerLevel", 10);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("🔒");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml run --rm frontend npm test`
Expected: FAIL — `playerLevel`/`completionBySlug` inputs don't exist on `QuestTableComponent`/`SearchResultsComponent` yet, so the quest is never locked and no 🔒 renders.

- [ ] **Step 3: Add the inputs and pass them through**

Replace `frontend/src/app/features/quests/quest-table/quest-table.component.ts` with:

```ts
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { QuestCellComponent } from "../../../shared/quest-cell/quest-cell.component";
import { QuestListComponent } from "../../../shared/quest-list/quest-list.component";
import { RequiredItemListComponent } from "../../../shared/required-item-list/required-item-list.component";
import { sortByCompleted } from "../../../core/quest-sort";
import type { QuestCompletionInfo } from "../../../core/quest-lock";
import type { QuestDto, TraderDto, QuestToggledEvent } from "../../../core/api/quests.api";

@Component({
  selector: "app-quest-table",
  standalone: true,
  imports: [CommonModule, QuestCellComponent, RequiredItemListComponent, QuestListComponent],
  templateUrl: "./quest-table.component.html",
})
export class QuestTableComponent {
  @Input({ required: true }) trader!: TraderDto;
  @Input() playerLevel: number | null = null;
  @Input() completionBySlug: ReadonlyMap<string, QuestCompletionInfo> = new Map();
  @Output() questToggled = new EventEmitter<QuestToggledEvent>();

  sortedQuests(): QuestDto[] {
    return sortByCompleted(this.trader.quests);
  }
}
```

In `frontend/src/app/features/quests/quest-table/quest-table.component.html`, replace:

```html
            <app-quest-cell [quest]="quest" (toggled)="questToggled.emit($event)"></app-quest-cell>
```

with:

```html
            <app-quest-cell
              [quest]="quest"
              [playerLevel]="playerLevel"
              [completionBySlug]="completionBySlug"
              (toggled)="questToggled.emit($event)"
            ></app-quest-cell>
```

Replace `frontend/src/app/features/quests/search-results/search-results.component.ts` with:

```ts
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { QuestCellComponent } from "../../../shared/quest-cell/quest-cell.component";
import { QuestListComponent } from "../../../shared/quest-list/quest-list.component";
import { RequiredItemListComponent } from "../../../shared/required-item-list/required-item-list.component";
import { TraderAvatarComponent } from "../../../shared/trader-avatar/trader-avatar.component";
import { sortByCompleted } from "../../../core/quest-sort";
import type { QuestCompletionInfo } from "../../../core/quest-lock";
import type { QuestDto, QuestToggledEvent } from "../../../core/api/quests.api";

export type SearchResultDto = QuestDto & { traderName: string; traderImageUrl: string | null };

@Component({
  selector: "app-search-results",
  standalone: true,
  imports: [CommonModule, QuestCellComponent, RequiredItemListComponent, QuestListComponent, TraderAvatarComponent],
  templateUrl: "./search-results.component.html",
})
export class SearchResultsComponent {
  @Input({ required: true }) results!: SearchResultDto[];
  @Input() playerLevel: number | null = null;
  @Input() completionBySlug: ReadonlyMap<string, QuestCompletionInfo> = new Map();
  @Output() questToggled = new EventEmitter<QuestToggledEvent>();

  sortedResults(): SearchResultDto[] {
    return sortByCompleted(this.results);
  }
}
```

In `frontend/src/app/features/quests/search-results/search-results.component.html`, replace:

```html
            <app-quest-cell [quest]="quest" (toggled)="questToggled.emit($event)"></app-quest-cell>
```

with:

```html
            <app-quest-cell
              [quest]="quest"
              [playerLevel]="playerLevel"
              [completionBySlug]="completionBySlug"
              (toggled)="questToggled.emit($event)"
            ></app-quest-cell>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml run --rm frontend npm test`
Expected: PASS, full frontend suite green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/quests/quest-table/ frontend/src/app/features/quests/search-results/
git commit -m "$(cat <<'EOF'
feat(frontend): thread player level and completion map through quest table and search results

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Character level input and cross-trader completion map in `QuestsPageComponent`

**Files:**
- Modify: `frontend/src/app/features/quests/quests-page/quests-page.component.ts`
- Modify: `frontend/src/app/features/quests/quests-page/quests-page.component.html`
- Modify: `frontend/src/app/features/quests/quests-page/quests-page.component.spec.ts`

**Interfaces:**
- Consumes: `QuestCompletionInfo` from Task 4; the `playerLevel`/`completionBySlug` inputs added to `QuestTableComponent`/`SearchResultsComponent` in Task 7.

- [ ] **Step 1: Write the failing tests**

Add this near the top of `frontend/src/app/features/quests/quests-page/quests-page.component.spec.ts`, alongside the existing `STORAGE_KEY` constant:

```ts
const PLAYER_LEVEL_STORAGE_KEY = "tarkov-quests.playerLevel";
```

Add these two `describe` blocks at the end of the file, right after the closing of the `"searching by quest name"` describe block (but still inside the outer `describe("QuestsPageComponent", ...)`):

```ts
  describe("player level input", () => {
    function levelInput(): HTMLInputElement {
      return fixture.nativeElement.querySelector("input[type=number]") as HTMLInputElement;
    }

    it("starts empty when no level is stored", () => {
      setup();
      expect(levelInput().value).toBe("");
    });

    it("restores a previously entered level from localStorage", () => {
      localStorage.setItem(PLAYER_LEVEL_STORAGE_KEY, "42");
      setup();
      expect(levelInput().value).toBe("42");
    });

    it("persists the entered level to localStorage", () => {
      setup();
      const input = levelInput();
      input.value = "15";
      input.dispatchEvent(new Event("input"));
      fixture.detectChanges();

      expect(localStorage.getItem(PLAYER_LEVEL_STORAGE_KEY)).toBe("15");
    });

    it("clears the stored level when the input is emptied", () => {
      localStorage.setItem(PLAYER_LEVEL_STORAGE_KEY, "42");
      setup();
      const input = levelInput();
      input.value = "";
      input.dispatchEvent(new Event("input"));
      fixture.detectChanges();

      expect(localStorage.getItem(PLAYER_LEVEL_STORAGE_KEY)).toBeNull();
    });
  });

  describe("cross-trader prerequisite completion", () => {
    const chainTraders: TraderDto[] = [
      {
        id: 1,
        name: "Prapor",
        slug: "prapor",
        tabOrder: 0,
        imageUrl: null,
        quests: [
          buildQuest({
            id: 1,
            traderId: 1,
            name: "The Punisher - Part 2",
            wikiSlug: "The_Punisher_-_Part_2",
            completed: false,
          }),
        ],
      },
      {
        id: 2,
        name: "Therapist",
        slug: "therapist",
        tabOrder: 1,
        imageUrl: null,
        quests: [
          buildQuest({
            id: 2,
            traderId: 2,
            name: "The Punisher - Part 3",
            wikiSlug: "The_Punisher_-_Part_3",
            completed: false,
            requirements: {
              minLevel: null,
              prerequisiteQuestSlugs: ["The_Punisher_-_Part_2"],
              loyaltyNotes: [],
            },
          }),
        ],
      },
    ];

    it("locks a quest whose prerequisite belongs to a different trader and isn't completed yet", () => {
      questsApi.getTraders.mockReturnValue(of(chainTraders));
      setup();
      fixture.componentInstance.onTraderSelected(2);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.textContent).toContain("🔒");
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml run --rm frontend npm test`
Expected: FAIL — there is no `input[type=number]` yet, and no cross-trader completion map is built.

- [ ] **Step 3: Implement the level input and completion map**

Replace `frontend/src/app/features/quests/quests-page/quests-page.component.ts` with:

```ts
import { Component, computed, inject, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { toSignal } from "@angular/core/rxjs-interop";
import { Store } from "@ngxs/store";
import { Observable } from "rxjs";
import { TraderTabsComponent } from "../trader-tabs/trader-tabs.component";
import { QuestTableComponent } from "../quest-table/quest-table.component";
import { SearchResultsComponent, type SearchResultDto } from "../search-results/search-results.component";
import { QuestsState } from "../state/quests.state";
import { LoadTraders, RunScrape, ToggleQuestCompleted } from "../state/quests.actions";
import type { QuestCompletionInfo } from "../../../core/quest-lock";
import type { TraderDto, ScrapeSummaryDto, QuestToggledEvent } from "../../../core/api/quests.api";

const SELECTED_TRADER_STORAGE_KEY = "tarkov-quests.selectedTraderId";
const PLAYER_LEVEL_STORAGE_KEY = "tarkov-quests.playerLevel";

@Component({
  selector: "app-quests-page",
  standalone: true,
  imports: [CommonModule, TraderTabsComponent, QuestTableComponent, SearchResultsComponent],
  templateUrl: "./quests-page.component.html",
})
export class QuestsPageComponent implements OnInit {
  private readonly store = inject(Store);

  traders = toSignal(this.store.select(QuestsState.traders), { initialValue: [] as TraderDto[] });
  loading$: Observable<boolean> = this.store.select(QuestsState.loading);
  lastScrapeSummary$: Observable<ScrapeSummaryDto | null> = this.store.select(QuestsState.lastScrapeSummary);
  error$: Observable<string | null> = this.store.select(QuestsState.error);

  private readonly selectedTraderId = signal<number | null>(this.readStoredTraderId());

  selectedTrader = computed<TraderDto | null>(() => {
    const traders = this.traders();
    if (traders.length === 0) return null;
    const id = this.selectedTraderId();
    return traders.find((trader) => trader.id === id) ?? traders[0];
  });

  playerLevel = signal<number | null>(this.readStoredPlayerLevel());

  completionBySlug = computed<ReadonlyMap<string, QuestCompletionInfo>>(() => {
    const map = new Map<string, QuestCompletionInfo>();
    for (const trader of this.traders()) {
      for (const quest of trader.quests) {
        map.set(quest.wikiSlug, { name: quest.name, completed: quest.completed });
      }
    }
    return map;
  });

  searchQuery = signal("");

  searchResults = computed<SearchResultDto[] | null>(() => {
    const term = this.searchQuery().trim().toLowerCase();
    if (!term) return null;
    return this.traders().flatMap((trader) =>
      trader.quests
        .filter((quest) => quest.name.toLowerCase().includes(term))
        .map((quest) => ({ ...quest, traderName: trader.name, traderImageUrl: trader.imageUrl }))
    );
  });

  ngOnInit(): void {
    this.store.dispatch(new LoadTraders());
  }

  onRunScrape(): void {
    this.store.dispatch(new RunScrape());
  }

  onQuestToggled(event: QuestToggledEvent): void {
    this.store.dispatch(new ToggleQuestCompleted(event.id, event.completed));
  }

  onTraderSelected(id: number): void {
    this.selectedTraderId.set(id);
    localStorage.setItem(SELECTED_TRADER_STORAGE_KEY, String(id));
  }

  onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  onPlayerLevelInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const level = raw === "" ? NaN : Number(raw);
    if (Number.isNaN(level)) {
      this.playerLevel.set(null);
      localStorage.removeItem(PLAYER_LEVEL_STORAGE_KEY);
      return;
    }
    this.playerLevel.set(level);
    localStorage.setItem(PLAYER_LEVEL_STORAGE_KEY, String(level));
  }

  private readStoredTraderId(): number | null {
    const stored = localStorage.getItem(SELECTED_TRADER_STORAGE_KEY);
    return stored ? Number(stored) : null;
  }

  private readStoredPlayerLevel(): number | null {
    const stored = localStorage.getItem(PLAYER_LEVEL_STORAGE_KEY);
    if (stored === null) return null;
    const parsed = Number(stored);
    return Number.isNaN(parsed) ? null : parsed;
  }
}
```

In `frontend/src/app/features/quests/quests-page/quests-page.component.html`, add the level input right after the closing `</div>` of the search bar's wrapping `<div class="relative flex-1">` and before the "Run scrape" `<button>`:

```html
    <input
      type="number"
      min="1"
      placeholder="Level"
      class="w-20 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] py-2 px-3 text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
      [value]="playerLevel() ?? ''"
      (input)="onPlayerLevelInput($event)"
    />
```

Then update the `<app-quest-table>` and `<app-search-results>` tags to pass the new signals down. Replace:

```html
    <app-search-results [results]="results" (questToggled)="onQuestToggled($event)"></app-search-results>
```

with:

```html
    <app-search-results
      [results]="results"
      [playerLevel]="playerLevel()"
      [completionBySlug]="completionBySlug()"
      (questToggled)="onQuestToggled($event)"
    ></app-search-results>
```

and replace:

```html
      <app-quest-table [trader]="trader" (questToggled)="onQuestToggled($event)"></app-quest-table>
```

with:

```html
      <app-quest-table
        [trader]="trader"
        [playerLevel]="playerLevel()"
        [completionBySlug]="completionBySlug()"
        (questToggled)="onQuestToggled($event)"
      ></app-quest-table>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml run --rm frontend npm test`
Expected: PASS, full frontend suite green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/quests/quests-page/
git commit -m "$(cat <<'EOF'
feat(frontend): add character level input and cross-trader prerequisite locking

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Manual verification (after Task 8)

- [ ] Run the dev stack: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml up --build`
- [ ] Open the app, run a scrape, and confirm the "Quest" column shows level/prerequisite lines under "Show on Wiki" for quests known to have them on the wiki (e.g. search "Fertilizers" for a level requirement, "The Punisher - Part 3" for a prerequisite quest).
- [ ] Enter a low character level (e.g. 10) in the new level input and confirm level-gated quests dim with a 🔒 and a tooltip; raise the level past the requirement and confirm it un-grays.
- [ ] Leave the level input empty and confirm no quest is grayed out purely by level.
- [ ] Mark a prerequisite quest (on a different trader tab) as completed and confirm the dependent quest un-grays without a page reload.
- [ ] Reload the page and confirm the entered level is restored from `localStorage`.
