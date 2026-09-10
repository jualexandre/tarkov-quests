# Tarkov Quests Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted, dark-themed web app that scrapes the Escape from Tarkov Fandom wiki's quest list, stores it grouped by trader in SQLite, and lets the user check off completed quests, all running in Docker via two containers.

**Architecture:** Node.js/Express/TypeScript backend (feature-based folders, Prisma behind repository interfaces, SQLite) exposes a small REST API; an Angular 22 + Tailwind + NGXS frontend consumes it. A scraper feature fetches the wiki's MediaWiki API HTML, parses it with cheerio, and upserts traders/quests by a stable wiki-slug key, preserving completion state across rescrapes.

**Tech Stack:** TypeScript, Express 4, Prisma 5 + SQLite, cheerio, Vitest + Supertest (backend tests); Angular 22 (standalone components), TailwindCSS v4, NGXS, Karma/Jasmine (frontend tests); Docker + docker-compose, nginx.

**Spec:** `docs/superpowers/specs/2026-09-09-tarkov-quests-tracker-design.md`

## Global Constraints

- Backend: Node.js + Express + TypeScript, feature-based folder structure (`src/features/<name>/`).
- All Prisma access goes through repository classes behind TypeScript interfaces — no Prisma imports outside `*.repository.ts` files.
- Database: SQLite only (no PostgreSQL).
- Frontend: Angular 22, standalone components (no NgModules), TailwindCSS utility classes only (no Angular Material / PrimeNG / other component kit), NGXS for state.
- Scrape source: `https://escapefromtarkov.fandom.com/api.php?action=parse&page=Quests&format=json&prop=text` (NOT the plain wiki URL — that is Cloudflare-blocked).
- Quest natural key for upsert: `wikiSlug` (derived from the quest link's `href`, e.g. `/wiki/Shooting_Cans` → `Shooting_Cans`).
- Scraping is synchronous (no job queue/background worker).
- Two Docker containers (`backend`, `frontend`) via one root `../../../run/docker-compose.yml`; SQLite file lives on a named volume.
- Follow TDD: write the failing test before the implementation in every task below.

---

## File Structure

```
tarkov-quests/
  docker-compose.yml
  .gitignore
  backend/
    package.json
    tsconfig.json
    vitest.config.ts
    .env                              # DATABASE_URL="file:./data/dev.db"
    Dockerfile
    prisma/
      schema.prisma
    src/
      shared/
        prisma-client.ts
        http/
          app.ts
          error-handler.ts
      features/
        traders/
          trader.types.ts
          trader.repository.ts
          trader.routes.ts             # (GET /api/traders lives here, backed by QuestRepository)
        quests/
          quest.types.ts
          quest.repository.ts
          quest.routes.ts
        scraper/
          scraper.types.ts
          wiki-parser.ts
          scraper.service.ts
          scraper.routes.ts
      server.ts
    test/
      fixtures/quests-page.json        # saved API response used by wiki-parser tests
      vitest.setup.ts                  # per-test DB row cleanup
  frontend/
    package.json
    angular.json
    tsconfig.json
    postcss.config.json
    Dockerfile
    nginx.conf
    src/
      styles.css
      app/
        app.config.ts
        app.component.ts
        core/
          api/
            quests.api.ts
        features/
          quests/
            state/
              quests.actions.ts
              quests.state.ts
            quest-item/
              quest-item.component.ts
              quest-item.component.html
            trader-column/
              trader-column.component.ts
              trader-column.component.html
            quests-page/
              quests-page.component.ts
              quests-page.component.html
```

---

### Task 1: Backend scaffolding + wiki page parser

**Files:**
- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/vitest.config.ts`, `backend/.gitignore`
- Create: `backend/test/fixtures/quests-page.json`
- Create: `backend/src/features/scraper/scraper.types.ts`
- Create: `backend/src/features/scraper/wiki-parser.ts`
- Test: `backend/src/features/scraper/wiki-parser.test.ts`

**Interfaces:**
- Produces: `ParsedQuest { name: string; wikiSlug: string; wikiUrl: string; objectives: string[]; rewards: string[] }`, `ParsedTrader { name: string; tabOrder: number; quests: ParsedQuest[] }`, `parseQuestsPage(apiResponseJson: string): ParsedTrader[]` — all later scraper work consumes these exact names/shapes.

- [ ] **Step 1: Scaffold the backend project**

Run:
```bash
mkdir -p backend/src/features/scraper backend/test/fixtures
cd backend
npm init -y
npm install express cheerio
npm install -D typescript vitest @types/node @types/express tsx
npx tsc --init
```

Replace `backend/tsconfig.json` with:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

Create `backend/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

Add to `backend/package.json` `"scripts"`:
```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run"
  }
}
```

Create `backend/.gitignore`:
```
node_modules/
dist/
data/
*.db
.env
```

- [ ] **Step 2: Fetch and save a real fixture of the wiki API response**

Run:
```bash
curl -s -A "Mozilla/5.0" "https://escapefromtarkov.fandom.com/api.php?action=parse&page=Quests&format=json&prop=text" -o backend/test/fixtures/quests-page.json
```

Verify it downloaded correctly:
```bash
python3 -c "import json; d = json.load(open('backend/test/fixtures/quests-page.json')); print(len(d['parse']['text']['*']))"
```
Expected: prints a number > 100000 (the page is large). If the command fails or the file is HTML instead of JSON (Cloudflare block), retry with a slightly different `-A` header — this exact URL and header combination was verified working during design.

- [ ] **Step 3: Write the failing test for the parser**

Create `backend/src/features/scraper/scraper.types.ts`:
```typescript
export interface ParsedQuest {
  name: string;
  wikiSlug: string;
  wikiUrl: string;
  objectives: string[];
  rewards: string[];
}

export interface ParsedTrader {
  name: string;
  tabOrder: number;
  quests: ParsedQuest[];
}

export interface ScrapeSummary {
  added: number;
  updated: number;
  deactivated: number;
  totalQuests: number;
}
```

Create `backend/src/features/scraper/wiki-parser.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseQuestsPage } from "./wiki-parser";

function loadFixtureJson(): string {
  return readFileSync(
    join(__dirname, "../../../test/fixtures/quests-page.json"),
    "utf-8"
  );
}

describe("parseQuestsPage", () => {
  it("parses traders in tab order starting with Prapor", () => {
    const traders = parseQuestsPage(loadFixtureJson());
    expect(traders.length).toBeGreaterThanOrEqual(10);
    expect(traders[0].name).toBe("Prapor");
    expect(traders[0].tabOrder).toBe(0);
    expect(traders[1].tabOrder).toBe(1);
  });

  it("parses quest name, wikiSlug and wikiUrl from the first Prapor quest", () => {
    const traders = parseQuestsPage(loadFixtureJson());
    const prapor = traders.find((t) => t.name === "Prapor")!;
    const shootingCans = prapor.quests.find((q) => q.name === "Shooting Cans")!;
    expect(shootingCans).toBeDefined();
    expect(shootingCans.wikiSlug).toBe("Shooting_Cans");
    expect(shootingCans.wikiUrl).toBe("/wiki/Shooting_Cans");
  });

  it("parses objectives and rewards as non-empty string lists", () => {
    const traders = parseQuestsPage(loadFixtureJson());
    const prapor = traders.find((t) => t.name === "Prapor")!;
    const shootingCans = prapor.quests.find((q) => q.name === "Shooting Cans")!;
    expect(shootingCans.objectives.length).toBeGreaterThan(0);
    expect(shootingCans.objectives[0]).toContain("Utyos");
    expect(shootingCans.rewards.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 4: Run the test and confirm it fails**

Run: `cd backend && npx vitest run src/features/scraper/wiki-parser.test.ts`
Expected: FAIL — `Cannot find module './wiki-parser'`

- [ ] **Step 5: Implement the parser**

Create `backend/src/features/scraper/wiki-parser.ts`:
```typescript
import * as cheerio from "cheerio";
import type { ParsedQuest, ParsedTrader } from "./scraper.types";

export function parseQuestsPage(apiResponseJson: string): ParsedTrader[] {
  const parsed = JSON.parse(apiResponseJson);
  const html: string = parsed.parse.text["*"];
  const $ = cheerio.load(html);

  const traderNames = $("li.wds-tabs__tab span[title]")
    .map((_, el) => $(el).attr("title") ?? "")
    .get()
    .filter((name) => name.length > 0);

  const tables = $("table.wikitable").toArray();

  return traderNames.map((name, tabOrder) => {
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

    return { name, tabOrder, quests };
  });
}
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `cd backend && npx vitest run src/features/scraper/wiki-parser.test.ts`
Expected: PASS (3 tests). If the "checkbox cell" detection is off (the real table sometimes has 3 `<td>`s instead of 4 depending on whether the progress-tracking checkbox column renders), adjust the `objectivesCellIndex`/`rewardsCellIndex`/`nameCell` logic to match what the fixture actually contains — inspect `backend/test/fixtures/quests-page.json` directly if a test fails on cell indices.

- [ ] **Step 7: Commit**

```bash
cd backend
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore test/fixtures/quests-page.json src/features/scraper/scraper.types.ts src/features/scraper/wiki-parser.ts src/features/scraper/wiki-parser.test.ts
git commit -m "feat(scraper): add wiki page parser with fixture-based tests"
```

---

### Task 2: Prisma schema + Trader repository

**Files:**
- Create: `backend/prisma/schema.prisma`
- Create: `backend/src/shared/prisma-client.ts`
- Create: `backend/src/features/traders/trader.types.ts`
- Create: `backend/src/features/traders/trader.repository.ts`
- Create: `backend/test/vitest.setup.ts`
- Modify: `backend/vitest.config.ts`
- Test: `backend/src/features/traders/trader.repository.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `Trader { id: number; name: string; slug: string; tabOrder: number }`, `TraderRepository { upsertByName(data: { name: string; slug: string; tabOrder: number }): Promise<Trader>; findAll(): Promise<Trader[]> }`, `PrismaTraderRepository` (class implementing it), `getPrismaClient(): PrismaClient` from `shared/prisma-client.ts` — reused by every later repository.

- [ ] **Step 1: Install Prisma and initialize the schema**

Run:
```bash
cd backend
npm install @prisma/client
npm install -D prisma
```

Create `backend/.env`:
```
DATABASE_URL="file:./data/dev.db"
```

Create `backend/prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Trader {
  id       Int     @id @default(autoincrement())
  name     String  @unique
  slug     String  @unique
  tabOrder Int
  quests   Quest[]
}

model Quest {
  id         Int      @id @default(autoincrement())
  traderId   Int
  trader     Trader   @relation(fields: [traderId], references: [id])
  name       String
  wikiSlug   String   @unique
  wikiUrl    String
  objectives String
  rewards    String
  completed  Boolean  @default(false)
  active     Boolean  @default(true)
  lastSeenAt DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

Run: `mkdir -p backend/data && npx prisma generate` (run from `backend/`)
Expected: "Generated Prisma Client" message, no errors.

- [ ] **Step 2: Wire up the test database and Vitest setup**

Modify `backend/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/vitest.setup.ts"],
    env: {
      DATABASE_URL: "file:./test.db",
    },
  },
});
```

Create `backend/src/shared/prisma-client.ts`:
```typescript
import { PrismaClient } from "@prisma/client";

let client: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (!client) {
    client = new PrismaClient();
  }
  return client;
}
```

Create `backend/test/vitest.setup.ts`:
```typescript
import { afterEach, afterAll } from "vitest";
import { getPrismaClient } from "../src/shared/prisma-client";

const prisma = getPrismaClient();

afterEach(async () => {
  await prisma.quest.deleteMany();
  await prisma.trader.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

Add to `backend/package.json` `"scripts"`:
```json
{
  "scripts": {
    "pretest": "prisma db push --skip-generate --schema=./prisma/schema.prisma --force-reset",
    "test": "vitest run"
  }
}
```
(`pretest` runs automatically before `npm test`; it points at `test.db` because that script inherits `DATABASE_URL` from the shell — instead, set it explicitly: change `pretest` to `"cross-env DATABASE_URL=file:./test.db prisma db push --skip-generate --force-reset"` and run `npm install -D cross-env`.)

Run: `npm install -D cross-env`, then update `backend/package.json` `pretest` script to:
```json
"pretest": "cross-env DATABASE_URL=file:./test.db prisma db push --skip-generate --force-reset"
```

- [ ] **Step 3: Write the failing test for the Trader repository**

Create `backend/src/features/traders/trader.types.ts`:
```typescript
export interface Trader {
  id: number;
  name: string;
  slug: string;
  tabOrder: number;
}

export interface UpsertTraderInput {
  name: string;
  slug: string;
  tabOrder: number;
}

export interface TraderRepository {
  upsertByName(data: UpsertTraderInput): Promise<Trader>;
  findAll(): Promise<Trader[]>;
}
```

Create `backend/src/features/traders/trader.repository.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { PrismaTraderRepository } from "./trader.repository";
import { getPrismaClient } from "../../shared/prisma-client";

describe("PrismaTraderRepository", () => {
  const repo = new PrismaTraderRepository(getPrismaClient());

  it("creates a trader on first upsert", async () => {
    const trader = await repo.upsertByName({ name: "Prapor", slug: "prapor", tabOrder: 0 });
    expect(trader.id).toBeGreaterThan(0);
    expect(trader.name).toBe("Prapor");
    expect(trader.tabOrder).toBe(0);
  });

  it("updates tabOrder on a second upsert with the same name instead of duplicating", async () => {
    await repo.upsertByName({ name: "Prapor", slug: "prapor", tabOrder: 0 });
    await repo.upsertByName({ name: "Prapor", slug: "prapor", tabOrder: 5 });
    const all = await repo.findAll();
    expect(all.filter((t) => t.name === "Prapor")).toHaveLength(1);
    expect(all.find((t) => t.name === "Prapor")?.tabOrder).toBe(5);
  });

  it("findAll returns traders ordered by tabOrder", async () => {
    await repo.upsertByName({ name: "Therapist", slug: "therapist", tabOrder: 1 });
    await repo.upsertByName({ name: "Prapor", slug: "prapor", tabOrder: 0 });
    const all = await repo.findAll();
    expect(all.map((t) => t.name)).toEqual(["Prapor", "Therapist"]);
  });
});
```

- [ ] **Step 4: Run the test and confirm it fails**

Run: `cd backend && npm test -- src/features/traders/trader.repository.test.ts`
Expected: FAIL — `Cannot find module './trader.repository'`

- [ ] **Step 5: Implement the Trader repository**

Create `backend/src/features/traders/trader.repository.ts`:
```typescript
import type { PrismaClient } from "@prisma/client";
import type { Trader, TraderRepository, UpsertTraderInput } from "./trader.types";

export class PrismaTraderRepository implements TraderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertByName(data: UpsertTraderInput): Promise<Trader> {
    return this.prisma.trader.upsert({
      where: { name: data.name },
      create: data,
      update: { slug: data.slug, tabOrder: data.tabOrder },
    });
  }

  async findAll(): Promise<Trader[]> {
    return this.prisma.trader.findMany({ orderBy: { tabOrder: "asc" } });
  }
}
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `cd backend && npm test -- src/features/traders/trader.repository.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
cd backend
git add package.json package-lock.json .env prisma/schema.prisma vitest.config.ts test/vitest.setup.ts src/shared/prisma-client.ts src/features/traders/trader.types.ts src/features/traders/trader.repository.ts src/features/traders/trader.repository.test.ts
git commit -m "feat(traders): add Prisma schema and Trader repository"
```
(`.env` is committed intentionally here since it only contains a local dev SQLite path, not a secret — confirm this is acceptable; if not, move it to `.env.example` and add `.env` to `.gitignore` instead, which is already listed there from Task 1.)

---

### Task 3: Quest repository

**Files:**
- Create: `backend/src/features/quests/quest.types.ts`
- Create: `backend/src/features/quests/quest.repository.ts`
- Test: `backend/src/features/quests/quest.repository.test.ts`

**Interfaces:**
- Consumes: `PrismaTraderRepository` and `getPrismaClient()` from Task 2 (to set up trader fixtures in tests).
- Produces: `Quest { id, traderId, name, wikiSlug, wikiUrl, objectives: string[], rewards: string[], completed, active, lastSeenAt }`, `TraderWithQuests extends Trader { quests: Quest[] }`, `UpsertQuestInput { traderId, name, wikiSlug, wikiUrl, objectives: string[], rewards: string[] }`, `QuestRepository { upsertBySlug(input): Promise<Quest>; updateCompleted(id, completed): Promise<Quest>; findAllActiveGroupedByTrader(): Promise<TraderWithQuests[]>; deactivateNotIn(seenSlugs: string[]): Promise<number> }` — consumed by the scraper service (Task 4) and both HTTP route tasks (Tasks 5 and 6).

- [ ] **Step 1: Write the failing tests for the Quest repository**

Create `backend/src/features/quests/quest.types.ts`:
```typescript
import type { Trader } from "../traders/trader.types";

export interface Quest {
  id: number;
  traderId: number;
  name: string;
  wikiSlug: string;
  wikiUrl: string;
  objectives: string[];
  rewards: string[];
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
}

export interface QuestRepository {
  upsertBySlug(input: UpsertQuestInput): Promise<Quest>;
  updateCompleted(id: number, completed: boolean): Promise<Quest>;
  findAllActiveGroupedByTrader(): Promise<TraderWithQuests[]>;
  deactivateNotIn(seenSlugs: string[]): Promise<number>;
}
```

Create `backend/src/features/quests/quest.repository.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { getPrismaClient } from "../../shared/prisma-client";
import { PrismaTraderRepository } from "../traders/trader.repository";
import { PrismaQuestRepository } from "./quest.repository";

describe("PrismaQuestRepository", () => {
  const prisma = getPrismaClient();
  const traders = new PrismaTraderRepository(prisma);
  const repo = new PrismaQuestRepository(prisma);
  let traderId: number;

  beforeEach(async () => {
    const trader = await traders.upsertByName({ name: "Prapor", slug: "prapor", tabOrder: 0 });
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
    });
    expect(quest.completed).toBe(false);
    expect(quest.active).toBe(true);
    expect(quest.objectives).toEqual(["Locate the Utyos machine gun"]);
  });

  it("preserves completed=true across a second upsert of the same wikiSlug", async () => {
    const first = await repo.upsertBySlug({
      traderId,
      name: "Shooting Cans",
      wikiSlug: "Shooting_Cans",
      wikiUrl: "/wiki/Shooting_Cans",
      objectives: ["a"],
      rewards: ["b"],
    });
    await repo.updateCompleted(first.id, true);

    const second = await repo.upsertBySlug({
      traderId,
      name: "Shooting Cans (renamed)",
      wikiSlug: "Shooting_Cans",
      wikiUrl: "/wiki/Shooting_Cans",
      objectives: ["a", "c"],
      rewards: ["b"],
    });

    expect(second.id).toBe(first.id);
    expect(second.completed).toBe(true);
    expect(second.name).toBe("Shooting Cans (renamed)");
    expect(second.objectives).toEqual(["a", "c"]);
  });

  it("findAllActiveGroupedByTrader returns only active quests, grouped and ordered by trader tabOrder", async () => {
    const therapist = await traders.upsertByName({ name: "Therapist", slug: "therapist", tabOrder: 1 });
    await repo.upsertBySlug({
      traderId,
      name: "Debut",
      wikiSlug: "Debut",
      wikiUrl: "/wiki/Debut",
      objectives: [],
      rewards: [],
    });
    const inactiveQuest = await repo.upsertBySlug({
      traderId: therapist.id,
      name: "Old Quest",
      wikiSlug: "Old_Quest",
      wikiUrl: "/wiki/Old_Quest",
      objectives: [],
      rewards: [],
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
    });
    await repo.upsertBySlug({
      traderId,
      name: "Delivery from the Past",
      wikiSlug: "Delivery_from_the_Past",
      wikiUrl: "/wiki/Delivery_from_the_Past",
      objectives: [],
      rewards: [],
    });

    const deactivatedCount = await repo.deactivateNotIn(["Debut"]);
    expect(deactivatedCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd backend && npm test -- src/features/quests/quest.repository.test.ts`
Expected: FAIL — `Cannot find module './quest.repository'`

- [ ] **Step 3: Implement the Quest repository**

Create `backend/src/features/quests/quest.repository.ts`:
```typescript
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
  completed: boolean;
  active: boolean;
  lastSeenAt: Date;
}): Quest {
  return {
    ...row,
    objectives: JSON.parse(row.objectives),
    rewards: JSON.parse(row.rewards),
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

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd backend && npm test -- src/features/quests/quest.repository.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/features/quests/quest.types.ts src/features/quests/quest.repository.ts src/features/quests/quest.repository.test.ts
git commit -m "feat(quests): add Quest repository with slug-based upsert and deactivation"
```

---

### Task 4: Scraper service orchestration

**Files:**
- Modify: `backend/src/features/scraper/scraper.types.ts`
- Create: `backend/src/features/scraper/scraper.service.ts`
- Test: `backend/src/features/scraper/scraper.service.test.ts`

**Interfaces:**
- Consumes: `parseQuestsPage` (Task 1), `TraderRepository`/`Trader` (Task 2), `QuestRepository`/`Quest` (Task 3).
- Produces: `ScraperService { runScrape(): Promise<ScrapeSummary> }`, `createScraperService(deps: { traderRepository: TraderRepository; questRepository: QuestRepository; fetchQuestsPageJson: () => Promise<string> }): ScraperService` — consumed by the scraper route (Task 6) and `server.ts` (Task 6).

- [ ] **Step 1: Write the failing tests for the scraper service**

Create `backend/src/features/scraper/scraper.service.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { createScraperService } from "./scraper.service";
import type { TraderRepository } from "../traders/trader.types";
import type { QuestRepository } from "../quests/quest.types";

function buildFakeApiResponse() {
  return JSON.stringify({
    parse: {
      text: {
        "*": `
          <ul class="wds-tabs"><li class="wds-tabs__tab"><span title="Prapor"></span></li></ul>
          <table class="wikitable"><tbody>
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
      findAllActiveGroupedByTrader: vi.fn(),
      deactivateNotIn: vi.fn().mockResolvedValue(2),
    };
    const fetchQuestsPageJson = vi.fn().mockResolvedValue(buildFakeApiResponse());

    const service = createScraperService({ traderRepository, questRepository, fetchQuestsPageJson });
    const summary = await service.runScrape();

    expect(traderRepository.upsertByName).toHaveBeenCalledWith({
      name: "Prapor",
      slug: "prapor",
      tabOrder: 0,
    });
    expect(questRepository.upsertBySlug).toHaveBeenCalledWith({
      traderId: 1,
      name: "Debut",
      wikiSlug: "Debut",
      wikiUrl: "/wiki/Debut",
      objectives: ["Eliminate 5 Scavs"],
      rewards: ["+1200 EXP"],
    });
    expect(questRepository.deactivateNotIn).toHaveBeenCalledWith(["Debut"]);
    expect(summary).toEqual({ added: 1, updated: 0, deactivated: 2, totalQuests: 1 });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd backend && npm test -- src/features/scraper/scraper.service.test.ts`
Expected: FAIL — `Cannot find module './scraper.service'`

- [ ] **Step 3: Implement the scraper service**

Modify `backend/src/features/scraper/scraper.types.ts` — append:
```typescript
export interface ScraperService {
  runScrape(): Promise<ScrapeSummary>;
}
```

Create `backend/src/features/scraper/scraper.service.ts`:
```typescript
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
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd backend && npm test -- src/features/scraper/scraper.service.test.ts`
Expected: PASS (1 test)

Note: `countExistingBySlug` re-fetches the full grouped tree per quest, which is wasteful for a real scrape of ~500 rows but keeps the repository interface small and this is a manually-triggered, infrequent, sub-2-second operation even with the overhead — acceptable per the spec's YAGNI stance. If this ever becomes noticeably slow in manual testing (Task 7), revisit by adding a cheaper `QuestRepository.existsBySlug(slug): Promise<boolean>` method instead.

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/features/scraper/scraper.types.ts src/features/scraper/scraper.service.ts src/features/scraper/scraper.service.test.ts
git commit -m "feat(scraper): add scraper service orchestrating parse + upsert + deactivate"
```

