# Quest Requirements & Lock State — Design Spec

Date: 2026-09-10
Status: Approved by user, ready for implementation planning

## Purpose

Some quests require the player's PMC to be a certain level, and/or require other quests to be
completed first, before the wiki considers them obtainable. Surface this on each quest, in the
"Quest" column below the "Show on Wiki" link, and visually gray out a quest while its
prerequisites (level and/or prior quests) aren't met yet. Add a character-level input (between
the search bar and "Run scrape") so the app knows the player's current level.

## Non-goals

- No trader loyalty-level tracking or gating. The wiki sometimes states a loyalty-level
  requirement (e.g. "Must reach Loyalty Level 2 with Prapor") — this app has no notion of
  trader reputation, so these lines are shown as plain informational text only and never gray
  out a quest.
- No heuristic inference of prerequisites from quest naming (e.g. assuming "Part 3" requires
  "Part 2" when the wiki doesn't say so explicitly). Only what the wiki's own data expresses is
  used.
- A prerequisite quest slug that isn't found in our own quest set (never scraped, inactive,
  slug mismatch) is silently ignored for gating purposes — it does not gray out the quest.
- The completion checkbox stays clickable regardless of lock state; graying out is purely
  informational, not enforced.

## Source data (confirmed by inspection of the live wiki)

Fetched from the same per-quest detail page already retrieved for required items
(`fetchQuestDetailJson(wikiSlug)` — no new HTTP call needed), two independent blocks:

**1. `<h2 id="Requirements">` section**, a plain `<ul><li>` list, e.g.:

```html
<h2><span class="mw-headline" id="Requirements">Requirements</span>...</h2>
<ul>
  <li>Must be level 30 to start this quest.</li>
  <li>Must reach Loyalty Level 2 with <a href="/wiki/Prapor">Prapor</a> to obtain this quest.</li>
</ul>
```

Not every quest has this section at all (absent → no requirements of either kind). When
present, each `<li>` is either:
- a level requirement: text matches `/level\s+(\d+)/i` and does **not** contain the word
  "loyalty" (case-insensitive) → the number is the required PMC level. Confirmed variants:
  "Must be level 30 to start this quest.", "Must be level 55 to start this quest." (only ever
  one such line per quest in the pages inspected, but nothing prevents treating a second one as
  an override — last one wins).
- a loyalty-level note: contains "loyalty" (e.g. "Must reach Loyalty Level 4 with Mechanic...",
  "Must be Loyalty Level 4 to start this quest") → kept verbatim (sanitized like objectives) as
  a display-only string, never parsed further.
- anything else unrecognized → also kept verbatim as a display-only note, so no wiki phrasing
  is silently dropped.

**2. The infobox's "Related quests" group**, e.g. (`The Punisher - Part 3`):

```html
<table class="va-infobox-group">
  <tbody>
    <tr><th class="va-infobox-header" colspan="3">Related quests</th></tr>
    ...
    <tr>
      <td class="va-infobox-content" style="text-align: center;">Previous:<br /><a href="/wiki/The_Punisher_-_Part_2">The Punisher - Part 2</a></td>
      <td class="va-infobox-spacing-h"></td>
      <td class="va-infobox-content" style="text-align: center;">Leads to:<br /><a href="/wiki/The_Punisher_-_Part_4">The Punisher - Part 4</a></td>
    </tr>
  </tbody>
</table>
```

- The whole "Related quests" group table is absent for quests with no chain relationship at
  all (confirmed on several standalone quests) — absent → no prerequisite quests.
- The first cell whose text starts with "Previous:" holds zero or more `<a href="/wiki/...">`
  links (one per line, separated by `<br/>`); a quest with no predecessor renders a literal `-`
  instead of any link (confirmed on `The Punisher - Part 1`). "Leads to:" is parsed the same way
  but is not used by this feature (not needed for gating).
- Each `<a>`'s `href` yields a `wikiSlug` (`/wiki/<Slug>` → `<Slug>`) the same way quest slugs
  are already derived elsewhere in `wiki-parser.ts`.

## Data model

One new JSON-encoded column on `Quest`, following the `requiredItems` convention:

```prisma
model Quest {
  // ...existing fields...
  requirements String @default("{\"minLevel\":null,\"prerequisiteQuestSlugs\":[],\"loyaltyNotes\":[]}")
}
```

