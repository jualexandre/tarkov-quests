# Required Items Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each quest's required items (icon, name, quantity, hand-over/find-in-raid status) in a new "Required items" column between "Quests" and "Objectives", sourced from a new per-quest wiki detail-page scraping stage.

**Architecture:** The scraper gains a second HTTP-fetch stage — after parsing the existing quest listing page, it fetches each quest's individual wiki detail page (same MediaWiki API pattern, bounded concurrency), parses a "Related Quest Items" table when present, downloads each item's icon the same way trader portraits are already downloaded, and stores the result as a JSON-encoded array on `Quest.requiredItems` (same convention as `objectives`/`rewards`). The frontend renders it via a new shared component reused by both the trader table and the search-results table.

**Tech Stack:** Node.js/TypeScript/Express/Prisma (SQLite)/cheerio backend; Angular 22 + NGXS + TailwindCSS frontend; Vitest on both sides.

**Spec:** `docs/superpowers/specs/2026-09-10-required-items-design.md`

## Global Constraints

- **Docker-only workflow.** This project is always run and tested inside Docker, never via host `npm` scripts. Before starting, bring up the dev stack once from the repo root:
  `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml up -d --build`
  Every command in this plan runs as:
  `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml exec backend <cmd>` (backend tasks)
  `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml exec frontend <cmd>` (frontend tasks)
