# Required Items Column — Design Spec

Date: 2026-09-10
Status: Approved by user, ready for implementation planning

## Purpose

Show, for each quest, the items required to complete it (items to find/keep, and items to
hand over), as a new "Required items" column between "Quests" and "Objectives" in the quest
table and search results. This data does not exist on the quest listing page currently
scraped — it only exists on each quest's individual wiki detail page (e.g.
`https://escapefromtarkov.fandom.com/wiki/Health_Care_Privacy_-_Part_2#Guide`), so the scraper
gains a new stage: fetching and parsing one detail page per quest.

## Non-goals

- No live progress bar during scrape — the existing synchronous "Run scrape" button/spinner is
  kept, just relabeled to reflect the longer duration.
- No incremental/"skip already-scraped quests" optimization — every scrape refetches every
  active quest's detail page, trading scrape duration for always-fresh item data.
- No standalone items page, cross-quest item index, or filtering by item. Items are shown
  inline per quest only, the same way objectives/rewards are today.

## Source data (confirmed by inspection)

Each quest's detail page is fetched the same way the listing page is (MediaWiki API, not
subject to the Cloudflare challenge):

```
GET https://escapefromtarkov.fandom.com/api.php?action=parse&page=<wikiSlug>&format=json&prop=text
```

`<wikiSlug>` is the same slug already stored on `Quest.wikiSlug` from the listing scrape.

When a quest has required items, its "Guide" section (`id="Guide"`) is immediately followed by
a `table.wikitable` shaped as:

| Column | Content |
|---|---|
| Icon | `<img data-src="...">` (lazy-loaded), linked to the item's wiki page |
| Item name | `<a href="/wiki/<ItemSlug>">Name</a>` |
| Amount | integer, e.g. `1` |
| Requirement | free text, e.g. `Required` or `Handover item` |
| Find in raid | `N/A`, or `<font color="red">Yes</font>` |
| Notes | arbitrary rich HTML (links, italics) |

The table's first row is a single `<th colspan="7">Related Quest Items</th>` caption — this is
what identifies the table. Confirmed by inspection that quests with **no** required items have
no such table at all (e.g. `Debut`: `Guide` section present, zero `wikitable`s), so detection
is a simple, reliable text match on that caption — no risk of confusing it with another table
on the page.

## Data model

Add one column to `Quest`, following the same convention already used for `objectives`/
`rewards` (JSON-encoded string, not a separate relational table — this is a display-only list
with no query needs of its own):

```prisma
model Quest {
  // ...existing fields...
  requiredItems String @default("[]") // JSON-encoded RequiredItem[]
}
```

Applied via the project's existing `prisma db push` flow (no migration files in this repo).

Shared shape (backend `quest.types.ts` and `scraper.types.ts`, mirrored as a DTO in the
frontend's `quests.api.ts`):

```ts
interface RequiredItem {
  name: string;
  wikiUrl: string | null;   // absolute wiki URL, or null if the item has no link
  iconUrl: string | null;   // downloaded local path, e.g. /api/item-images/<slug>.png
  amount: number;
  requirement: string;      // raw text from the wiki, e.g. "Required" | "Handover item"
  findInRaid: boolean;      // true when the Find-in-raid cell reads "Yes"
  notes: string;            // sanitized HTML fragment (links/font markup normalized)
}
```

`requiredItems: RequiredItem[]` flows through `ParsedQuest` → `UpsertQuestInput` → `Quest`
(backend) → `QuestDto` (frontend), the same way `objectives`/`rewards` already do.

## Scraping pipeline changes

`scraper.service.ts`'s `runScrape()` gains a step per quest, after the existing listing-page
parse and trader upsert:

1. Fetch the quest's detail page JSON (`fetchQuestDetailJson(wikiSlug)`).
2. Parse it with a new `parseRequiredItems(apiResponseJson): RequiredItem[]` in
   `wiki-parser.ts`, using the caption-text detection described above. Returns `[]` when the
   table is absent.
3. For each parsed item with an icon URL, download it via the (generalized, see below) image
   downloader, keyed by the item's own wiki slug — so an item shared by multiple quests (e.g. a
   commonly-used key) is only downloaded once.
4. Include the resulting `requiredItems` in the `upsertBySlug` call for that quest.

**Concurrency**: detail-page fetches run through a small `mapWithConcurrency(items, limit, fn)`
helper (limit ~8) instead of serially, keeping a full scrape (~513 quests today) to roughly a
minute or two rather than several minutes, while remaining reasonably polite to the wiki.

**Error handling**: if one quest's detail-page fetch fails, log a warning and treat that
quest's `requiredItems` as `[]` for this run — it does not abort the whole scrape. Only the
existing "0 quests parsed at all" case remains a hard failure. A later scrape will simply try
that quest again.

**Timeouts**: a full scrape is now a multi-minute synchronous HTTP request end-to-end. Raise:
- nginx `proxy_read_timeout` / `proxy_send_timeout` in `frontend/nginx.conf` (e.g. to `600s`),
  since the frontend container proxies `/api/scrape` to the backend.
- Express's server timeout in `server.ts` (`app.listen(...)` return value's `.timeout`, e.g.
  `600000`ms), so Node itself doesn't close the connection first.

No other UI change for the wait: the existing "Run scrape" / "Scraping..." button label is
kept, just understood to mean "this can take a few minutes" (matches the app's existing
YAGNI/simplicity posture for this rarely-used manual action).

## Item icon downloading

`image-downloader.ts`'s `createImageDownloader` is generalized to accept a
`publicPathPrefix` parameter (today hardcoded to `/api/trader-images/` inline), so the same
factory produces both:
- `downloadTraderImage` → `data/trader-images`, served at `/api/trader-images` (unchanged
  behavior).
- `downloadItemImage` → `data/item-images`, served at `/api/item-images` (new).

`app.ts` gains a second static mount: `app.use("/api/item-images", express.static(deps.itemImagesDir))`.
`server.ts` wires up the second downloader instance and directory the same way the trader one
is wired today.

## Frontend

- `QuestDto.requiredItems: RequiredItemDto[]` added in `quests.api.ts`.
- New shared component `shared/required-item-list/required-item-list.component.ts`, rendering
  the compact chip list agreed on: one row per item with a small icon, the item name, an "×N"
  quantity, and a small badge when the item is a hand-over item and/or requires find-in-raid.
  Visually consistent with the existing `quest-list` component (small muted text) but laid out
  as flex rows instead of bullets, since each entry carries an icon.
- `quest-table.component.html` and `search-results.component.html` (both currently share the
  same Quest/Objectives/Rewards column layout) each gain a `<th>Required items</th>` /
  `<td><app-required-item-list [items]="quest.requiredItems"></app-required-item-list></td>`
  column inserted between Quest and Objectives, per the original request. Column width
  fractions are rebalanced to give the new column reasonable space; exact values are a visual
  detail tuned during implementation, not load-bearing for this spec.

## Testing strategy

- `wiki-parser.test.ts`: new fixture-based tests for `parseRequiredItems` — one fixture with a
  populated "Related Quest Items" table, one without (asserting `[]`).
- `scraper.service.test.ts`: extended to assert `requiredItems` reaches `upsertBySlug`, and
  that a failing detail-page fetch for one quest does not abort the batch.
- `image-downloader.test.ts`: extended/parameterized for the new `publicPathPrefix` option.
- Frontend: new spec for `RequiredItemListComponent`; existing `quest-table` and
  `search-results` component specs updated to assert the new column renders.

## Open items for implementation planning

None — all decisions needed to start planning have been made and confirmed by the user.