---

### Task 5: Express app shell + GET /api/traders

**Files:**
- Create: `backend/src/shared/http/error-handler.ts`
- Create: `backend/src/shared/http/app.ts`
- Create: `backend/src/features/traders/trader.routes.ts`
- Test: `backend/src/features/traders/trader.routes.test.ts`

**Interfaces:**
- Consumes: `QuestRepository`/`TraderWithQuests` (Task 3).
- Produces: `createApp(deps: { questRepository: QuestRepository; scraperService: ScraperService }): Express` — the shared Express app factory extended by Tasks 6 and 7; `createTraderRouter(questRepository: QuestRepository): Router`.

- [ ] **Step 1: Install HTTP test tooling**

Run:
```bash
cd backend
npm install -D supertest @types/supertest
```

- [ ] **Step 2: Write the failing test for GET /api/traders**

Create `backend/src/features/traders/trader.routes.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../shared/http/app";
import type { QuestRepository, TraderWithQuests } from "../quests/quest.types";
import type { ScraperService } from "../scraper/scraper.types";

describe("GET /api/traders", () => {
  it("returns traders with their active quests", async () => {
    const grouped: TraderWithQuests[] = [
      {
        id: 1,
        name: "Prapor",
        slug: "prapor",
        tabOrder: 0,
        quests: [
          {
            id: 1,
            traderId: 1,
            name: "Debut",
            wikiSlug: "Debut",
            wikiUrl: "/wiki/Debut",
            objectives: ["Eliminate 5 Scavs"],
            rewards: ["+1200 EXP"],
            completed: false,
            active: true,
            lastSeenAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ],
      },
    ];
    const questRepository = {
      findAllActiveGroupedByTrader: vi.fn().mockResolvedValue(grouped),
    } as unknown as QuestRepository;
    const scraperService = {} as ScraperService;

    const app = createApp({ questRepository, scraperService });
    const response = await request(app).get("/api/traders");

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].name).toBe("Prapor");
    expect(response.body[0].quests[0].wikiSlug).toBe("Debut");
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `cd backend && npm test -- src/features/traders/trader.routes.test.ts`
Expected: FAIL — `Cannot find module '../../shared/http/app'`

- [ ] **Step 4: Implement the app shell and traders route**

Create `backend/src/shared/http/error-handler.ts`:
```typescript
import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
};
```

Create `backend/src/features/traders/trader.routes.ts`:
```typescript
import { Router } from "express";
import type { QuestRepository } from "../quests/quest.types";