Applied via the project's existing `prisma db push` flow (no migration files in this repo).

Shared shape (`backend/src/features/quests/quest.types.ts`, mirrored in the frontend's
`quests.api.ts`):

```ts
interface QuestRequirements {
  minLevel: number | null;          // PMC level required, or null
  prerequisiteQuestSlugs: string[]; // wikiSlug of each quest that must be completed first
  loyaltyNotes: string[];           // sanitized text, display-only, never gates anything
}
```

`requirements: QuestRequirements` flows through `ParsedQuest`-adjacent detail parsing →
`UpsertQuestInput` → `Quest` (backend) → `QuestDto` (frontend), the same way `requiredItems`
already does.

## Scraping pipeline changes

`wiki-parser.ts` gains `parseRequirements(apiResponseJson): QuestRequirements`, reading the two
blocks above from the same detail-page HTML already parsed for `parseRequiredItems`.

`scraper.service.ts`'s existing detail-fetch phase (Phase A, one fetch per quest) additionally
calls `parseRequirements(detailJson)` and includes the result in that quest's `upsertBySlug`
call. No new fetch, no new concurrency concern — reuses the JSON already retrieved for required
items.

**Error handling**: a failed detail-page fetch already degrades that quest's `requiredItems` to
`[]` (existing behavior); it now also degrades `requirements` to the same all-empty default
(`minLevel: null, prerequisiteQuestSlugs: [], loyaltyNotes: []}`).

## Frontend

**Character level input**: a new `<input type="number">` in `quests-page.component.html`,
between the search bar and the "Run scrape" button. Backed by a `playerLevel` signal in
`QuestsPageComponent`, persisted to `localStorage` (`tarkov-quests.playerLevel`), the same
pattern already used for `selectedTraderId`. Empty/unset means "unknown" — no quest is graying
based on level until a value is entered.

**Cross-trader completion lookup**: prerequisite quests can belong to a different trader than
the quest that requires them, so lock state can't be computed from a single trader's quest list
alone. `QuestsPageComponent` gains a `computed()` building a `Map<wikiSlug, { name, completed
}>` from *all* traders' quests (`traders()`), passed down alongside `playerLevel` through
`quest-table` → `quest-cell` and `search-results` → `quest-cell` (both already route quests
through `QuestCellComponent`).

**Lock computation** (in `QuestCellComponent`, given the quest's own `requirements`, the
completion map, and `playerLevel`):
- locked-by-level: `playerLevel` is set and `< requirements.minLevel`.
- locked-by-prerequisite: at least one slug in `requirements.prerequisiteQuestSlugs` maps to a
  known quest that is not `completed`. A slug missing from the map is ignored (not found ≠ not
  done).
- `locked = locked-by-level || locked-by-prerequisite`.

**Display**, under the existing "Show on Wiki" link:
- if `locked`: quest name rendered dimmed, with a small 🔒 icon; a tooltip (native `title`
  attribute, consistent with the rest of this app's lightweight-interaction style) lists what's
  missing — the required level if not met, and the name of each incomplete prerequisite quest.
- a compact line for the required level (if any) and each prerequisite quest name (if any),
  each shown with a ✓ or 🔒 depending on whether it's currently satisfied.
- `loyaltyNotes`, if any, shown as plain muted text — informational only, never affects `locked`.
- the completion checkbox is unaffected — still toggles normally regardless of `locked`.

## Testing strategy

- `wiki-parser.test.ts`: new fixture-based tests for `parseRequirements` — level-only, loyalty-
  only, both, neither, multiple prerequisite links, no-predecessor (`-` placeholder), and the
  "Related quests" group entirely absent.
- `scraper.service.test.ts`: extended to assert `requirements` reaches `upsertBySlug`, and that
  a failing detail-page fetch degrades it to the all-empty default alongside `requiredItems`.
- Frontend: `quest-cell.component.spec.ts` extended for locked/unlocked rendering (by level, by
  prerequisite, by both, by neither, and the "unknown slug is ignored" case); `quests-page`
  covered for the level input's localStorage persistence and the cross-trader completion map.

## Open items for implementation planning

None — all decisions needed to start planning have been confirmed by the user.
