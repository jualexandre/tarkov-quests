# Tarkov Quests Tracker — Design Spec

Date: 2026-09-09
Status: Approved by user, ready for implementation planning

## Purpose

A self-hosted, single-user web application that scrapes the quest list from the
[Escape from Tarkov Fandom wiki](https://escapefromtarkov.fandom.com/wiki/Quests), stores it
in a local database, displays it grouped by trader, and lets the user check off quests they
have completed in-game. The user triggers scrapes manually to refresh the data when the wiki
changes.

## Non-goals

- No multi-user support, authentication, or remote/internet exposure. This runs solo, on the
  user's own machine, via Docker Compose.
- No automatic/scheduled scraping — the user triggers it manually from the UI.
- No quest-chain/prerequisite graph, no filtering/search beyond grouping by trader. Keep the
  UI to what was asked: list quests per trader with completion checkboxes.

## Source data & scraping approach

Direct HTTP requests to `https://escapefromtarkov.fandom.com/wiki/Quests` are blocked by a
Cloudflare JS challenge (`cf-mitigated: challenge`, HTTP 403). This was confirmed by curling
the page directly.

However, the wiki's **MediaWiki API** is not behind that challenge and returns clean,
already-parsed HTML:

```
GET https://escapefromtarkov.fandom.com/api.php?action=parse&page=Quests&format=json&prop=text
```

This was verified to return HTTP 200 with the full rendered page HTML in
`.parse.text["*"]`. No headless browser is needed.

### Page structure (confirmed by inspection)

The "List of Quests" section is a tabber (`ul.wds-tabs__tab` for tab labels, in trader order:
Prapor, Therapist, Fence, Skier, Peacekeeper, Mechanic, Ragman, Jaeger, Ref, Lightkeeper, BTR
Driver). Each tab has a corresponding `table.wikitable` (11 tables total, same DOM order as
the tabs) with rows shaped as:

| Column (td index) | Content |
|---|---|
| 0 | Checkbox cell (wiki's own progress tracker — ignored) |
| 1 | Quest name, as a link: `<a href="/wiki/<Slug>" title="...">Name</a>` |
| 2 | Objectives: `<ul><li>...</li></ul>` |
| 3 | Rewards: `<ul><li>...</li></ul>` |

The `href` of the quest name link (e.g. `/wiki/Shooting_Cans`) gives a stable, globally-unique
slug to use as the natural key for upserts — more robust than the display name, which is not
guaranteed unique across the whole wiki (trader assignment is effectively immutable).

## Architecture

Two Docker containers, orchestrated by `docker-compose`:

- **`backend`**: Node.js + Express + TypeScript. Owns the scraper, the REST API, and the
  SQLite database file (on a named Docker volume for persistence across container restarts).
- **`frontend`**: Angular 22, built and served as static files via nginx. Talks to the backend
  through `/api/*`, proxied by nginx to the backend container.

```
┌─────────────┐        /api/*        ┌─────────────┐        HTTP        ┌──────────────────┐
│  frontend   │ ───────proxy───────> │   backend   │ ──────────────────>│ Fandom wiki API   │
│  (nginx)    │ <────── JSON ─────── │ (Express)   │ <────── HTML ───────│ (api.php)         │
└─────────────┘                      └──────┬──────┘                    └──────────────────┘
                                             │
                                       ┌─────▼─────┐
                                       │  SQLite   │
                                       │ (volume)  │
                                       └───────────┘
```

### Why SQLite over PostgreSQL

Single user, no meaningful write concurrency (one person toggling checkboxes and occasionally
triggering a scrape). SQLite as a file on a Docker volume avoids running and configuring a
third container, credentials, and networking for a database that will never see concurrent
load. This keeps `docker-compose` to two services.

## Data model (Prisma schema, conceptual)

```prisma
model Trader {
  id       Int     @id @default(autoincrement())
  name     String  @unique
  slug     String  @unique
  tabOrder Int     // display order, matches wiki tab order
  quests   Quest[]
}

model Quest {
  id          Int      @id @default(autoincrement())
  traderId    Int
  trader      Trader   @relation(fields: [traderId], references: [id])
  name        String
  wikiSlug    String   @unique   // natural key for upsert, from the quest's wiki URL
  wikiUrl     String
  objectives  String              // JSON-encoded string[]
  rewards     String              // JSON-encoded string[]
  completed   Boolean  @default(false)
  active      Boolean  @default(true) // false = no longer present on the wiki as of last scrape
  lastSeenAt  DateTime
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

`objectives`/`rewards` are stored as JSON-encoded string arrays rather than separate tables —
they are display-only lists with no query needs of their own (YAGNI).

## Scrape behavior (upsert semantics)

On each manual scrape:

1. Fetch and parse the wiki page as described above.
2. Upsert each `Trader` by `name` (create if missing, update `tabOrder`).
3. Upsert each `Quest` by `wikiSlug`:
   - New slug → create with `completed=false`, `active=true`.
   - Existing slug → update `name`/`objectives`/`rewards`/`traderId`/`lastSeenAt`, **do not
     touch `completed`**.
4. Any `Quest` not seen in this run (by `wikiSlug`) is marked `active=false`. Its row and
   `completed` state are preserved, not deleted — it simply drops out of the default view.
5. Return a summary: `{ added, updated, deactivated, totalQuests }`.

This preserves the user's completion progress across wiki changes (renames handled as
"new quest" only if the URL slug itself changes, which is rare for existing quests).

## Backend design

Feature-based folder structure; Prisma access is confined to repository classes behind
TypeScript interfaces, so controllers/services depend on abstractions, not on Prisma directly.

```
backend/
  src/
    features/
      quests/
        quest.routes.ts
        quest.controller.ts
        quest.repository.ts     # implements QuestRepository using Prisma
        quest.types.ts          # QuestRepository interface + DTOs
      traders/
        trader.routes.ts
        trader.controller.ts
        trader.repository.ts
        trader.types.ts
      scraper/
        scraper.service.ts      # fetch wiki API + cheerio parsing + upsert orchestration
        scraper.routes.ts
        scraper.controller.ts
    shared/
      prisma-client.ts          # singleton PrismaClient
      http/app.ts               # Express app setup, error handling middleware
    server.ts
  prisma/
    schema.prisma
  test/
    fixtures/quests-page.html   # saved copy of the API response for offline parser tests
  Dockerfile
```

### API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/traders` | Traders with their active quests, in wiki tab order |
| PATCH | `/api/quests/:id` | Body `{ completed: boolean }` — toggle a quest's completion |
| POST | `/api/scrape` | Runs a scrape synchronously, returns the summary |

The scrape is a single HTTP fetch + HTML parse — fast enough to stay synchronous. No job
queue or background worker; this keeps the backend simple for a solo-use tool (YAGNI).

## Frontend design

Angular 22, TailwindCSS (no component kit — utility classes only), NGXS for state.

```
frontend/
  src/
    app/
      features/
        quests/
          state/
            quests.state.ts        # NGXS state: traders, quests, loading, lastScrapeSummary
            quests.actions.ts      # LoadTraders, ToggleQuestCompleted, RunScrape
          quests-page/
            quests-page.component.ts   # page shell, "Run scrape" button, scrape summary toast
          trader-column/
            trader-column.component.ts # one trader's block of quests
          quest-item/
            quest-item.component.ts    # checkbox, name, wiki link, expandable objectives/rewards
      core/
        api/
          quests.api.ts           # typed HTTP calls to the backend
      app.config.ts               # NGXS + HttpClient providers
  tailwind.config.js
  styles.css                      # @tailwind directives + dark theme tokens
  Dockerfile                      # multi-stage: `ng build` then nginx
  nginx.conf                      # serves static files, proxies /api to the backend service
```

Dark theme is implemented with Tailwind utility classes and CSS custom properties, no external
UI kit, to honor "Tailwind pur". Visual design (spacing, hierarchy, palette specifics) will be
refined during implementation using the frontend-design skill, rather than being a generic
`bg-gray-900` theme.

## Docker Compose

```yaml
services:
  backend:
    build: ./backend
    volumes:
      - tarkov_data:/app/data   # SQLite file, persists across restarts
    ports:
      - "3000:3000"             # direct API access for debugging
  frontend:
    build: ./frontend
    ports:
      - "8080:80"
    depends_on:
      - backend
volumes:
  tarkov_data:
```

## Testing strategy

- **Backend**: unit tests for the scraper's HTML parsing against a saved fixture file (no
  network calls in tests), and repository tests against a throwaway SQLite test database.
  Runner: Vitest.
- **Frontend**: component tests for the quest list rendering and checkbox toggling, using
  Angular's default runner (Karma/Jasmine) unless the user requests otherwise at
  implementation time.
- Implementation follows test-driven development (tests before code).

## Open items for implementation planning

None — all decisions needed to start planning have been made and confirmed by the user.