export function createTraderRouter(questRepository: QuestRepository): Router {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      const traders = await questRepository.findAllActiveGroupedByTrader();
      res.json(traders);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

Create `backend/src/shared/http/app.ts`:
```typescript
import express, { type Express } from "express";
import type { QuestRepository } from "../../features/quests/quest.types";
import type { ScraperService } from "../../features/scraper/scraper.types";
import { createTraderRouter } from "../../features/traders/trader.routes";
import { errorHandler } from "./error-handler";

export interface AppDeps {
  questRepository: QuestRepository;
  scraperService: ScraperService;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json());

  app.use("/api/traders", createTraderRouter(deps.questRepository));

  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `cd backend && npm test -- src/features/traders/trader.routes.test.ts`
Expected: PASS (1 test)

- [ ] **Step 6: Commit**

```bash
cd backend
git add package.json package-lock.json src/shared/http/error-handler.ts src/shared/http/app.ts src/features/traders/trader.routes.ts src/features/traders/trader.routes.test.ts
git commit -m "feat(http): add Express app shell and GET /api/traders"
```

---

### Task 6: PATCH /api/quests/:id and POST /api/scrape + server wiring

**Files:**
- Create: `backend/src/features/quests/quest.routes.ts`
- Create: `backend/src/features/scraper/scraper.routes.ts`
- Modify: `backend/src/shared/http/app.ts`
- Create: `backend/src/server.ts`
- Test: `backend/src/features/quests/quest.routes.test.ts`
- Test: `backend/src/features/scraper/scraper.routes.test.ts`

**Interfaces:**
- Consumes: `createApp` (Task 5), `QuestRepository` (Task 3), `ScraperService` (Task 4).
- Produces: fully wired `backend/src/server.ts` entry point, listening on port 3000.

- [ ] **Step 1: Write the failing test for PATCH /api/quests/:id**

Create `backend/src/features/quests/quest.routes.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../shared/http/app";
import type { QuestRepository } from "./quest.types";
import type { ScraperService } from "../scraper/scraper.types";

describe("PATCH /api/quests/:id", () => {
  it("updates completed and returns the updated quest", async () => {
    const updatedQuest = {
      id: 1,
      traderId: 1,
      name: "Debut",
      wikiSlug: "Debut",
      wikiUrl: "/wiki/Debut",
      objectives: [],
      rewards: [],
      completed: true,
      active: true,
      lastSeenAt: new Date(),
    };
    const questRepository = {
      updateCompleted: vi.fn().mockResolvedValue(updatedQuest),
    } as unknown as QuestRepository;
    const scraperService = {} as ScraperService;

    const app = createApp({ questRepository, scraperService });
    const response = await request(app).patch("/api/quests/1").send({ completed: true });

    expect(response.status).toBe(200);
    expect(response.body.completed).toBe(true);
    expect(questRepository.updateCompleted).toHaveBeenCalledWith(1, true);
  });

  it("returns 400 when completed is not a boolean", async () => {
    const questRepository = {} as unknown as QuestRepository;
    const scraperService = {} as ScraperService;
    const app = createApp({ questRepository, scraperService });

    const response = await request(app).patch("/api/quests/1").send({ completed: "yes" });

    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Write the failing test for POST /api/scrape**

Create `backend/src/features/scraper/scraper.routes.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../shared/http/app";
import type { QuestRepository } from "../quests/quest.types";
import type { ScraperService } from "./scraper.types";

describe("POST /api/scrape", () => {
  it("runs the scraper and returns its summary", async () => {
    const summary = { added: 2, updated: 10, deactivated: 1, totalQuests: 12 };
    const scraperService: ScraperService = { runScrape: vi.fn().mockResolvedValue(summary) };
    const questRepository = {} as unknown as QuestRepository;

    const app = createApp({ questRepository, scraperService });
    const response = await request(app).post("/api/scrape");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(summary);
  });
});
```

- [ ] **Step 3: Run both tests and confirm they fail**

Run: `cd backend && npm test -- src/features/quests/quest.routes.test.ts src/features/scraper/scraper.routes.test.ts`
Expected: FAIL — routes return 404 (routers not mounted) / modules not found

- [ ] **Step 4: Implement both routers and wire the app + server**

Create `backend/src/features/quests/quest.routes.ts`:
```typescript
import { Router } from "express";
import type { QuestRepository } from "./quest.types";

export function createQuestRouter(questRepository: QuestRepository): Router {
  const router = Router();

  router.patch("/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const { completed } = req.body;
      if (typeof completed !== "boolean") {
        res.status(400).json({ error: "completed must be a boolean" });
        return;
      }
      const quest = await questRepository.updateCompleted(id, completed);
      res.json(quest);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

Create `backend/src/features/scraper/scraper.routes.ts`:
```typescript
import { Router } from "express";
import type { ScraperService } from "./scraper.types";

export function createScraperRouter(scraperService: ScraperService): Router {
  const router = Router();

  router.post("/", async (_req, res, next) => {
    try {
      const summary = await scraperService.runScrape();
      res.json(summary);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

Modify `backend/src/shared/http/app.ts` — add the two router imports and mounts:
```typescript
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
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json());

  app.use("/api/traders", createTraderRouter(deps.questRepository));
  app.use("/api/quests", createQuestRouter(deps.questRepository));
  app.use("/api/scrape", createScraperRouter(deps.scraperService));

  app.use(errorHandler);
  return app;
}
```

Create `backend/src/server.ts`:
```typescript
import { getPrismaClient } from "./shared/prisma-client";
import { PrismaTraderRepository } from "./features/traders/trader.repository";
import { PrismaQuestRepository } from "./features/quests/quest.repository";
import { createScraperService, fetchQuestsPageJson } from "./features/scraper/scraper.service";
import { createApp } from "./shared/http/app";

const prisma = getPrismaClient();
const traderRepository = new PrismaTraderRepository(prisma);
const questRepository = new PrismaQuestRepository(prisma);
const scraperService = createScraperService({ traderRepository, questRepository, fetchQuestsPageJson });

const app = createApp({ questRepository, scraperService });
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
```

- [ ] **Step 5: Run both tests and confirm they pass**

Run: `cd backend && npm test -- src/features/quests/quest.routes.test.ts src/features/scraper/scraper.routes.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: All tests across every file pass.

- [ ] **Step 7: Manually verify the server boots and the full flow works end-to-end**

Run:
```bash
cd backend
npx prisma db push
npm run dev
```
In another terminal:
```bash
curl -X POST http://localhost:3000/api/scrape
curl http://localhost:3000/api/traders | python3 -m json.tool | head -50
curl -X PATCH http://localhost:3000/api/quests/1 -H "Content-Type: application/json" -d '{"completed": true}'
```
Expected: scrape returns a summary with `totalQuests` in the hundreds; traders list shows Prapor first with nested quests; the PATCH returns the quest with `"completed": true`. Stop the dev server (Ctrl+C) once verified.

- [ ] **Step 8: Commit**

```bash
cd backend
git add src/features/quests/quest.routes.ts src/features/scraper/scraper.routes.ts src/shared/http/app.ts src/server.ts src/features/quests/quest.routes.test.ts src/features/scraper/scraper.routes.test.ts
git commit -m "feat(http): add quest completion and scrape endpoints, wire server entry point"
```

---

### Task 7: Backend Dockerfile

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`

**Interfaces:**
- Consumes: `backend/package.json` scripts (`build`, `start`) and `backend/prisma/schema.prisma` from prior tasks.
- Produces: a backend image that runs migrations then `node dist/server.js`, listening on port 3000, with `/app/data` as the SQLite storage path.

- [ ] **Step 1: Create the Dockerfile**

Create `backend/.dockerignore`:
```
node_modules
dist
data
test.db
.env
```

Create `backend/Dockerfile`:
```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL="file:/app/data/prod.db"
ENV PORT=3000
COPY --from=build /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/server.js"]
```

- [ ] **Step 2: Build the image and confirm it works standalone**

Run:
```bash
cd backend
docker build -t tarkov-quests-backend .
docker run --rm -p 3000:3000 -v tarkov_data_test:/app/data tarkov-quests-backend &
sleep 3
curl -X POST http://localhost:3000/api/scrape
curl http://localhost:3000/api/traders | head -c 300
```
Expected: scrape summary returned, traders JSON returned. Then stop the container:
```bash
docker ps --filter ancestor=tarkov-quests-backend -q | xargs -r docker stop
docker volume rm tarkov_data_test
```

- [ ] **Step 3: Commit**

```bash
cd backend
git add Dockerfile .dockerignore
git commit -m "feat(backend): add production Dockerfile"
```

---

### Task 8: Angular scaffold + Tailwind + core API service

**Files:**
- Create: Angular 22 project under `frontend/` (generated)
- Modify: `frontend/src/styles.css`
- Create: `frontend/postcss.config.json` (or generated equivalent)
- Create: `frontend/src/app/core/api/quests.api.ts`
- Test: `frontend/src/app/core/api/quests.api.spec.ts`

**Interfaces:**
- Produces: `TraderDto { id: number; name: string; slug: string; tabOrder: number; quests: QuestDto[] }`, `QuestDto { id: number; traderId: number; name: string; wikiSlug: string; wikiUrl: string; objectives: string[]; rewards: string[]; completed: boolean; active: boolean; lastSeenAt: string }`, `ScrapeSummaryDto { added: number; updated: number; deactivated: number; totalQuests: number }`, `QuestsApi { getTraders(): Observable<TraderDto[]>; updateQuestCompleted(id: number, completed: boolean): Observable<QuestDto>; runScrape(): Observable<ScrapeSummaryDto> }` — consumed by the NGXS state in Task 9.

- [ ] **Step 1: Scaffold the Angular 22 project**

Run (from the repo root):
```bash
npx -p @angular/cli@22 ng new frontend --standalone --style=css --routing=false --ssr=false --skip-git
cd frontend
```
When prompted, accept defaults (standalone components, no zoneless requirement change needed either way — keep CLI defaults).

- [ ] **Step 2: Install and configure Tailwind CSS v4**

Run:
```bash
npm install tailwindcss @tailwindcss/postcss postcss
```

Create `frontend/.postcssrc.json`:
```json
{
  "plugins": {
    "@tailwindcss/postcss": {}
  }
}
```

Replace the contents of `frontend/src/styles.css`:
```css
@import "tailwindcss";

@theme {
  --color-bg: #0f0f12;
  --color-surface: #1a1a1f;
  --color-surface-hover: #232329;
  --color-border: #2c2c33;
  --color-text: #e4e4e7;
  --color-text-muted: #9a9aa5;
  --color-accent: #d4a24e;
  --color-accent-hover: #e5b563;
}

body {
  background-color: var(--color-bg);
  color: var(--color-text);
}
```

- [ ] **Step 3: Verify the scaffold builds and serves**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Write the failing test for the API service**

Create `frontend/src/app/core/api/quests.api.ts` with only the type definitions first (no implementation yet), so the spec file has something to import types from:
```typescript
export interface QuestDto {
  id: number;
  traderId: number;
  name: string;
  wikiSlug: string;
  wikiUrl: string;
  objectives: string[];
  rewards: string[];
  completed: boolean;
  active: boolean;
  lastSeenAt: string;
}

export interface TraderDto {
  id: number;
  name: string;
  slug: string;
  tabOrder: number;
  quests: QuestDto[];
}

export interface ScrapeSummaryDto {
  added: number;
  updated: number;
  deactivated: number;
  totalQuests: number;
}
```

Create `frontend/src/app/core/api/quests.api.spec.ts`:
```typescript
import { TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting, HttpTestingController } from "@angular/common/http/testing";
import { QuestsApi } from "./quests.api";
import type { TraderDto, ScrapeSummaryDto } from "./quests.api";

describe("QuestsApi", () => {
  let api: QuestsApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [QuestsApi, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(QuestsApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it("getTraders() GETs /api/traders", () => {
    const traders: TraderDto[] = [];
    api.getTraders().subscribe((result) => expect(result).toBe(traders));
    const req = httpMock.expectOne("/api/traders");
    expect(req.request.method).toBe("GET");
    req.flush(traders);
  });

  it("updateQuestCompleted() PATCHes /api/quests/:id", () => {
    api.updateQuestCompleted(5, true).subscribe();
    const req = httpMock.expectOne("/api/quests/5");
    expect(req.request.method).toBe("PATCH");
    expect(req.request.body).toEqual({ completed: true });
    req.flush({});
  });

  it("runScrape() POSTs /api/scrape", () => {
    const summary: ScrapeSummaryDto = { added: 1, updated: 2, deactivated: 0, totalQuests: 3 };
    api.runScrape().subscribe((result) => expect(result).toEqual(summary));
    const req = httpMock.expectOne("/api/scrape");
    expect(req.request.method).toBe("POST");
    req.flush(summary);
  });
});
```

- [ ] **Step 5: Run the test and confirm it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/quests.api.spec.ts'`
Expected: FAIL — `QuestsApi` is not exported / not injectable

- [ ] **Step 6: Implement the API service**

Append to `frontend/src/app/core/api/quests.api.ts`:
```typescript
import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import type { Observable } from "rxjs";

@Injectable({ providedIn: "root" })
export class QuestsApi {
  constructor(private readonly http: HttpClient) {}

  getTraders(): Observable<TraderDto[]> {
    return this.http.get<TraderDto[]>("/api/traders");
  }

  updateQuestCompleted(id: number, completed: boolean): Observable<QuestDto> {
    return this.http.patch<QuestDto>(`/api/quests/${id}`, { completed });
  }

  runScrape(): Observable<ScrapeSummaryDto> {
    return this.http.post<ScrapeSummaryDto>("/api/scrape", {});
  }
}
```

- [ ] **Step 7: Run the test and confirm it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/quests.api.spec.ts'`
Expected: PASS (3 tests)

- [ ] **Step 8: Commit**

```bash
cd frontend
git add -A
git commit -m "feat(frontend): scaffold Angular 22 app with Tailwind and a typed API service"
```

---

### Task 9: NGXS quests state

**Files:**
- Create: `frontend/src/app/features/quests/state/quests.actions.ts`
- Create: `frontend/src/app/features/quests/state/quests.state.ts`
- Modify: `frontend/src/app/app.config.ts`
- Test: `frontend/src/app/features/quests/state/quests.state.spec.ts`

**Interfaces:**
- Consumes: `QuestsApi`, `TraderDto`, `QuestDto`, `ScrapeSummaryDto` (Task 8).
- Produces: `LoadTraders`, `ToggleQuestCompleted { id: number; completed: boolean }`, `RunScrape` action classes; `QuestsStateModel { traders: TraderDto[]; loading: boolean; lastScrapeSummary: ScrapeSummaryDto | null }`; `QuestsState` (NGXS `@State`) with selectors `traders` and `loading` — consumed by the components in Task 10.

- [ ] **Step 1: Install NGXS**

Run:
```bash
cd frontend
npm install @ngxs/store
```

- [ ] **Step 2: Write the failing tests for the state**

Create `frontend/src/app/features/quests/state/quests.actions.ts`:
```typescript
export class LoadTraders {
  static readonly type = "[Quests] Load Traders";
}

export class ToggleQuestCompleted {
  static readonly type = "[Quests] Toggle Quest Completed";
  constructor(public id: number, public completed: boolean) {}
}

export class RunScrape {
  static readonly type = "[Quests] Run Scrape";
}
```

Create `frontend/src/app/features/quests/state/quests.state.spec.ts`:
```typescript
import { TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { of } from "rxjs";
import { vi, type Mock } from "vitest";
import { QuestsState } from "./quests.state";
import { LoadTraders, ToggleQuestCompleted, RunScrape } from "./quests.actions";
import { QuestsApi } from "../../../core/api/quests.api";
import type { TraderDto, QuestDto, ScrapeSummaryDto } from "../../../core/api/quests.api";

describe("QuestsState", () => {
  let store: Store;
  let questsApi: { getTraders: Mock; updateQuestCompleted: Mock; runScrape: Mock };

  const trader: TraderDto = { id: 1, name: "Prapor", slug: "prapor", tabOrder: 0, quests: [] };
  const quest: QuestDto = {
    id: 1,
    traderId: 1,
    name: "Debut",
    wikiSlug: "Debut",
    wikiUrl: "/wiki/Debut",
    objectives: [],
    rewards: [],
    completed: false,
    active: true,
    lastSeenAt: "2026-01-01T00:00:00.000Z",
  };

  beforeEach(() => {
    questsApi = { getTraders: vi.fn(), updateQuestCompleted: vi.fn(), runScrape: vi.fn() };
    TestBed.configureTestingModule({
      imports: [NgxsModule.forRoot([QuestsState])],
      providers: [{ provide: QuestsApi, useValue: questsApi }],
    });
    store = TestBed.inject(Store);
  });

  it("LoadTraders populates traders and clears loading", (done) => {
    questsApi.getTraders.mockReturnValue(of([{ ...trader, quests: [quest] }]));
    store.dispatch(new LoadTraders()).subscribe(() => {
      const traders = store.selectSnapshot(QuestsState.traders);
      expect(traders).toHaveLength(1);
      expect(traders[0].quests[0].name).toBe("Debut");
      expect(store.selectSnapshot(QuestsState.loading)).toBe(false);
      done();
    });
  });

  it("ToggleQuestCompleted updates the quest's completed flag in state", (done) => {
    questsApi.getTraders.mockReturnValue(of([{ ...trader, quests: [quest] }]));
    questsApi.updateQuestCompleted.mockReturnValue(of({ ...quest, completed: true }));

    store.dispatch(new LoadTraders()).subscribe(() => {
      store.dispatch(new ToggleQuestCompleted(1, true)).subscribe(() => {
        const traders = store.selectSnapshot(QuestsState.traders);
        expect(traders[0].quests[0].completed).toBe(true);
        expect(questsApi.updateQuestCompleted).toHaveBeenCalledWith(1, true);
        done();
      });
    });
  });

  it("RunScrape stores the scrape summary and reloads traders", (done) => {
    const summary: ScrapeSummaryDto = { added: 1, updated: 0, deactivated: 0, totalQuests: 1 };
    questsApi.runScrape.mockReturnValue(of(summary));
    questsApi.getTraders.mockReturnValue(of([trader]));

    store.dispatch(new RunScrape()).subscribe(() => {
      expect(store.selectSnapshot(QuestsState.lastScrapeSummary)).toEqual(summary);
      expect(questsApi.getTraders).toHaveBeenCalled();
      done();
    });
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `cd frontend && npx ng test --watch=false --include='**/quests.state.spec.ts'`
Expected: FAIL — `Cannot find module './quests.state'`

- [ ] **Step 4: Implement the NGXS state**

Create `frontend/src/app/features/quests/state/quests.state.ts`:
```typescript
import { Injectable } from "@angular/core";
import { Action, Selector, State, StateContext } from "@ngxs/store";
import { tap, switchMap } from "rxjs/operators";
import { QuestsApi } from "../../../core/api/quests.api";
import type { TraderDto, ScrapeSummaryDto } from "../../../core/api/quests.api";
import { LoadTraders, ToggleQuestCompleted, RunScrape } from "./quests.actions";

export interface QuestsStateModel {
  traders: TraderDto[];
  loading: boolean;
  lastScrapeSummary: ScrapeSummaryDto | null;
}

@State<QuestsStateModel>({
  name: "quests",
  defaults: { traders: [], loading: false, lastScrapeSummary: null },
})
@Injectable()
export class QuestsState {
  constructor(private readonly questsApi: QuestsApi) {}

  @Selector()
  static traders(state: QuestsStateModel): TraderDto[] {
    return state.traders;
  }

  @Selector()
  static loading(state: QuestsStateModel): boolean {
    return state.loading;
  }

  @Selector()
  static lastScrapeSummary(state: QuestsStateModel): ScrapeSummaryDto | null {
    return state.lastScrapeSummary;
  }

  @Action(LoadTraders)
  loadTraders(ctx: StateContext<QuestsStateModel>) {
    ctx.patchState({ loading: true });
    return this.questsApi.getTraders().pipe(
      tap((traders) => ctx.patchState({ traders, loading: false }))
    );
  }

  @Action(ToggleQuestCompleted)
  toggleQuestCompleted(ctx: StateContext<QuestsStateModel>, action: ToggleQuestCompleted) {
    return this.questsApi.updateQuestCompleted(action.id, action.completed).pipe(
      tap((updatedQuest) => {
        const traders = ctx.getState().traders.map((trader) => ({
          ...trader,
          quests: trader.quests.map((quest) => (quest.id === updatedQuest.id ? updatedQuest : quest)),
        }));
        ctx.patchState({ traders });
      })
    );
  }

  @Action(RunScrape)
  runScrape(ctx: StateContext<QuestsStateModel>) {
    ctx.patchState({ loading: true });
    return this.questsApi.runScrape().pipe(
      tap((summary) => ctx.patchState({ lastScrapeSummary: summary })),
      switchMap(() => this.questsApi.getTraders()),
      tap((traders) => ctx.patchState({ traders, loading: false }))
    );
  }
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `cd frontend && npx ng test --watch=false --include='**/quests.state.spec.ts'`
Expected: PASS (3 tests)

- [ ] **Step 6: Wire NGXS into the app config**

Read `frontend/src/app/app.config.ts` first to see the generated content, then modify it to add the store provider alongside the existing providers (keep `provideHttpClient()` if already present from Task 8's usage, adding it if not):
```typescript
import { ApplicationConfig, provideZoneChangeDetection } from "@angular/core";
import { provideHttpClient } from "@angular/common/http";
import { provideStore } from "@ngxs/store";
import { QuestsState } from "./features/quests/state/quests.state";

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(),
    provideStore([QuestsState]),
  ],
};
```

- [ ] **Step 7: Run the full frontend test suite**

Run: `cd frontend && npx ng test --watch=false`
Expected: All specs pass.

- [ ] **Step 8: Commit**

```bash
cd frontend
git add src/app/features/quests/state src/app/app.config.ts package.json package-lock.json
git commit -m "feat(quests): add NGXS state for loading traders, toggling quests, and scraping"
```

---

### Task 10: Quest list components (quest-item, trader-column, quests-page) + dark theme

**Files:**
- Create: `frontend/src/app/features/quests/quest-item/quest-item.component.ts`
- Create: `frontend/src/app/features/quests/quest-item/quest-item.component.html`
- Test: `frontend/src/app/features/quests/quest-item/quest-item.component.spec.ts`
- Create: `frontend/src/app/features/quests/trader-column/trader-column.component.ts`
- Create: `frontend/src/app/features/quests/trader-column/trader-column.component.html`
- Test: `frontend/src/app/features/quests/trader-column/trader-column.component.spec.ts`
- Create: `frontend/src/app/features/quests/quests-page/quests-page.component.ts`
- Create: `frontend/src/app/features/quests/quests-page/quests-page.component.html`
- Test: `frontend/src/app/features/quests/quests-page/quests-page.component.spec.ts`
- Modify: `frontend/src/app/app.component.ts`, `frontend/src/app/app.component.html`

**Interfaces:**
- Consumes: `QuestDto`, `TraderDto` (Task 8); `QuestsState`, `LoadTraders`, `ToggleQuestCompleted`, `RunScrape` (Task 9).
- Produces: `QuestItemComponent { @Input() quest: QuestDto; @Output() toggle: EventEmitter<boolean> }`, `TraderColumnComponent { @Input() trader: TraderDto; @Output() questToggled: EventEmitter<{ id: number; completed: boolean }> }`, `QuestsPageComponent` (standalone, top-level page rendered by `AppComponent`).

- [ ] **Step 1: Write the failing test for QuestItemComponent**

Create `frontend/src/app/features/quests/quest-item/quest-item.component.spec.ts`:
```typescript
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { QuestItemComponent } from "./quest-item.component";
import type { QuestDto } from "../../../core/api/quests.api";

describe("QuestItemComponent", () => {
  let fixture: ComponentFixture<QuestItemComponent>;

  const quest: QuestDto = {
    id: 1,
    traderId: 1,
    name: "Debut",
    wikiSlug: "Debut",
    wikiUrl: "/wiki/Debut",
    objectives: ["Eliminate 5 Scavs"],
    rewards: ["+1200 EXP"],
    completed: false,
    active: true,
    lastSeenAt: "2026-01-01T00:00:00.000Z",
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [QuestItemComponent] });
    fixture = TestBed.createComponent(QuestItemComponent);
    fixture.componentInstance.quest = quest;
    fixture.detectChanges();
  });

  it("renders the quest name and a wiki link", () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Debut");
    const link = el.querySelector("a") as HTMLAnchorElement;
    expect(link.href).toContain("/wiki/Debut");
  });

  it("emits toggle with the new value when the checkbox is clicked", () => {
    const emitted: boolean[] = [];
    fixture.componentInstance.toggle.subscribe((v: boolean) => emitted.push(v));

    const checkbox = fixture.nativeElement.querySelector("input[type=checkbox]") as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));

    expect(emitted).toEqual([true]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/quest-item.component.spec.ts'`
Expected: FAIL — `Cannot find module './quest-item.component'`

- [ ] **Step 3: Implement QuestItemComponent**

Create `frontend/src/app/features/quests/quest-item/quest-item.component.ts`:
```typescript
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import type { QuestDto } from "../../../core/api/quests.api";

@Component({
  selector: "app-quest-item",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./quest-item.component.html",
})
export class QuestItemComponent {
  @Input({ required: true }) quest!: QuestDto;
  @Output() toggle = new EventEmitter<boolean>();

  wikiBaseUrl = "https://escapefromtarkov.fandom.com";
  expanded = false;

  onToggle(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.toggle.emit(checked);
  }

  toggleExpanded(): void {
    this.expanded = !this.expanded;
  }
}
```

Create `frontend/src/app/features/quests/quest-item/quest-item.component.html`:
```html
<div class="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 mb-2">
  <div class="flex items-start gap-3">
    <input
      type="checkbox"
      class="mt-1 h-4 w-4 accent-[var(--color-accent)]"
      [checked]="quest.completed"
      (change)="onToggle($event)"
    />
    <div class="flex-1">
      <div class="flex items-center justify-between gap-2">
        <a
          [href]="wikiBaseUrl + quest.wikiUrl"
          target="_blank"
          rel="noopener"
          class="font-medium"
          [class.line-through]="quest.completed"
          [class.text-[var(--color-text-muted)]]="quest.completed"
        >
          {{ quest.name }}
        </a>
        <button
          type="button"
          class="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
          (click)="toggleExpanded()"
        >
          {{ expanded ? "Hide details" : "Show details" }}
        </button>
      </div>

      @if (expanded) {
        <div class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-[var(--color-text-muted)]">
          <div>
            <p class="font-semibold text-[var(--color-text)] mb-1">Objectives</p>
            <ul class="list-disc list-inside space-y-0.5">
              @for (objective of quest.objectives; track objective) {
                <li>{{ objective }}</li>
              }
            </ul>
          </div>
          <div>
            <p class="font-semibold text-[var(--color-text)] mb-1">Rewards</p>
            <ul class="list-disc list-inside space-y-0.5">
              @for (reward of quest.rewards; track reward) {
                <li>{{ reward }}</li>
              }
            </ul>
          </div>
        </div>
      }
    </div>
  </div>
</div>
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/quest-item.component.spec.ts'`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing test for TraderColumnComponent**

Create `frontend/src/app/features/quests/trader-column/trader-column.component.spec.ts`:
```typescript
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { TraderColumnComponent } from "./trader-column.component";
import type { TraderDto } from "../../../core/api/quests.api";

describe("TraderColumnComponent", () => {
  let fixture: ComponentFixture<TraderColumnComponent>;

  const trader: TraderDto = {
    id: 1,
    name: "Prapor",
    slug: "prapor",
    tabOrder: 0,
    quests: [
      {
        id: 1,
        traderId: 1,
        name: "Debut",
        wikiSlug: "Debut",
        wikiUrl: "/wiki/Debut",
        objectives: [],
        rewards: [],
        completed: false,
        active: true,
        lastSeenAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TraderColumnComponent] });
    fixture = TestBed.createComponent(TraderColumnComponent);
    fixture.componentInstance.trader = trader;
    fixture.detectChanges();
  });

  it("renders the trader name and one quest item per quest", () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Prapor");
    expect(el.querySelectorAll("app-quest-item").length).toBe(1);
  });

  it("re-emits questToggled with the quest id when a quest-item toggles", () => {
    const emitted: Array<{ id: number; completed: boolean }> = [];
    fixture.componentInstance.questToggled.subscribe((v) => emitted.push(v));

    const questItemDebugEl = fixture.nativeElement.querySelector("app-quest-item");
    questItemDebugEl.dispatchEvent(new CustomEvent("toggle", { detail: true }));
    fixture.componentInstance.onQuestToggle(1, true);

    expect(emitted).toEqual([{ id: 1, completed: true }]);
  });
});
```

- [ ] **Step 6: Run the test and confirm it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/trader-column.component.spec.ts'`
Expected: FAIL — `Cannot find module './trader-column.component'`

- [ ] **Step 7: Implement TraderColumnComponent**

Create `frontend/src/app/features/quests/trader-column/trader-column.component.ts`:
```typescript
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { QuestItemComponent } from "../quest-item/quest-item.component";
import type { TraderDto } from "../../../core/api/quests.api";

@Component({
  selector: "app-trader-column",
  standalone: true,
  imports: [CommonModule, QuestItemComponent],
  templateUrl: "./trader-column.component.html",
})
export class TraderColumnComponent {
  @Input({ required: true }) trader!: TraderDto;
  @Output() questToggled = new EventEmitter<{ id: number; completed: boolean }>();

  onQuestToggle(id: number, completed: boolean): void {
    this.questToggled.emit({ id, completed });
  }
}
```

Create `frontend/src/app/features/quests/trader-column/trader-column.component.html`:
```html
<div class="rounded-lg bg-[var(--color-bg)] p-2 min-w-[280px]">
  <h2 class="text-lg font-semibold mb-3 text-[var(--color-accent)]">{{ trader.name }}</h2>
  @for (quest of trader.quests; track quest.id) {
    <app-quest-item [quest]="quest" (toggle)="onQuestToggle(quest.id, $event)"></app-quest-item>
  } @empty {
    <p class="text-sm text-[var(--color-text-muted)]">No active quests.</p>
  }
</div>
```

- [ ] **Step 8: Run the test and confirm it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/trader-column.component.spec.ts'`
Expected: PASS (2 tests)

- [ ] **Step 9: Write the failing test for QuestsPageComponent**

Create `frontend/src/app/features/quests/quests-page/quests-page.component.spec.ts`:
```typescript
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { of } from "rxjs";
import { vi, type Mock } from "vitest";
import { QuestsPageComponent } from "./quests-page.component";
import { QuestsState } from "../state/quests.state";
import { QuestsApi } from "../../../core/api/quests.api";
import type { TraderDto } from "../../../core/api/quests.api";

describe("QuestsPageComponent", () => {
  let fixture: ComponentFixture<QuestsPageComponent>;
  let questsApi: { getTraders: Mock; updateQuestCompleted: Mock; runScrape: Mock };

  const trader: TraderDto = { id: 1, name: "Prapor", slug: "prapor", tabOrder: 0, quests: [] };

  beforeEach(() => {
    questsApi = { getTraders: vi.fn(), updateQuestCompleted: vi.fn(), runScrape: vi.fn() };
    questsApi.getTraders.mockReturnValue(of([trader]));

    TestBed.configureTestingModule({
      imports: [QuestsPageComponent, NgxsModule.forRoot([QuestsState])],
      providers: [{ provide: QuestsApi, useValue: questsApi }],
    });

    fixture = TestBed.createComponent(QuestsPageComponent);
    fixture.detectChanges();
  });

  it("loads traders on init and renders one trader-column per trader", () => {
    expect(questsApi.getTraders).toHaveBeenCalled();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll("app-trader-column").length).toBe(1);
  });

  it("dispatches RunScrape when the scrape button is clicked", () => {
    questsApi.runScrape.mockReturnValue(of({ added: 0, updated: 0, deactivated: 0, totalQuests: 0 }));
    const button = fixture.nativeElement.querySelector("button") as HTMLButtonElement;
    button.click();
    expect(questsApi.runScrape).toHaveBeenCalled();
  });
});
```

- [ ] **Step 10: Run the test and confirm it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/quests-page.component.spec.ts'`
Expected: FAIL — `Cannot find module './quests-page.component'`

- [ ] **Step 11: Implement QuestsPageComponent**

Create `frontend/src/app/features/quests/quests-page/quests-page.component.ts`:
```typescript
import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Store } from "@ngxs/store";
import { Observable } from "rxjs";
import { TraderColumnComponent } from "../trader-column/trader-column.component";
import { QuestsState } from "../state/quests.state";
import { LoadTraders, RunScrape, ToggleQuestCompleted } from "../state/quests.actions";
import type { TraderDto, ScrapeSummaryDto } from "../../../core/api/quests.api";

@Component({
  selector: "app-quests-page",
  standalone: true,
  imports: [CommonModule, TraderColumnComponent],
  templateUrl: "./quests-page.component.html",
})
export class QuestsPageComponent implements OnInit {
  traders$: Observable<TraderDto[]> = this.store.select(QuestsState.traders);
  loading$: Observable<boolean> = this.store.select(QuestsState.loading);
  lastScrapeSummary$: Observable<ScrapeSummaryDto | null> = this.store.select(QuestsState.lastScrapeSummary);

  constructor(private readonly store: Store) {}

  ngOnInit(): void {
    this.store.dispatch(new LoadTraders());
  }

  onRunScrape(): void {
    this.store.dispatch(new RunScrape());
  }

  onQuestToggled(event: { id: number; completed: boolean }): void {
    this.store.dispatch(new ToggleQuestCompleted(event.id, event.completed));
  }
}
```

Create `frontend/src/app/features/quests/quests-page/quests-page.component.html`:
```html
<div class="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] p-4">
  <header class="flex items-center justify-between mb-4">
    <h1 class="text-2xl font-bold">Tarkov Quests</h1>
    <button
      type="button"
      class="px-4 py-2 rounded-md bg-[var(--color-accent)] text-black font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
      [disabled]="loading$ | async"
      (click)="onRunScrape()"
    >
      {{ (loading$ | async) ? "Scraping..." : "Run scrape" }}
    </button>
  </header>

  @if (lastScrapeSummary$ | async; as summary) {
    <p class="text-sm text-[var(--color-text-muted)] mb-4">
      Last scrape: {{ summary.added }} added, {{ summary.updated }} updated, {{ summary.deactivated }} deactivated
      ({{ summary.totalQuests }} total).
    </p>
  }

  <div class="flex flex-wrap gap-4">
    @for (trader of traders$ | async; track trader.id) {
      <app-trader-column [trader]="trader" (questToggled)="onQuestToggled($event)"></app-trader-column>
    }
  </div>
</div>
```

- [ ] **Step 12: Run the test and confirm it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/quests-page.component.spec.ts'`
Expected: PASS (2 tests)

- [ ] **Step 13: Wire QuestsPageComponent into the root AppComponent**

Read `frontend/src/app/app.component.ts` and `frontend/src/app/app.component.html` first, then replace their contents:

`frontend/src/app/app.component.ts`:
```typescript
import { Component } from "@angular/core";
import { QuestsPageComponent } from "./features/quests/quests-page/quests-page.component";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [QuestsPageComponent],
  templateUrl: "./app.component.html",
})
export class AppComponent {}
```

`frontend/src/app/app.component.html`:
```html
<app-quests-page></app-quests-page>
```

- [ ] **Step 14: Run the full frontend test suite**

Run: `cd frontend && npx ng test --watch=false`
Expected: All specs pass.

- [ ] **Step 15: Manually verify in a browser**

Run: `cd frontend && npx ng serve`
Open `http://localhost:4200`. Expected: dark-themed page loads (traders list will be empty until a scrape runs against a live backend — that full-stack check happens in Task 12). Confirm the "Run scrape" button and layout render correctly and match the dark theme tokens. Stop the dev server once confirmed.

- [ ] **Step 16: Commit**

```bash
cd frontend
git add src/app
git commit -m "feat(quests): add quest list UI components wired to NGXS state"
```

---

### Task 11: Frontend Dockerfile + nginx

**Files:**
- Create: `frontend/Dockerfile`
- Create: `frontend/nginx.conf`
- Create: `frontend/.dockerignore`

**Interfaces:**
- Consumes: the Angular build output produced by `ng build` (Task 8-10's app).
- Produces: an nginx-served static frontend image on port 80, proxying `/api/*` to `http://backend:3000/api/*`.

- [ ] **Step 1: Create the nginx config**

Create `frontend/nginx.conf`:
```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://backend:3000/api/;
        proxy_set_header Host $host;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 2: Create the Dockerfile**

Create `frontend/.dockerignore`:
```
node_modules
dist
```

Create `frontend/Dockerfile`:
```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx ng build --configuration production

FROM nginx:1.27-alpine
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

Note: confirm the exact build output path by running `npx ng build --configuration production` locally first and checking where `index.html` lands (Angular 22 with the application builder outputs to `dist/<project-name>/browser`) — adjust the `COPY --from=build` source path in the Dockerfile if it differs.

- [ ] **Step 3: Build the image and confirm it serves**

Run:
```bash
cd frontend
docker build -t tarkov-quests-frontend .
docker run --rm -p 8080:80 tarkov-quests-frontend &
sleep 2
curl -s http://localhost:8080 | grep -o "<title>.*</title>"
docker ps --filter ancestor=tarkov-quests-frontend -q | xargs -r docker stop
```
Expected: prints the page's `<title>` tag, confirming nginx served the built Angular app.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add Dockerfile nginx.conf .dockerignore
git commit -m "feat(frontend): add nginx-based production Dockerfile"
```

---

### Task 12: Root docker-compose + end-to-end verification

**Files:**
- Create: `../../../run/docker-compose.yml`
- Create: `.gitignore` (root)

**Interfaces:**
- Consumes: `backend/Dockerfile` (Task 7), `frontend/Dockerfile` + `nginx.conf` (Task 11).
- Produces: a working `docker-compose up` that serves the full app on `http://localhost:8080`.

- [ ] **Step 1: Create the root .gitignore**

Create `.gitignore` (repo root):
```
node_modules/
dist/
```

- [ ] **Step 2: Create docker-compose.yml**

Create `../../../run/docker-compose.yml`:
```yaml
services:
  backend:
    build: ./backend
    volumes:
      - tarkov_data:/app/data
    ports:
      - "3000:3000"
  frontend:
    build: ./frontend
    ports:
      - "8080:80"
    depends_on:
      - backend

volumes:
  tarkov_data:
```

- [ ] **Step 3: Bring the stack up and verify end-to-end**

Run:
```bash
docker compose up --build -d
sleep 5
curl -X POST http://localhost:8080/api/scrape
curl http://localhost:8080/api/traders | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d), d[0]['name'], len(d[0]['quests']))"
```
Expected: scrape summary with `totalQuests` in the hundreds; the traders count and first trader ("Prapor") with a non-zero quest count print correctly, proving the nginx `/api/` proxy reaches the backend.

Open `http://localhost:8080` in a browser. Expected: dark-themed page, Prapor's tab/column showing quests, and clicking a checkbox persists after a page reload (confirms the PATCH round-trip and the SQLite volume). Click "Run scrape" again and confirm the summary text updates and previously-checked quests stay checked.

- [ ] **Step 4: Tear down or leave running per user preference**

Run: `docker compose down` (or leave `docker compose up -d` running if the user wants the app available immediately — ask before tearing down since this is the final deliverable).

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .gitignore
git commit -m "feat: add docker-compose to orchestrate backend and frontend containers"
```

---

## Self-Review Notes

- **Spec coverage:** manual scrape trigger (Task 6 POST /api/scrape, Task 10 button), checkbox persistence (Task 6 PATCH, Task 9/10 wiring), upsert-by-slug preserving completion (Task 3), trader grouping/ordering (Task 3 `findAllActiveGroupedByTrader`, Task 10 layout), dark theme (Task 8 CSS tokens, Task 10 templates), Docker two-container setup (Tasks 7, 11, 12), feature-pattern + repository isolation (Tasks 2-6 folder layout), Angular 22/Tailwind/NGXS (Tasks 8-10) — all covered.
- **Type consistency:** `ParsedQuest`/`ParsedTrader` (Task 1) → consumed unchanged in `scraper.service.ts` (Task 4). `Quest`/`TraderWithQuests`/`UpsertQuestInput` (Task 3) → consumed unchanged by `scraper.service.ts` (Task 4) and `trader.routes.ts`/`quest.routes.ts` (Tasks 5-6). `QuestDto`/`TraderDto`/`ScrapeSummaryDto` (Task 8) → consumed unchanged by `quests.state.ts` (Task 9) and all three components (Task 10). Verified no naming drift.
- **No placeholders:** every step has runnable code or an exact command; the two spots needing a manual check at implementation time (cell-index fallback in Task 1 Step 6, Angular build output path in Task 11 Step 2) are flagged with concrete instructions on how to verify and adjust, not left as unresolved TODOs.