- **TDD.** Every task writes the failing test(s) first, confirms the failure, then implements.
- **JSON-encoded arrays, not new tables.** `requiredItems` follows the exact convention already used for `objectives`/`rewards`: a JSON-encoded string column on `Quest`, decoded/encoded in the repository layer only.
- **Feature-based folders**, repository access behind interfaces — follow the existing `backend/src/features/<feature>/` layout; don't introduce new layers.
- **No migration files** — this project uses `prisma db push` (see `backend/package.json`'s `pretest` script and `backend/Dockerfile`'s `CMD`); editing `schema.prisma` is sufficient, push happens automatically in tests and on container boot.
- After editing `backend/prisma/schema.prisma` in Task 2, run
  `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml exec backend npx prisma generate`
  once, so TypeScript sees the new column before you write code that reads/writes it. (The backend's own `npm test` also force-resets and regenerates its isolated test DB automatically via its `pretest` script — this manual step is only to make the dev container's live `tsx watch` process and your editor's type-checking see the new field immediately.)
- Commit after each task's tests pass, using the conventional-commit style already used in this repo's history (`feat(scraper): ...`, `test(quests): ...`, etc.).

---

### Task 1: Concurrency helper for detail-page fetches

**Files:**
- Create: `backend/src/features/scraper/concurrency.ts`
- Test: `backend/src/features/scraper/concurrency.test.ts`

**Interfaces:**
- Produces: `mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]>` — runs `fn` over `items` with at most `limit` concurrent calls in flight, returning results in the same order as `items` regardless of completion order. Used by Task 5 to fetch ~500 quest detail pages without doing them fully serially or all at once.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/features/scraper/concurrency.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapWithConcurrency } from "./concurrency";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("mapWithConcurrency", () => {
  it("returns results in the same order as the input, regardless of completion order", async () => {
    const results = await mapWithConcurrency([30, 10, 20], 3, async (ms) => {
      await delay(ms);
      return ms;
    });
    expect(results).toEqual([30, 10, 20]);
  });

  it("never runs more than the given concurrency limit at once", async () => {
    let active = 0;
    let maxActive = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (n) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await delay(5);
      active -= 1;
      return n;
    });
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("returns an empty array for an empty input", async () => {
    const results = await mapWithConcurrency([] as number[], 4, async (n) => n);
    expect(results).toEqual([]);
  });

  it("passes each item's index to the mapper", async () => {
    const results = await mapWithConcurrency(["a", "b", "c"], 2, async (item, index) => `${item}${index}`);
    expect(results).toEqual(["a0", "b1", "c2"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml exec backend npm test -- concurrency`
Expected: FAIL with "Cannot find module './concurrency'" (or similar resolution error).

- [ ] **Step 3: Write the implementation**

Create `backend/src/features/scraper/concurrency.ts`:

```ts
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await fn(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml exec backend npm test -- concurrency`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/features/scraper/concurrency.ts backend/src/features/scraper/concurrency.test.ts
git commit -m "feat(scraper): add mapWithConcurrency helper for bounded-concurrency fetches"
```

---

### Task 2: Extend the Quest data model with `requiredItems`

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/features/quests/quest.types.ts`
- Modify: `backend/src/features/quests/quest.repository.ts`
- Modify: `backend/src/features/quests/quest.repository.test.ts`
- Modify: `backend/src/features/quests/quest.routes.test.ts`
- Modify: `backend/src/features/traders/trader.routes.test.ts`
- Modify: `backend/src/features/scraper/scraper.service.ts`
- Modify: `backend/src/features/scraper/scraper.service.test.ts`

**Interfaces:**
- Produces: `RequiredItem` type in `quest.types.ts`:
  ```ts
  interface RequiredItem {
    name: string;
    wikiUrl: string | null;
    iconUrl: string | null;
    amount: number;
    requirement: string;
    findInRaid: boolean;
    notes: string;
  }
  ```
  `Quest.requiredItems: RequiredItem[]` and `UpsertQuestInput.requiredItems: RequiredItem[]` (both required fields). Task 3 (parser) and Task 5 (scraper wiring) will populate these with real data; this task threads the field through as `[]` everywhere so the app keeps compiling and passing at every step.

- [ ] **Step 1: Add the column to the Prisma schema**

Edit `backend/prisma/schema.prisma`, in the `Quest` model, add the new column right after `rewards`:

```prisma
model Quest {
  id            Int      @id @default(autoincrement())
  traderId      Int
  trader        Trader   @relation(fields: [traderId], references: [id])
  name          String
  wikiSlug      String   @unique
  wikiUrl       String
  objectives    String
  rewards       String
  requiredItems String   @default("[]")
  completed     Boolean  @default(false)
  active        Boolean  @default(true)
  lastSeenAt    DateTime
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

- [ ] **Step 2: Regenerate the Prisma client**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml exec backend npx prisma generate`
Expected: "Generated Prisma Client" success message.

- [ ] **Step 3: Update `quest.types.ts`**

Replace the full contents of `backend/src/features/quests/quest.types.ts`:

```ts
import type { Trader } from "../traders/trader.types";

export interface RequiredItem {
  name: string;
  wikiUrl: string | null;
  iconUrl: string | null;
  amount: number;
  requirement: string;
  findInRaid: boolean;
  notes: string;
}

export interface Quest {
  id: number;
  traderId: number;
  name: string;
  wikiSlug: string;
  wikiUrl: string;
  objectives: string[];
  rewards: string[];
  requiredItems: RequiredItem[];
  completed: boolean;
  active: boolean;
  lastSeenAt: Date;
}

export interface TraderWithQuests extends Trader {
  quests: Quest[];
}

export interface UpsertQuestInput {
  traderId: number;
  name: string;
  wikiSlug: string;
  wikiUrl: string;
  objectives: string[];
  rewards: string[];
  requiredItems: RequiredItem[];
}

export interface QuestRepository {
  upsertBySlug(input: UpsertQuestInput): Promise<Quest>;
  updateCompleted(id: number, completed: boolean): Promise<Quest>;
  findAllActiveGroupedByTrader(): Promise<TraderWithQuests[]>;
  deactivateNotIn(seenSlugs: string[]): Promise<number>;
}
```

- [ ] **Step 4: Update `quest.repository.ts` to encode/decode the new column**

Replace the full contents of `backend/src/features/quests/quest.repository.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import type {
  Quest,
  QuestRepository,
  TraderWithQuests,
  UpsertQuestInput,
} from "./quest.types";

function toQuest(row: {
  id: number;
  traderId: number;
  name: string;
  wikiSlug: string;
  wikiUrl: string;
  objectives: string;
  rewards: string;
  requiredItems: string;
  completed: boolean;
  active: boolean;
  lastSeenAt: Date;
}): Quest {
  return {
    ...row,
    objectives: JSON.parse(row.objectives),
    rewards: JSON.parse(row.rewards),
    requiredItems: JSON.parse(row.requiredItems),
  };
}

export class PrismaQuestRepository implements QuestRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertBySlug(input: UpsertQuestInput): Promise<Quest> {
    const data = {
      traderId: input.traderId,
      name: input.name,
      wikiUrl: input.wikiUrl,
      objectives: JSON.stringify(input.objectives),
      rewards: JSON.stringify(input.rewards),
      requiredItems: JSON.stringify(input.requiredItems),
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

  async updateCompleted(id: number, completed: boolean): Promise<Quest> {
    const row = await this.prisma.quest.update({ where: { id }, data: { completed } });
    return toQuest(row);
  }

  async findAllActiveGroupedByTrader(): Promise<TraderWithQuests[]> {
    const traders = await this.prisma.trader.findMany({
      orderBy: { tabOrder: "asc" },
      include: { quests: { where: { active: true }, orderBy: { id: "asc" } } },
    });
    return traders.map((trader) => ({
      id: trader.id,
      name: trader.name,
      slug: trader.slug,
      tabOrder: trader.tabOrder,
      imageUrl: trader.imageUrl,
      quests: trader.quests.map(toQuest),
    }));
  }

  async deactivateNotIn(seenSlugs: string[]): Promise<number> {
    const result = await this.prisma.quest.updateMany({
      where: { wikiSlug: { notIn: seenSlugs }, active: true },
      data: { active: false },
    });
    return result.count;
  }
}
```

- [ ] **Step 5: Update `quest.repository.test.ts`**

Replace the full contents of `backend/src/features/quests/quest.repository.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getPrismaClient } from "../../shared/prisma-client";
import { PrismaTraderRepository } from "../traders/trader.repository";
import { PrismaQuestRepository } from "./quest.repository";
import type { RequiredItem } from "./quest.types";

describe("PrismaQuestRepository", () => {
  const prisma = getPrismaClient();
  const traders = new PrismaTraderRepository(prisma);
  const repo = new PrismaQuestRepository(prisma);
  let traderId: number;

  beforeEach(async () => {
    const trader = await traders.upsertByName({ name: "Prapor", slug: "prapor", tabOrder: 0, imageUrl: null });
    traderId = trader.id;
  });

  it("creates a quest on first upsert with completed defaulting to false", async () => {
    const quest = await repo.upsertBySlug({
      traderId,
      name: "Shooting Cans",
      wikiSlug: "Shooting_Cans",
      wikiUrl: "/wiki/Shooting_Cans",
      objectives: ["Locate the Utyos machine gun"],
      rewards: ["+1,600 EXP"],
      requiredItems: [],
    });
    expect(quest.completed).toBe(false);
    expect(quest.active).toBe(true);
    expect(quest.objectives).toEqual(["Locate the Utyos machine gun"]);
    expect(quest.requiredItems).toEqual([]);
  });

  it("stores and returns requiredItems through JSON encoding", async () => {
    const item: RequiredItem = {
      name: "Secure Folder 0060",
      wikiUrl: "https://escapefromtarkov.fandom.com/wiki/Secure_Folder_0060",
      iconUrl: "/api/item-images/Secure_Folder_0060.png",
      amount: 1,
      requirement: "Handover item",
      findInRaid: true,
      notes: "Quest item.",
    };
    const quest = await repo.upsertBySlug({
      traderId,
      name: "Health Care Privacy - Part 2",
      wikiSlug: "Health_Care_Privacy_-_Part_2",
      wikiUrl: "/wiki/Health_Care_Privacy_-_Part_2",
      objectives: [],
      rewards: [],
      requiredItems: [item],
    });
    expect(quest.requiredItems).toEqual([item]);
  });

  it("preserves completed=true across a second upsert of the same wikiSlug", async () => {
    const first = await repo.upsertBySlug({
      traderId,
      name: "Shooting Cans",
      wikiSlug: "Shooting_Cans",
      wikiUrl: "/wiki/Shooting_Cans",
      objectives: ["a"],
      rewards: ["b"],
      requiredItems: [],
    });
    await repo.updateCompleted(first.id, true);

    const second = await repo.upsertBySlug({
      traderId,
      name: "Shooting Cans (renamed)",
      wikiSlug: "Shooting_Cans",
      wikiUrl: "/wiki/Shooting_Cans",
      objectives: ["a", "c"],
      rewards: ["b"],
      requiredItems: [],
    });

    expect(second.id).toBe(first.id);
    expect(second.completed).toBe(true);
    expect(second.name).toBe("Shooting Cans (renamed)");
    expect(second.objectives).toEqual(["a", "c"]);
  });

  it("findAllActiveGroupedByTrader includes each trader's imageUrl", async () => {
    await traders.upsertByName({ name: "Prapor", slug: "prapor", tabOrder: 0, imageUrl: "/trader-images/prapor.png" });
    const grouped = await repo.findAllActiveGroupedByTrader();
    expect(grouped.find((t) => t.name === "Prapor")?.imageUrl).toBe("/trader-images/prapor.png");
  });

  it("findAllActiveGroupedByTrader returns only active quests, grouped and ordered by trader tabOrder", async () => {
    const therapist = await traders.upsertByName({ name: "Therapist", slug: "therapist", tabOrder: 1, imageUrl: null });
    await repo.upsertBySlug({
      traderId,
      name: "Debut",
      wikiSlug: "Debut",
      wikiUrl: "/wiki/Debut",
      objectives: [],
      rewards: [],
      requiredItems: [],
    });
    const inactiveQuest = await repo.upsertBySlug({
      traderId: therapist.id,
      name: "Old Quest",
      wikiSlug: "Old_Quest",
      wikiUrl: "/wiki/Old_Quest",
      objectives: [],
      rewards: [],
      requiredItems: [],
    });
    await repo.deactivateNotIn(["Debut"]);

    const grouped = await repo.findAllActiveGroupedByTrader();
    expect(grouped.map((t) => t.name)).toEqual(["Prapor", "Therapist"]);
    expect(grouped[0].quests.map((q) => q.wikiSlug)).toEqual(["Debut"]);
    expect(grouped[1].quests).toEqual([]);
    expect(inactiveQuest).toBeDefined();
  });

  it("deactivateNotIn returns the count of quests it deactivated", async () => {
    await repo.upsertBySlug({
      traderId,
      name: "Debut",
      wikiSlug: "Debut",
      wikiUrl: "/wiki/Debut",
      objectives: [],
      rewards: [],
      requiredItems: [],
    });
    await repo.upsertBySlug({
      traderId,
      name: "Delivery from the Past",
      wikiSlug: "Delivery_from_the_Past",
      wikiUrl: "/wiki/Delivery_from_the_Past",
      objectives: [],
      rewards: [],
      requiredItems: [],
    });

    const deactivatedCount = await repo.deactivateNotIn(["Debut"]);
    expect(deactivatedCount).toBe(1);
  });
});
```

- [ ] **Step 6: Run the repository tests to verify they fail, then pass**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml exec backend npm test -- quest.repository`
Expected first (before step 4-5's code changes are saved): compile error referencing `requiredItems`. After steps 3-5 are all saved: PASS (6 tests).

- [ ] **Step 7: Update `quest.routes.test.ts`**

In `backend/src/features/quests/quest.routes.test.ts`, add `requiredItems: [],` to the `updatedQuest` object (after `rewards: [],`):

```ts
    const updatedQuest = {
      id: 1,
      traderId: 1,
      name: "Debut",
      wikiSlug: "Debut",
      wikiUrl: "/wiki/Debut",
      objectives: [],
      rewards: [],
      requiredItems: [],
      completed: true,
      active: true,
      lastSeenAt: new Date(),
    };
```

- [ ] **Step 8: Update `trader.routes.test.ts`**

In `backend/src/features/traders/trader.routes.test.ts`, add `requiredItems: [],` to the quest object inside `grouped[0].quests` (after `rewards: ["+1200 EXP"],`):

```ts
          {
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
            lastSeenAt: new Date("2026-01-01T00:00:00.000Z"),
          },
```

- [ ] **Step 9: Update `scraper.service.ts`'s upsert call to pass the new required field**

In `backend/src/features/scraper/scraper.service.ts`, inside `runScrape()`, add `requiredItems: [],` to the `deps.questRepository.upsertBySlug({...})` call (after `rewards: parsedQuest.rewards,`):

```ts
          const quest = await deps.questRepository.upsertBySlug({
            traderId: trader.id,
            name: parsedQuest.name,
            wikiSlug: parsedQuest.wikiSlug,
            wikiUrl: parsedQuest.wikiUrl,
            objectives: parsedQuest.objectives,
            rewards: parsedQuest.rewards,
            requiredItems: [],
          });
```

(Task 5 replaces this `[]` stub with real fetched data.)

- [ ] **Step 10: Update `scraper.service.test.ts`'s expectations**

In `backend/src/features/scraper/scraper.service.test.ts`, in the first test (`"upserts the trader and quest..."`), add `requiredItems: [],` to both the `upsertedQuest` fixture and the `toHaveBeenCalledWith` expectation:

```ts
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
```

```ts
    expect(questRepository.upsertBySlug).toHaveBeenCalledWith({
      traderId: 1,
      name: "Debut",
      wikiSlug: "Debut",
      wikiUrl: "/wiki/Debut",
      objectives: ["Eliminate 5 Scavs"],
      rewards: ["+1200 EXP"],
      requiredItems: [],
    });
```

- [ ] **Step 11: Run the full backend test suite**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml exec backend npm test`
Expected: PASS, all suites green.

- [ ] **Step 12: Commit**

```bash
git add backend/prisma/schema.prisma backend/src/features/quests/quest.types.ts backend/src/features/quests/quest.repository.ts backend/src/features/quests/quest.repository.test.ts backend/src/features/quests/quest.routes.test.ts backend/src/features/traders/trader.routes.test.ts backend/src/features/scraper/scraper.service.ts backend/src/features/scraper/scraper.service.test.ts
git commit -m "feat(quests): add requiredItems to the Quest data model"
```

---

### Task 3: Parse required items from a quest's detail page

**Files:**
- Create: `backend/test/fixtures/quest-detail-with-items.json` (already saved during design research — a real MediaWiki API response for `Health_Care_Privacy_-_Part_2`, which has a two-item "Related Quest Items" table)
- Create: `backend/test/fixtures/quest-detail-without-items.json` (already saved during design research — a real response for `Debut`, which has no such table)
- Modify: `backend/src/features/scraper/wiki-parser.ts`
- Modify: `backend/src/features/scraper/wiki-parser.test.ts`

**Interfaces:**
- Consumes: `RequiredItem` from `../quests/quest.types` (Task 2).
- Produces: `parseRequiredItems(apiResponseJson: string): RequiredItem[]` — parses a quest detail page's "Related Quest Items" table, returning `[]` when the quest has no required items.

- [ ] **Step 1: Confirm the fixtures are in place**

Run: `ls backend/test/fixtures/quest-detail-with-items.json backend/test/fixtures/quest-detail-without-items.json`
Expected: both files listed (already created during design research; if missing, re-fetch with:
`curl -s -A "Mozilla/5.0" "https://escapefromtarkov.fandom.com/api.php?action=parse&page=Health_Care_Privacy_-_Part_2&format=json&prop=text" -o backend/test/fixtures/quest-detail-with-items.json`
`curl -s -A "Mozilla/5.0" "https://escapefromtarkov.fandom.com/api.php?action=parse&page=Debut&format=json&prop=text" -o backend/test/fixtures/quest-detail-without-items.json`).

- [ ] **Step 2: Write the failing tests**

Create `backend/src/features/scraper/wiki-parser.test.ts` additions — append this new `describe` block at the end of the existing file (after the closing `});` of `describe("parseQuestsPage", ...)`), and add `parseRequiredItems` to the existing import line:

```ts
import { parseQuestsPage, parseRequiredItems } from "./wiki-parser";
```

```ts
describe("parseRequiredItems", () => {
  function loadDetailFixtureJson(filename: string): string {
    return readFileSync(join(__dirname, "../../../test/fixtures", filename), "utf-8");
  }

  it("returns an empty array when the quest page has no Related Quest Items table", () => {
    const items = parseRequiredItems(loadDetailFixtureJson("quest-detail-without-items.json"));
    expect(items).toEqual([]);
  });

  it("parses a 'find and keep' item with no find-in-raid requirement", () => {
    const items = parseRequiredItems(loadDetailFixtureJson("quest-detail-with-items.json"));
    const key = items.find((i) => i.name === "Health Resort west wing room 306 key")!;
    expect(key).toBeDefined();
    expect(key.wikiUrl).toBe("https://escapefromtarkov.fandom.com/wiki/Health_Resort_west_wing_room_306_key");
    expect(key.iconUrl).toBe(
      "https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/7/71/WestWing306KeyIcon.png/revision/latest?cb=20220707215218"
    );
    expect(key.amount).toBe(1);
    expect(key.requirement).toBe("Required");
    expect(key.findInRaid).toBe(false);
    expect(key.notes).toContain("Unlocks Health Resort west wing room 306");
  });

  it("parses a hand-over item that requires find-in-raid", () => {
    const items = parseRequiredItems(loadDetailFixtureJson("quest-detail-with-items.json"));
    const folder = items.find((i) => i.name === "Secure Folder 0060")!;
    expect(folder).toBeDefined();
    expect(folder.wikiUrl).toBe("https://escapefromtarkov.fandom.com/wiki/Secure_Folder_0060");
    expect(folder.iconUrl).toBe(
      "https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/d/d0/Docs_0060_icon.png/revision/latest?cb=20221012071107"
    );
    expect(folder.amount).toBe(1);
    expect(folder.requirement).toBe("Handover item");
    expect(folder.findInRaid).toBe(true);
    expect(folder.notes).toContain("quest item");
  });

  it("keeps links inside notes absolute and opening in a new tab", () => {
    const items = parseRequiredItems(loadDetailFixtureJson("quest-detail-with-items.json"));
    const key = items.find((i) => i.name === "Health Resort west wing room 306 key")!;
    expect(key.notes).toContain('<a href="https://escapefromtarkov.fandom.com/wiki/Shoreline"');
    expect(key.notes).toContain('target="_blank"');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml exec backend npm test -- wiki-parser`
Expected: FAIL — `parseRequiredItems` is not exported.

- [ ] **Step 4: Implement `parseRequiredItems`**

Replace the full contents of `backend/src/features/scraper/wiki-parser.ts`:

```ts
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
    const cells = $(row).children("td, th");
    const iconUrl = extractIconUrl($, cells.eq(0));
    const { name, wikiUrl } = extractItemLink($, cells.eq(1));
    const amount = parseInt(cells.eq(2).text().trim(), 10) || 0;
    const requirement = cells.eq(3).text().trim();
    const findInRaid = cells.eq(4).text().trim().toLowerCase() === "yes";
    const notes = sanitizeHtmlFragment($, cells.eq(5).get(0));

    return { name, wikiUrl, iconUrl, amount, requirement, findInRaid, notes };
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml exec backend npm test -- wiki-parser`
Expected: PASS (all `parseQuestsPage` tests still pass, plus the 4 new `parseRequiredItems` tests).

- [ ] **Step 6: Commit**

```bash
git add backend/test/fixtures/quest-detail-with-items.json backend/test/fixtures/quest-detail-without-items.json backend/src/features/scraper/wiki-parser.ts backend/src/features/scraper/wiki-parser.test.ts
git commit -m "feat(scraper): parse required items from a quest's detail page"
```

---

### Task 4: Generalize the image downloader for multiple image kinds

**Files:**
- Modify: `backend/src/features/scraper/image-downloader.ts`
- Modify: `backend/src/features/scraper/image-downloader.test.ts`

**Interfaces:**
- Produces: `ImageDownloaderDeps` gains a required `publicPathPrefix: string` field. `createImageDownloader({ dir, publicPathPrefix, ... })` now returns a `DownloadImage` function whose resolved public path is `${publicPathPrefix}/${filename}` instead of a hardcoded `/api/trader-images/${filename}`. Behavior is otherwise identical. This lets Task 5 create a second instance for item icons without duplicating the module.

- [ ] **Step 1: Update the failing tests first**

Replace the full contents of `backend/src/features/scraper/image-downloader.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createImageDownloader, extensionFromImageUrl } from "./image-downloader";

const WIKI_IMAGE_URL =
  "https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/6/6b/Prapor_Portrait.png/revision/latest/scale-to-width-down/105?cb=20180425012550";

function buildFakeResponse(ok: boolean, status = 200): Response {
  return {
    ok,
    status,
    arrayBuffer: async () => new ArrayBuffer(4),
  } as unknown as Response;
}

describe("extensionFromImageUrl", () => {
  it("extracts the extension embedded before the wiki revision path segment", () => {
    expect(extensionFromImageUrl(WIKI_IMAGE_URL)).toBe("png");
  });

  it("extracts jpg extensions case-insensitively", () => {
    expect(extensionFromImageUrl("https://example.com/images/Fence_Portrait.JPG")).toBe("jpg");
  });

  it("defaults to png when no known extension is found", () => {
    expect(extensionFromImageUrl("https://example.com/images/no-extension-here")).toBe("png");
  });
});

describe("createImageDownloader", () => {
  it("returns null without fetching when imageUrl is null", async () => {
    const fetchImpl = vi.fn();
    const downloadTraderImage = createImageDownloader({
      dir: "/data/trader-images",
      publicPathPrefix: "/api/trader-images",
      fetchImpl,
      fileExists: vi.fn().mockResolvedValue(false),
      writeFile: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
    });

    const result = await downloadTraderImage(null, "prapor");

    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("skips downloading and returns the existing local path when the file is already cached", async () => {
    const fetchImpl = vi.fn();
    const writeFile = vi.fn();
    const downloadTraderImage = createImageDownloader({
      dir: "/data/trader-images",
      publicPathPrefix: "/api/trader-images",
      fetchImpl,
      fileExists: vi.fn().mockResolvedValue(true),
      writeFile,
      mkdir: vi.fn().mockResolvedValue(undefined),
    });

    const result = await downloadTraderImage(WIKI_IMAGE_URL, "prapor");

    expect(result).toBe("/api/trader-images/prapor.png");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("downloads and writes the image, returning its local path, when not cached", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(buildFakeResponse(true));
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const downloadTraderImage = createImageDownloader({
      dir: "/data/trader-images",
      publicPathPrefix: "/api/trader-images",
      fetchImpl,
      fileExists: vi.fn().mockResolvedValue(false),
      writeFile,
      mkdir,
    });

    const result = await downloadTraderImage(WIKI_IMAGE_URL, "prapor");

    expect(result).toBe("/api/trader-images/prapor.png");
    expect(fetchImpl).toHaveBeenCalledWith(WIKI_IMAGE_URL);
    expect(mkdir).toHaveBeenCalledWith("/data/trader-images");
    expect(writeFile).toHaveBeenCalledWith("/data/trader-images/prapor.png", expect.any(Buffer));
  });

  it("returns null without throwing when the download fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(buildFakeResponse(false, 404));
    const writeFile = vi.fn();
    const downloadTraderImage = createImageDownloader({
      dir: "/data/trader-images",
      publicPathPrefix: "/api/trader-images",
      fetchImpl,
      fileExists: vi.fn().mockResolvedValue(false),
      writeFile,
      mkdir: vi.fn().mockResolvedValue(undefined),
    });

    const result = await downloadTraderImage(WIKI_IMAGE_URL, "prapor");

    expect(result).toBeNull();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("uses the given publicPathPrefix, so the same factory can serve a different image kind", async () => {
    const downloadItemImage = createImageDownloader({
      dir: "/data/item-images",
      publicPathPrefix: "/api/item-images",
      fetchImpl: vi.fn(),
      fileExists: vi.fn().mockResolvedValue(true),
      writeFile: vi.fn(),
      mkdir: vi.fn().mockResolvedValue(undefined),
    });

    const result = await downloadItemImage(WIKI_IMAGE_URL, "secure-folder-0060");

    expect(result).toBe("/api/item-images/secure-folder-0060.png");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml exec backend npm test -- image-downloader`
Expected: FAIL — `publicPathPrefix` doesn't exist on the deps type / paths still resolve to the old hardcoded prefix for the new test.

- [ ] **Step 3: Update the implementation**

Replace the full contents of `backend/src/features/scraper/image-downloader.ts`:

```ts
import { promises as fs } from "node:fs";
import { join } from "node:path";

const KNOWN_EXTENSIONS = ["png", "jpeg", "jpg", "gif", "webp"];

export function extensionFromImageUrl(url: string): string {
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {
    // Not an absolute URL; fall back to matching against the raw string.
  }
  const match = pathname.match(/\.([a-zA-Z0-9]+)(?:\/|$)/);
  const candidate = match?.[1].toLowerCase();
  return candidate && KNOWN_EXTENSIONS.includes(candidate) ? candidate : "png";
}

export interface ImageDownloaderDeps {
  dir: string;
  publicPathPrefix: string;
  fetchImpl?: typeof fetch;
  fileExists?: (path: string) => Promise<boolean>;
  writeFile?: (path: string, data: Buffer) => Promise<void>;
  mkdir?: (path: string) => Promise<void>;
}

export type DownloadImage = (imageUrl: string | null, slug: string) => Promise<string | null>;

async function defaultFileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export function createImageDownloader(deps: ImageDownloaderDeps): DownloadImage {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const fileExists = deps.fileExists ?? defaultFileExists;
  const writeFile = deps.writeFile ?? ((path: string, data: Buffer) => fs.writeFile(path, data));
  const mkdir = deps.mkdir ?? ((path: string) => fs.mkdir(path, { recursive: true }).then(() => undefined));

  return async function downloadImage(imageUrl, slug) {
    if (!imageUrl) return null;

    const filename = `${slug}.${extensionFromImageUrl(imageUrl)}`;
    const localPath = join(deps.dir, filename);
    const publicPath = `${deps.publicPathPrefix}/${filename}`;

    if (await fileExists(localPath)) return publicPath;

    try {
      const response = await fetchImpl(imageUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      await mkdir(deps.dir);
      await writeFile(localPath, buffer);
      return publicPath;
    } catch (err) {
      console.warn(`Failed to download image for "${slug}": ${(err as Error).message}`);
      return null;
    }
  };
}
```

- [ ] **Step 4: Update the one existing call site so the app keeps compiling**

In `backend/src/server.ts`, update the `createImageDownloader` call to pass the new required field:

```ts
const downloadTraderImage = createImageDownloader({ dir: traderImagesDir, publicPathPrefix: "/api/trader-images" });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml exec backend npm test`
Expected: PASS, all suites green (this also confirms `server.ts` still compiles, since `npm run build`/`tsc` isn't run here — do a quick compile check too).

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml exec backend npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/features/scraper/image-downloader.ts backend/src/features/scraper/image-downloader.test.ts backend/src/server.ts
git commit -m "refactor(scraper): generalize image downloader with a configurable public path prefix"
```

---

### Task 5: Wire required-item fetching and icon downloading into the scraper

**Files:**
- Modify: `backend/src/features/scraper/scraper.service.ts`
- Modify: `backend/src/features/scraper/scraper.service.test.ts`
- Modify: `backend/src/shared/http/app.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/features/scraper/scraper.routes.test.ts`
- Modify: `backend/src/features/quests/quest.routes.test.ts`
- Modify: `backend/src/features/traders/trader.routes.test.ts`
- Modify: `frontend/nginx.conf`

**Interfaces:**
- Consumes: `mapWithConcurrency` (Task 1), `parseRequiredItems` (Task 3), `DownloadImage`/`createImageDownloader` (Task 4), `RequiredItem` (Task 2).
- Produces: `fetchQuestDetailJson(wikiSlug: string): Promise<string>`, exported from `scraper.service.ts` (mirrors `fetchQuestsPageJson`). `ScraperServiceDeps` gains `fetchQuestDetailJson` and `downloadItemImage`. `AppDeps` gains `itemImagesDir: string`. Backend now serves `/api/item-images`.

- [ ] **Step 1: Write the failing scraper.service tests**

Replace the full contents of `backend/src/features/scraper/scraper.service.test.ts`:

```ts
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
    });
    expect(questRepository.deactivateNotIn).toHaveBeenCalledWith(["Debut"]);
    expect(summary).toEqual({ added: 1, updated: 0, deactivated: 2, totalQuests: 1 });
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

  it("uses an empty required-items list and keeps scraping when a quest's detail-page fetch fails", async () => {
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
    expect(downloadItemImage).not.toHaveBeenCalled();
    expect(questRepository.upsertBySlug).toHaveBeenCalledWith(expect.objectContaining({ requiredItems: [] }));
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml exec backend npm test -- scraper.service`
Expected: FAIL — `fetchQuestDetailJson`/`downloadItemImage` don't exist on the deps type yet, and the new assertions have nothing to match.

- [ ] **Step 3: Implement the wiring in `scraper.service.ts`**

Replace the full contents of `backend/src/features/scraper/scraper.service.ts`:

```ts
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

      let added = 0;
      let updated = 0;
      const seenSlugs: string[] = [];

      for (const { traderId, parsedQuest } of questsToUpsert) {
        const existingCount = await countExistingBySlug(deps.questRepository, parsedQuest.wikiSlug);
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
        if (existingCount === 0) added += 1;
        else updated += 1;
      }

      if (seenSlugs.length === 0) {
        throw new Error("Scrape parsed 0 quests; refusing to deactivate the entire database");
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml exec backend npm test -- scraper.service`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the `/api/item-images` static route**

Replace the full contents of `backend/src/shared/http/app.ts`:

```ts
import express, { type Express } from "express";
import type { QuestRepository } from "../../features/quests/quest.types";
import type { ScraperService } from "../../features/scraper/scraper.types";
import { createTraderRouter } from "../../features/traders/trader.routes";
import { createQuestRouter } from "../../features/quests/quest.routes";
import { createScraperRouter } from "../../features/scraper/scraper.routes";
import { errorHandler } from "./error-handler";

export interface AppDeps {
  questRepository: QuestRepository;
  scraperService: ScraperService;
  traderImagesDir: string;
  itemImagesDir: string;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json());

  app.use("/api/trader-images", express.static(deps.traderImagesDir));
  app.use("/api/item-images", express.static(deps.itemImagesDir));
  app.use("/api/traders", createTraderRouter(deps.questRepository));
  app.use("/api/quests", createQuestRouter(deps.questRepository));
  app.use("/api/scrape", createScraperRouter(deps.scraperService));

  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 6: Update the 6 existing `createApp(...)` test call sites**

In each of the following files, add `itemImagesDir: "/tmp/test-item-images",` right after `traderImagesDir: "/tmp/test-trader-images",` (or on the same call, however it's currently formatted) in every `createApp({...})` call:
- `backend/src/features/scraper/scraper.routes.test.ts` (1 call)
- `backend/src/features/quests/quest.routes.test.ts` (4 calls)
- `backend/src/features/traders/trader.routes.test.ts` (1 call)

Example (all 6 calls follow this exact shape, just with different `questRepository`/`scraperService` values already in the file):

```ts
    const app = createApp({
      questRepository,
      scraperService,
      traderImagesDir: "/tmp/test-trader-images",
      itemImagesDir: "/tmp/test-item-images",
    });
```

- [ ] **Step 7: Wire the item image downloader and raise timeouts in `server.ts`**

Replace the full contents of `backend/src/server.ts`:

```ts
import "dotenv/config";
import { join } from "node:path";
import { getPrismaClient } from "./shared/prisma-client";
import { PrismaTraderRepository } from "./features/traders/trader.repository";
import { PrismaQuestRepository } from "./features/quests/quest.repository";
import { createScraperService, fetchQuestsPageJson, fetchQuestDetailJson } from "./features/scraper/scraper.service";
import { createImageDownloader } from "./features/scraper/image-downloader";
import { createApp } from "./shared/http/app";

const dataDir = process.env.DATA_DIR ?? "./data";
const traderImagesDir = join(dataDir, "trader-images");
const itemImagesDir = join(dataDir, "item-images");

const prisma = getPrismaClient();
const traderRepository = new PrismaTraderRepository(prisma);
const questRepository = new PrismaQuestRepository(prisma);
const downloadTraderImage = createImageDownloader({ dir: traderImagesDir, publicPathPrefix: "/api/trader-images" });
const downloadItemImage = createImageDownloader({ dir: itemImagesDir, publicPathPrefix: "/api/item-images" });
const scraperService = createScraperService({
  traderRepository,
  questRepository,
  fetchQuestsPageJson,
  fetchQuestDetailJson,
  downloadTraderImage,
  downloadItemImage,
});

const app = createApp({ questRepository, scraperService, traderImagesDir, itemImagesDir });
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

// A full scrape now fetches one detail page per quest (~500 requests); raise
// the default timeout so Node doesn't close the connection mid-scrape.
const SCRAPE_TIMEOUT_MS = 600_000;

const httpServer = app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
httpServer.timeout = SCRAPE_TIMEOUT_MS;
```

- [ ] **Step 8: Raise the nginx proxy timeout**

In `frontend/nginx.conf`, add the two timeout directives inside the existing `location /api/` block:

```nginx
    location /api/ {
        set $backend_upstream backend:3000;
        # No path after the variable: proxy_pass with a variable disables the
        # automatic prefix-replace, so appending /api/ here would truncate
        # every request to that literal path instead of passing the full URI through.
        proxy_pass http://$backend_upstream;
        proxy_set_header Host $host;
        # A full scrape fetches one detail page per quest (~500 requests) and
        # can take a few minutes; the default 60s read timeout would cut it off.
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
```

- [ ] **Step 9: Run the full backend test suite and type-check**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml exec backend npm test`
Expected: PASS, all suites green.

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml exec backend npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add backend/src/features/scraper/scraper.service.ts backend/src/features/scraper/scraper.service.test.ts backend/src/shared/http/app.ts backend/src/server.ts backend/src/features/scraper/scraper.routes.test.ts backend/src/features/quests/quest.routes.test.ts backend/src/features/traders/trader.routes.test.ts frontend/nginx.conf
git commit -m "feat(scraper): fetch and localize required items during a scrape, with raised timeouts"
```

---

### Task 6: Frontend `RequiredItemDto` type

**Files:**
- Modify: `frontend/src/app/core/api/quests.api.ts`
- Modify: `frontend/src/app/features/quests/quests-page/quests-page.component.spec.ts`
- Modify: `frontend/src/app/features/quests/quest-table/quest-table.component.spec.ts`
- Modify: `frontend/src/app/features/quests/search-results/search-results.component.spec.ts`
- Modify: `frontend/src/app/features/quests/state/quests.state.spec.ts`

**Interfaces:**
- Produces: `RequiredItemDto` in `quests.api.ts` (mirrors backend's `RequiredItem`); `QuestDto.requiredItems: RequiredItemDto[]` (required field).

- [ ] **Step 1: Add the type**

In `frontend/src/app/core/api/quests.api.ts`, add the new interface and field:

```ts
export interface RequiredItemDto {
  name: string;
  wikiUrl: string | null;
  iconUrl: string | null;
  amount: number;
  requirement: string;
  findInRaid: boolean;
  notes: string;
}

export interface QuestDto {
  id: number;
  traderId: number;
  name: string;
  wikiSlug: string;
  wikiUrl: string;
  objectives: string[];
  rewards: string[];
  requiredItems: RequiredItemDto[];
  completed: boolean;
  active: boolean;
  lastSeenAt: string;
}
```

- [ ] **Step 2: Run the frontend tests to see the compile errors**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml exec frontend npm test`
Expected: FAIL — TypeScript errors in the spec files below, each missing the now-required `requiredItems` property on a `QuestDto`-shaped object literal.

- [ ] **Step 3: Fix `quests-page.component.spec.ts`**

In `frontend/src/app/features/quests/quests-page/quests-page.component.spec.ts`, add `requiredItems: [],` to the `buildQuest` default object (after `rewards: [],`):

```ts
function buildQuest(overrides: Partial<TraderDto["quests"][number]> = {}): TraderDto["quests"][number] {
  return {
    id: 1,
    traderId: 1,
    name: "Debut",
    wikiSlug: "Debut",
    wikiUrl: "/wiki/Debut",
    objectives: [],
    rewards: [],
    requiredItems: [],
    completed: false,
    active: true,
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
```

- [ ] **Step 4: Fix `quest-table.component.spec.ts`**

In `frontend/src/app/features/quests/quest-table/quest-table.component.spec.ts`:

Add `requiredItems: [],` to the `trader.quests[0]` object (after `rewards: ["+1200 EXP"],`):

```ts
    quests: [
      {
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
        lastSeenAt: "2026-01-01T00:00:00.000Z",
      },
    ],
```

Add `requiredItems: [],` to the per-quest object built by `buildTrader` (after `rewards: [],`):

```ts
    function buildTrader(completedIds: number[]): TraderDto {
      return {
        ...trader,
        quests: [1, 2, 3, 4, 5].map((n) => ({
          id: n,
          traderId: 1,
          name: `Quest ${n}`,
          wikiSlug: `Quest_${n}`,
          wikiUrl: `/wiki/Quest_${n}`,
          objectives: [],
          rewards: [],
          requiredItems: [],
          completed: completedIds.includes(n),
          active: true,
          lastSeenAt: "2026-01-01T00:00:00.000Z",
        })),
      };
    }
```

- [ ] **Step 5: Fix `search-results.component.spec.ts`**

In `frontend/src/app/features/quests/search-results/search-results.component.spec.ts`, add `requiredItems: [],` to both objects in the `results` array (after each `rewards: [...]`):

```ts
  const results: SearchResultDto[] = [
    {
      id: 1,
      traderId: 1,
      traderName: "Prapor",
      traderImageUrl: "/api/trader-images/prapor.png",
      name: "Debut",
      wikiSlug: "Debut",
      wikiUrl: "/wiki/Debut",
      objectives: ["Eliminate 5 Scavs"],
      rewards: ["+1200 EXP"],
      requiredItems: [],
      completed: false,
      active: true,
      lastSeenAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: 2,
      traderId: 2,
      traderName: "Therapist",
      traderImageUrl: null,
      name: "Shortage",
      wikiSlug: "Shortage",
      wikiUrl: "/wiki/Shortage",
      objectives: ["Find 3 Bandages"],
      rewards: ["+800 EXP"],
      requiredItems: [],
      completed: false,
      active: true,
      lastSeenAt: "2026-01-01T00:00:00.000Z",
    },
  ];
```

- [ ] **Step 6: Fix `quests.state.spec.ts`**

In `frontend/src/app/features/quests/state/quests.state.spec.ts`, add `requiredItems: [],` to the `quest` object (after `rewards: [],`):

```ts
  const quest: QuestDto = {
    id: 1,
    traderId: 1,
    name: "Debut",
    wikiSlug: "Debut",
    wikiUrl: "/wiki/Debut",
    objectives: [],
    rewards: [],
    requiredItems: [],
    completed: false,
    active: true,
    lastSeenAt: "2026-01-01T00:00:00.000Z",
  };
```

- [ ] **Step 7: Run the frontend tests to verify they pass**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml exec frontend npm test`
Expected: PASS, all suites green.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/core/api/quests.api.ts frontend/src/app/features/quests/quests-page/quests-page.component.spec.ts frontend/src/app/features/quests/quest-table/quest-table.component.spec.ts frontend/src/app/features/quests/search-results/search-results.component.spec.ts frontend/src/app/features/quests/state/quests.state.spec.ts
git commit -m "feat(quests): add requiredItems to the frontend QuestDto"
```

---

### Task 7: `RequiredItemListComponent`

**Files:**
- Create: `frontend/src/app/shared/required-item-list/required-item-list.component.ts`
- Create: `frontend/src/app/shared/required-item-list/required-item-list.component.html`
- Create: `frontend/src/app/shared/required-item-list/required-item-list.component.spec.ts`

**Interfaces:**
- Consumes: `RequiredItemDto` from `../../core/api/quests.api` (Task 6).
- Produces: `<app-required-item-list [items]="quest.requiredItems">` — a compact chip list, one row per item: icon (when present), name, "×N" quantity, a "Hand over" badge when `requirement` indicates a hand-over item, and an "FIR" badge when `findInRaid` is true. Used by Task 8.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/shared/required-item-list/required-item-list.component.spec.ts`:

```ts
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { RequiredItemListComponent } from "./required-item-list.component";
import type { RequiredItemDto } from "../../core/api/quests.api";

describe("RequiredItemListComponent", () => {
  let fixture: ComponentFixture<RequiredItemListComponent>;

  function buildItem(overrides: Partial<RequiredItemDto> = {}): RequiredItemDto {
    return {
      name: "Secure Folder 0060",
      wikiUrl: "https://escapefromtarkov.fandom.com/wiki/Secure_Folder_0060",
      iconUrl: "/api/item-images/Secure_Folder_0060.png",
      amount: 1,
      requirement: "Handover item",
      findInRaid: true,
      notes: "Quest item.",
      ...overrides,
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [RequiredItemListComponent] });
    fixture = TestBed.createComponent(RequiredItemListComponent);
  });

  it("renders nothing when there are no items", () => {
    fixture.componentInstance.items = [];
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent?.trim()).toBe("");
  });

  it("renders the item's icon, name and quantity", () => {
    fixture.componentInstance.items = [buildItem({ amount: 3 })];
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const img = el.querySelector("img") as HTMLImageElement;
    expect(img.src).toContain("/api/item-images/Secure_Folder_0060.png");
    expect(img.alt).toBe("Secure Folder 0060");
    expect(el.textContent).toContain("Secure Folder 0060");
    expect(el.textContent).toContain("×3");
  });

  it("does not render an icon when iconUrl is null", () => {
    fixture.componentInstance.items = [buildItem({ iconUrl: null })];
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector("img")).toBeNull();
  });

  it("shows a hand-over badge when the requirement is a handover item", () => {
    fixture.componentInstance.items = [buildItem({ requirement: "Handover item" })];
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain("Hand over");
  });

  it("does not show a hand-over badge when the item is just required", () => {
    fixture.componentInstance.items = [buildItem({ requirement: "Required" })];
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain("Hand over");
  });

  it("shows a find-in-raid badge when findInRaid is true", () => {
    fixture.componentInstance.items = [buildItem({ findInRaid: true })];
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain("FIR");
  });

  it("does not show a find-in-raid badge when findInRaid is false", () => {
    fixture.componentInstance.items = [buildItem({ findInRaid: false })];
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain("FIR");
  });

  it("renders one row per item", () => {
    fixture.componentInstance.items = [buildItem({ name: "Item A" }), buildItem({ name: "Item B" })];
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Item A");
    expect(el.textContent).toContain("Item B");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml exec frontend npm test`
Expected: FAIL — cannot find module `./required-item-list.component`.

- [ ] **Step 3: Write the component**

Create `frontend/src/app/shared/required-item-list/required-item-list.component.ts`:

```ts
import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import type { RequiredItemDto } from "../../core/api/quests.api";

@Component({
  selector: "app-required-item-list",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./required-item-list.component.html",
  host: { class: "contents" },
})
export class RequiredItemListComponent {
  @Input({ required: true }) items!: RequiredItemDto[];

  isHandover(item: RequiredItemDto): boolean {
    return item.requirement.toLowerCase().includes("handover");
  }
}
```

Create `frontend/src/app/shared/required-item-list/required-item-list.component.html`:

```html
<div class="flex flex-col gap-1.5">
  @for (item of items; track item.name) {
    <div class="flex items-center gap-1.5">
      @if (item.iconUrl) {
        <img [src]="item.iconUrl" [alt]="item.name" class="h-6 w-6 rounded object-cover shrink-0" />
      }
      <span class="truncate">{{ item.name }}</span>
      <span class="text-[var(--color-text-muted)]">×{{ item.amount }}</span>
      @if (isHandover(item)) {
        <span class="text-[10px] uppercase rounded px-1 bg-[var(--color-accent)]/20 text-[var(--color-accent)]">Hand over</span>
      }
      @if (item.findInRaid) {
        <span class="text-[10px] uppercase rounded px-1 bg-red-400/20 text-red-400">FIR</span>
      }
    </div>
  }
</div>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml exec frontend npm test`
Expected: PASS (9 tests in this spec, all others still green).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/shared/required-item-list/
git commit -m "feat(quests): add RequiredItemListComponent"
```

---

### Task 8: Wire the "Required items" column into the quest table and search results

**Files:**
- Modify: `frontend/src/app/features/quests/quest-table/quest-table.component.ts`
- Modify: `frontend/src/app/features/quests/quest-table/quest-table.component.html`
- Modify: `frontend/src/app/features/quests/quest-table/quest-table.component.spec.ts`
- Modify: `frontend/src/app/features/quests/search-results/search-results.component.ts`
- Modify: `frontend/src/app/features/quests/search-results/search-results.component.html`
- Modify: `frontend/src/app/features/quests/search-results/search-results.component.spec.ts`

**Interfaces:**
- Consumes: `RequiredItemListComponent` (Task 7).

- [ ] **Step 1: Write the failing tests**

In `frontend/src/app/features/quests/quest-table/quest-table.component.spec.ts`:

Update the header test:

```ts
  it("renders a Quest / Required items / Objectives / Rewards header", () => {
    const el: HTMLElement = fixture.nativeElement;
    const headers = Array.from(el.querySelectorAll("thead th")).map((th) => th.textContent?.trim());
    expect(headers).toEqual(["Quest", "Required items", "Objectives", "Rewards"]);
  });
```

Give the `trader.quests[0]` fixture object a non-empty `requiredItems` (replacing the `requiredItems: []` added in Task 6):

```ts
        requiredItems: [
          {
            name: "Secure Folder 0060",
            wikiUrl: "https://escapefromtarkov.fandom.com/wiki/Secure_Folder_0060",
            iconUrl: null,
            amount: 1,
            requirement: "Handover item",
            findInRaid: true,
            notes: "",
          },
        ],
```

Add a new test asserting it renders:

```ts
  it("renders the quest's required items", () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Secure Folder 0060");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml exec frontend npm test`
Expected: FAIL — header list doesn't include "Required items"; the new test can't find the item name anywhere in the table yet.

- [ ] **Step 3: Wire the column into `quest-table`**

In `frontend/src/app/features/quests/quest-table/quest-table.component.ts`, import and register the new component:

```ts
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { QuestCellComponent } from "../../../shared/quest-cell/quest-cell.component";
import { QuestListComponent } from "../../../shared/quest-list/quest-list.component";
import { RequiredItemListComponent } from "../../../shared/required-item-list/required-item-list.component";
import { sortByCompleted } from "../../../core/quest-sort";
import type { QuestDto, TraderDto, QuestToggledEvent } from "../../../core/api/quests.api";

@Component({
  selector: "app-quest-table",
  standalone: true,
  imports: [CommonModule, QuestCellComponent, RequiredItemListComponent, QuestListComponent],
  templateUrl: "./quest-table.component.html",
})
export class QuestTableComponent {
  @Input({ required: true }) trader!: TraderDto;
  @Output() questToggled = new EventEmitter<QuestToggledEvent>();

  sortedQuests(): QuestDto[] {
    return sortByCompleted(this.trader.quests);
  }
}
```

Replace the full contents of `frontend/src/app/features/quests/quest-table/quest-table.component.html`:

```html
<div class="rounded-lg bg-[var(--color-bg)]">
  <table class="w-full text-sm border-collapse mt-10">
    <thead>
      <tr class="text-left text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
        <th class="py-2 pr-2 w-1/6">Quest</th>
        <th class="py-2 pr-2 w-1/4">Required items</th>
        <th class="py-2 pr-4 w-1/3">Objectives</th>
        <th class="py-2 w-1/4">Rewards</th>
      </tr>
    </thead>
    <tbody>
      @for (quest of sortedQuests(); track quest.id) {
        <tr class="border-b border-[var(--color-border)] align-top">
          <td class="py-2 pr-2">
            <app-quest-cell [quest]="quest" (toggled)="questToggled.emit($event)"></app-quest-cell>
          </td>
          <td class="py-2 pr-2 text-[var(--color-text-muted)]">
            <app-required-item-list [items]="quest.requiredItems"></app-required-item-list>
          </td>
          <td class="py-2 pr-4 text-[var(--color-text-muted)]">
            <app-quest-list [items]="quest.objectives"></app-quest-list>
          </td>
          <td class="py-2 text-[var(--color-text-muted)]">
            <app-quest-list [items]="quest.rewards"></app-quest-list>
          </td>
        </tr>
      } @empty {
        <tr>
          <td colspan="4" class="py-3 text-sm text-[var(--color-text-muted)]">No active quests.</td>
        </tr>
      }
    </tbody>
  </table>
</div>
```

- [ ] **Step 4: Run the quest-table tests to verify they pass**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml exec frontend npm test`
Expected: PASS for `QuestTableComponent`'s suite.

- [ ] **Step 5: Write the failing search-results tests**

In `frontend/src/app/features/quests/search-results/search-results.component.spec.ts`:

Update the header test:

```ts
  it("renders a Trader / Quest / Required items / Objectives / Rewards header", () => {
    const el: HTMLElement = fixture.nativeElement;
    const headers = Array.from(el.querySelectorAll("thead th")).map((th) => th.textContent?.trim());
    expect(headers).toEqual(["Trader", "Quest", "Required items", "Objectives", "Rewards"]);
  });
```

Give the first `results` entry a non-empty `requiredItems` (replacing the `requiredItems: []` added in Task 6):

```ts
      requiredItems: [
        {
          name: "Secure Folder 0060",
          wikiUrl: "https://escapefromtarkov.fandom.com/wiki/Secure_Folder_0060",
          iconUrl: null,
          amount: 1,
          requirement: "Handover item",
          findInRaid: true,
          notes: "",
        },
      ],
```

Add a new test:

```ts
  it("renders each result's required items", () => {
    const el: HTMLElement = fixture.nativeElement;
    const rows = el.querySelectorAll("tbody tr");
    expect(rows[0].textContent).toContain("Secure Folder 0060");
  });
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml exec frontend npm test`
Expected: FAIL — same shape of failure as step 2, for the search-results suite.

- [ ] **Step 7: Wire the column into `search-results`**

In `frontend/src/app/features/quests/search-results/search-results.component.ts`, import and register the new component:

```ts
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { QuestCellComponent } from "../../../shared/quest-cell/quest-cell.component";
import { QuestListComponent } from "../../../shared/quest-list/quest-list.component";
import { RequiredItemListComponent } from "../../../shared/required-item-list/required-item-list.component";
import { TraderAvatarComponent } from "../../../shared/trader-avatar/trader-avatar.component";
import { sortByCompleted } from "../../../core/quest-sort";
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
  @Output() questToggled = new EventEmitter<QuestToggledEvent>();

  sortedResults(): SearchResultDto[] {
    return sortByCompleted(this.results);
  }
}
```

Replace the full contents of `frontend/src/app/features/quests/search-results/search-results.component.html`:

```html
<div class="rounded-lg bg-[var(--color-bg)]">
  <table class="w-full text-sm border-collapse">
    <thead>
      <tr class="text-left text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
        <th class="py-2 pr-2 w-28">Trader</th>
        <th class="py-2 pr-2 w-1/6">Quest</th>
        <th class="py-2 pr-2 w-1/5">Required items</th>
        <th class="py-2 pr-4 w-1/3">Objectives</th>
        <th class="py-2 w-1/4">Rewards</th>
      </tr>
    </thead>
    <tbody>
      @for (quest of sortedResults(); track quest.id) {
        <tr class="border-b border-[var(--color-border)] align-top">
          <td class="py-2 pr-2">
            <div class="flex items-center gap-2 text-[var(--color-accent)]">
              <app-trader-avatar [name]="quest.traderName" [imageUrl]="quest.traderImageUrl"></app-trader-avatar>
              <span class="truncate">{{ quest.traderName }}</span>
            </div>
          </td>
          <td class="py-2 pr-2">
            <app-quest-cell [quest]="quest" (toggled)="questToggled.emit($event)"></app-quest-cell>
          </td>
          <td class="py-2 pr-2 text-[var(--color-text-muted)]">
            <app-required-item-list [items]="quest.requiredItems"></app-required-item-list>
          </td>
          <td class="py-2 pr-4 text-[var(--color-text-muted)]">
            <app-quest-list [items]="quest.objectives"></app-quest-list>
          </td>
          <td class="py-2 text-[var(--color-text-muted)]">
            <app-quest-list [items]="quest.rewards"></app-quest-list>
          </td>
        </tr>
      } @empty {
        <tr>
          <td colspan="5" class="py-3 text-sm text-[var(--color-text-muted)]">No quests found matching your search.</td>
        </tr>
      }
    </tbody>
  </table>
</div>
```

- [ ] **Step 8: Run the full frontend test suite**

Run: `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml exec frontend npm test`
Expected: PASS, all suites green.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/features/quests/quest-table/ frontend/src/app/features/quests/search-results/
git commit -m "feat(quests): show required items between Quest and Objectives"
```

---

## Manual verification (after Task 8)

Automated tests use inline/fixture HTML, not a live scrape. Once all tasks are done, verify the real end-to-end flow once:

1. `docker compose -f run/docker-compose.yml -f run/docker-compose.dev.yml up -d --build`
2. Open the app (frontend dev server, per `docker-compose.dev.yml`, is on host port 4200) and click "Run scrape". Expect it to take on the order of a minute or two, not fail with a timeout, and not lose the "no active quests" fallback for traders that end up empty mid-run.
3. Confirm the "Required items" column shows icons/names/quantities for a quest known to have them (e.g. search for "Health Care Privacy - Part 2"), and is empty for a quest known not to (e.g. "Debut").
4. Confirm item icon files appear under the backend's data volume at `item-images/` and are served at `/api/item-images/<file>`.
