---
title: Post-deploy UI bug-fix sweep
type: fix
status: active
date: 2026-05-24
---

# Post-deploy UI bug-fix sweep

**Scope.** Bugs surfaced during first hands-on use of the live site at
https://latvia-apt-explorer.vercel.app/. This plan is a running list — issues
get appended/restructured as the user reports more. No fixes ship until the
user says "start fixing."

## Issue index

| # | Severity | Area | Status |
|---|----------|------|--------|
| 1 | High    | Layout / horizontal scroll                       | Investigated |
| 2 | Medium  | Sidebar toggleability                            | Investigated |
| 3 | Medium  | Sidebar scroll containment                       | Investigated |
| 4 | High    | Latvian diacritics broken in display font        | Investigated |
| 5 | Medium  | ProjectDetail title shows address, not project   | Investigated |
| 6 | High    | Kaivas kvartāls (and likely others) geocoded to Rīga centroid (riverside) | Investigated |
| 7 | Low     | Hide /compare feature from UI                    | Investigated |
| 8 | Medium  | Default project status = "Jauns"                 | Investigated |
| 9 | Medium  | Cluster click → zoom to next level               | Investigated |
| 10 | Low    | Cluster vs project pin visual differentiation    | Investigated |
| 11 | Medium | ProjectDetail summary: developer, ranges, image, breakdown | Investigated |
| 12 | Medium | Availability breakdown visual (avail/reserved/sold) | Investigated |

Severity rationale: 1, 4, 6 actively misrepresent or break the UI; 2, 3, 5, 8,
9, 11, 12 are fit-and-finish or feature gaps that degrade the experience but
don't break it; 7, 10 are cosmetic.

---

## Issue 1 — Horizontal scrollbar

### What I see

Headless reproduction shows `documentElement.scrollWidth = 1501px` at a 1440px
viewport — a **61px overshoot**. The offending element is the `<aside>` inside
`components/project/ProjectDetail.tsx:55`:

```tsx
<aside className="w-[420px] shrink-0 border-l border-[var(--line)] bg-[var(--paper)] overflow-y-auto">
```

It's 420px wide, but AppShell renders it inside a 360px wrapper at
`components/AppShell.tsx:226`:

```tsx
<div className="flex flex-col w-[360px] shrink-0 border-l border-[var(--line)]">
  {selectedProject ? <ProjectDetail ... /> : <WeightSliders />}
</div>
```

The aside ignores `flex-shrink-0`'s implication and renders at its intrinsic
420px → overflows the wrapper, which has no `overflow-hidden`, so it punches
through the viewport boundary. Same pattern exists at
`components/filters/FilterPanel.tsx` (also declares its own `w-[340px]`,
matched by AppShell's 340px wrapper, so it happens to not overflow — but it's
still double-wrapping).

### Fix

Let the wrapper own the width; the panels become `w-full overflow-y-auto`.

| File | Change |
|---|---|
| `components/project/ProjectDetail.tsx:55` | `w-[420px]` → `w-full` |
| `components/filters/FilterPanel.tsx` (top-level `<aside>`) | drop `w-[340px] shrink-0 border-r` (wrapper provides them) |
| `components/AppShell.tsx:226` | bump wrapper `w-[360px]` → `w-[420px]` so the detail panel matches the design spec (420px), and `w-[340px]` for the filter wrapper stays as is |

After this the wrapper is the single source of truth for sidebar width and
toggleability (issue 2) is a one-line state flip on the wrapper.

### Acceptance

- [ ] Headless `documentElement.scrollWidth === window.innerWidth` at any
  viewport ≥ 1024 px.
- [ ] Selecting a project never introduces horizontal scroll.

---

## Issue 2 — Toggleable sidebars

### Behavior

Each sidebar (left filter panel, right weights/details panel) gets a chevron
toggle on its inner edge. Collapsing makes the panel disappear (width → 0) and
hands the space to the map. A small "show filters" / "show panel" button
appears on the map's edge to bring it back.

### State model

`useState` in AppShell — `[leftOpen, setLeftOpen]` and `[rightOpen, setRightOpen]`,
both default `true`. Mid-session preference; reload restores default-open. No
need to persist to URL (UI preference, not data state) or localStorage (low
value).

If we want persistence later, the natural home is the existing
`PersonalState` blob — add a `ui?: { leftOpen: boolean; rightOpen: boolean }`
field. Defer until someone asks.

### Implementation outline

| File | Change |
|---|---|
| `components/AppShell.tsx` | Add `leftOpen` / `rightOpen` state. Sidebar wrappers conditionally render with width 0 + `overflow-hidden` when closed. Add edge chevron buttons (use `lucide-react`'s `ChevronLeft`/`ChevronRight`). |
| `components/map/Map.tsx` | Add a thin floating bar on the left and right edges that surfaces a "show panel" button when the corresponding sidebar is closed. (Could also live in AppShell as map overlays.) |

The right panel is special because it shows two different things —
`ProjectDetail` (when a project is selected) and `WeightSliders` (otherwise).
"Closed" should mean "panel hidden" regardless. When a user selects a project
with the right panel closed, auto-open it so the user can see the detail
they just requested.

### Acceptance

- [ ] Each sidebar collapsible with one click; a reopener appears on the map edge.
- [ ] Clicking a pin opens the right panel even if it was collapsed.
- [ ] No horizontal scroll in either state.

---

## Issue 3 — Sidebar scroll containment

### Status: mostly already correct; depends on issue 1 fix

The flexbox chain in AppShell is correct: `h-dvh` root → `flex-1 flex min-h-0`
main → `flex-col w-[…] shrink-0` wrappers. The panels themselves have
`overflow-y-auto`. The only reason the page currently appears to scroll is
issue 1 (horizontal overflow), which prevents the page from sitting at exactly
`100dvh`.

After issue 1 lands, verify by:

- [ ] Loading a viewport-tall page; resizing the FilterPanel or WeightSliders
  content (e.g., scrolling weight sliders) does NOT scroll the body.
- [ ] Footer stays glued to the viewport bottom regardless of sidebar content
  length.

If issues persist after issue 1, the likely fix is adding `min-h-0` /
`overflow-hidden` to the sidebar WRAPPERS in AppShell (not the panel asides).
Currently the wrappers are `flex flex-col w-[…] shrink-0 border-…` with no
`min-h-0` or `overflow-hidden` — usually fine because the child panel
controls its own scroll, but worth probing if the symptom recurs.

---

## Issue 4 — Latvian diacritics broken in display font

### What I see

User screenshot shows `"otrā un trešā māja"` rendered as `"otra⁻ un treša⁻ maja"`
— the macron renders as a separate combining mark next to the letter rather
than as a single precomposed glyph.

### Diagnosis

Source text is correctly precomposed: the headless probe shows the h2 contains
`ā = U+0101` (single codepoint), not the decomposed `a + U+0304` sequence. So
the data side is fine.

Fraunces' loaded latin-ext subset declares `U+100-2BA` in its `@unicode-range`,
which *should* cover Latvian. But the rendered output suggests the actual font
file doesn't ship glyphs for the Latvian extended-A precomposed characters —
the browser falls through to the system font, which (depending on macOS / iOS
defaults) may render U+0101 as a base 'a' + combining macron in a stylistically
inconsistent way.

This matches a known issue with Fraunces' Google Fonts variable subsetting
(latin-ext range claimed but not fully populated for some weights/axes).

### Fix options

**Recommended: swap Fraunces for a serif with verified Latvian support.**
Three credible candidates:

| Font | Pros | Cons |
|---|---|---|
| **Playfair Display** | Big, ultra-stylish display serif; Latvian definitely supported (verified on the Latvian Wikipedia Playfair-themed sites). | Less distinctive than Fraunces. |
| **Spectral** (by Production Type) | Modern serif, full Latin Extended A/B, designed for screen body+display use. | Slightly less display-y. |
| **EB Garamond** | Classical, complete extended subset coverage. | Old-style feel, less modern. |

**Fallback option: keep Fraunces, add Playfair Display as a secondary that
takes over for Latvian glyphs only.** CSS `unicode-range` lets us stack:

```css
@font-face {
  font-family: 'Display Stack';
  src: local('Fraunces');
  unicode-range: U+0-2BA, U+2BD-2C5, ...; /* explicit Latin-1 + extras */
}
@font-face {
  font-family: 'Display Stack';
  src: local('Playfair Display');
  unicode-range: U+100-17F; /* Latin Extended-A — Latvian */
}
```

But this is fragile; subset boundaries can shift across Google Fonts updates.

**Verification plan before committing:**

1. Quick local test: build a static HTML with `<h1 style="font-family: 'Fraunces'">Mārpagalmi</h1>` using the Google Fonts `latin-ext` subset, render in headless Chromium, compare pixel diff to the same text in Playfair Display. Confirms whether Fraunces really is the cause vs some Next/Vercel CSS quirk.
2. If confirmed, swap the font in `app/layout.tsx` (single import + variable rename).
3. No other files need changes — `--font-display` CSS variable indirection means component code is untouched.

### Files to change

| File | Change |
|---|---|
| `app/layout.tsx:6-10` | Swap `Fraunces` → chosen font (recommended Playfair Display) |
| `docs/plans/2026-05-20-feat-latvia-apartment-explorer-plan.md` | Update Design Spec font reference for honesty |
| `app/about/page.tsx` (if mentioned anywhere) | Update if attributed |

### Acceptance

- [ ] All h1/h2/h3 with Latvian text render with precomposed glyphs (single
  glyph per codepoint, no visible base + diacritic split).
- [ ] No regression on numeric / English text.
- [ ] Headless screenshot diff against a known-good baseline shows no
  unexpected layout shift.

---

## Issue 5 — ProjectDetail title shows address, not project name

### What I see

- **YIT** project "Mārpagalmi 5" page: ProjectDetail h2 shows "Mārpagalmi 5"
  (building-level), while the parent project family is just "Mārpagalmi".
- **Bonava** project "Tumes iela 27, otrā un trešā māja" page: ProjectDetail
  h2 shows the full building-level address description, while the parent
  family project is "Pīlādžu mājas" (visible only in the URL slug
  `piladzu-majas`).

User wants the project FAMILY name displayed as the title. The building-level
identifier still belongs somewhere (as the address line) but shouldn't be the
heading.

### Root cause

YIT scraper at `scrapers/yit/index.ts:243-261`:
```ts
const candidate: Project = {
  ...
  name: dl.project,       // building-level ("Mārpagalmi 5")
  address,                // street ("Gardenes 6, LV-1002 Rīga")
  ...
};
if (dl.area) candidate.district = dl.area;  // "Āgenskalns"
```

The YIT dataLayer on project pages exposes `subarea` which IS the family name
with proper diacritics (verified earlier: `subarea: "Mārpagalmi"` on the
Mārpagalmi 5 page). We just don't read it.

Bonava scraper at `scrapers/bonava/index.ts` extracts `name` from the page
`<title>` which is the building-level "Tumes iela 27, otrā un trešā māja".
The family name "Pīlādžu mājas" is only available on the parent family page
(`/dzivokli/<city>/<district>/<family>/`, one level up from the project URLs
we currently scrape).

### Fix

**YIT** — simple: prefer `dl.subarea` when present and not literally `"N/A"`,
fall back to `dl.project`.

```ts
// scrapers/yit/index.ts (parseProjectPage)
const name = dl.subarea && dl.subarea !== 'N/A' ? dl.subarea : dl.project;
```

This is a one-line change; data already in the dataLayer.

**Bonava** — needs an extra HTTP per family (~14 families currently). Cache
the family name in a Map keyed by family slug; one fetch per unique family
across the whole scraper run.

```ts
// scrapers/bonava/index.ts (new helper)
async function fetchFamilyName(
  cityDistrictFamily: string,           // e.g., "riga/ziepniekkalns/piladzu-majas"
  cache: Map<string, string>,
): Promise<string | null> {
  if (cache.has(cityDistrictFamily)) return cache.get(cityDistrictFamily)!;
  const url = `https://www.bonava.lv/dzivokli/${cityDistrictFamily}`;
  const res = await politeFetch(url);
  if (!res.ok) { cache.set(cityDistrictFamily, ''); return null; }
  const $ = load(res.body);
  const familyName = extractTitle(res.body) ?? $('h1').first().text().trim();
  cache.set(cityDistrictFamily, familyName);
  return familyName || null;
}
```

In `parseProjectPage`, derive the family path from the URL pattern, fetch the
family name, and use it as `Project.name`. Keep the current per-building name
as a new optional `subName` field on the schema (or stuff it in the address —
but that's lossy).

**Schema change required for option B**: add optional `subName` to
`ApartmentSchema`... actually no, to `ProjectSchema`. Tiny schema bump.

**ProjectDetail UI** — when both `name` and `subName` present, render:

```tsx
<h2 className="font-display text-2xl">{project.name}</h2>
{project.subName ? (
  <p className="text-sm text-[var(--ink-2)]">{project.subName}</p>
) : null}
<p className="text-sm text-[var(--ink-2)]">{project.address}</p>
```

For the map pin tooltip / popup (when we add one), still show `name`.

### Alternative considered

**Use URL family slug + unslugify** instead of fetching the family page:
- Pros: zero HTTP overhead
- Cons: loses diacritics ("piladzu-majas" → "Piladzu Majas" not "Pīlādžu mājas")

Rejected because diacritic loss is exactly what the user is also complaining
about in issue 4.

### Files to change

| File | Change |
|---|---|
| `scrapers/yit/index.ts:~243` | `name: dl.subarea && dl.subarea !== 'N/A' ? dl.subarea : dl.project` |
| `scrapers/bonava/index.ts` | Add `fetchFamilyName()`, call in `parseProjectPage`, set `name` and optional `subName`. |
| `lib/schema.ts` | Add optional `subName: z.string().optional()` to `ProjectSchema`. |
| `components/project/ProjectDetail.tsx:92` | Render `subName` as subheading when present. |
| `data/scraped/*.json` | Will regenerate next scrape; no manual edit. |

### Acceptance

- [ ] YIT Mārpagalmi 3/4/5 all render h2 = "Mārpagalmi", subheading = "Mārpagalmi 3" / "4" / "5".
- [ ] Bonava Tumes iela 25-i, 25-ii both render h2 = "Pīlādžu mājas", subheading = "Tumes iela 25, pirmā māja" etc.
- [ ] Hepsor, Invego, Pillar (no subName) render as before.
- [ ] Tests cover the YIT logic; Bonava family-fetch tested via HTML fixture.

---

## Issue 6 — Kaivas kvartāls (and others) geocoded to Rīga centroid

### What I see

User reports Kaivas kvartāls pin appears riverside near the Daugava — real
address is in Dreiliņi (eastern Rīga, ~5 km from centroid). Confirmed in
data: both "Kaivas kvartāls 1" and "Kaivas kvartāls 2" have
`location.source = "manual"` and `lat=56.95, lng=24.1` — that's the YIT
scraper's hardcoded fallback at `scrapers/yit/index.ts:230`:

```ts
let location: Project['location'] = { lat: 56.95, lng: 24.1, source: 'manual' };
```

That coordinate is the Rīga old town centroid, which happens to be right next
to the Daugava — explaining the riverside pin.

### Scope check

This isn't unique to Kaivas. Across all scrapers I count (rough estimate from
earlier scrape outputs):
- YIT: 2 manual-fallback projects (Kaivas 1, Kaivas 2)
- Bonava: ~10–20 manual-fallback projects (the ones whose names have no
  street+number pattern parseable)
- Pillar: 1 (Mežciema mājas)
- Invego: 3 (Mārupes Sirds, Silves Hills, Vide Ādaži — and Mārupes/Ādaži
  aren't even Rīga, so they're genuinely mislocated)

All collapse to the same point in the old town. Visually they all stack.

### Fix

The right architectural fix is to move the fallback logic INTO the geocoder
so all scrapers benefit. Specifically:

1. **Extend `geocode()` API** to accept an ordered list of address variants
   (`addressVariants: string[]`) instead of a single address. The geocoder
   tries each in order; first hit wins. Result includes which variant matched
   so it can be cached.
2. **Smart fallback defaults** when only one address is passed:
   - Strip postal code → retry
   - District + city → retry
   - City alone → retry
3. **District-level cache** — once we've geocoded "Dreiliņi, Rīga" to a
   centroid, every project we know to be in Dreiliņi can use that fallback
   without re-querying Nominatim.
4. **Mark fallback results clearly** — change the source enum to distinguish
   street-level vs district-level vs city-level geocoding. Today's `'manual'`
   is misleading because nothing was manual; it was a hardcoded centroid.

```ts
// lib/schema.ts
location: z.object({
  lat: z.number(),
  lng: z.number(),
  source: z.enum([
    'vzd', 'janas-seta', 'nominatim',       // street-level
    'nominatim-district',                    // district centroid
    'nominatim-city',                        // city centroid
    'manual',                                // hand-set in overrides
  ]),
})
```

5. **District/city centroid degrades pin styling** — pins backed by district
   or city centroids get a small visual marker ("approximate location") in the
   detail panel and the map tooltip. We never silently lie about precision.

6. **Manual override for the worst offenders** — write
   `data/overrides/geocoding.json` entries for the projects we know about
   right now (Kaivas 1, Kaivas 2, Mārupes Sirds, Vide Ādaži). One line each:

   ```json
   {
     "yit:kaivas iela 48a, lv-1021 rīga": {
       "lat": 56.937, "lng": 24.225, "source": "manual"
     }
   }
   ```

### Implementation order

1. Add the new source enum variants (schema change, type-safe).
2. Refactor `scrapers/base/geocoder/index.ts` to take variants + cache by district.
3. Each scraper passes [street_address, district + city, city] as variants.
4. Manual overrides for the half-dozen worst cases.
5. UI marker in ProjectDetail for non-street-level pins (`"Aptuvena atrašanās"`).

### Files to change

| File | Change |
|---|---|
| `lib/schema.ts` | Add `nominatim-district` and `nominatim-city` to the location.source enum. |
| `scrapers/base/geocoder/index.ts` | Change `geocode` signature to take `{ developer, addressVariants }` (or keep single-address API and add `geocodeWithFallback` wrapper). Track which variant matched. |
| `scrapers/yit/index.ts:~228` | Build a variants array `[parsedAddress, '<district>, Rīga', 'Rīga']` and pass. |
| `scrapers/bonava/index.ts` | Same. |
| `scrapers/pillar/index.ts` | Same. |
| `scrapers/invego/index.ts` | Already has district-fallback inline; replace with the new API call. |
| `scrapers/hepsor/index.ts` | Same. |
| `data/overrides/geocoding.json` | Add the manual overrides we know about. |
| `components/project/ProjectDetail.tsx` | Render an "Aptuvena atrašanās" note when `location.source !== 'nominatim' && location.source !== 'janas-seta' && location.source !== 'manual'`. |
| `lib/data.server.ts` | If schema validation tightens, the loader auto-rejects legacy `'manual'` rows from old scrapes. Need a one-time migration or compatibility shim. |

### Acceptance

- [ ] Re-running all scrapers reduces "stacked at Rīga centroid" pins to zero
  (every project gets either a street-level hit, a district centroid, or a
  manual override entry).
- [ ] Kaivas kvartāls 1 + 2 appear in Dreiliņi.
- [ ] Mārupes Sirds appears in Mārupe (not central Rīga).
- [ ] ProjectDetail shows a clear "approximate location" indicator for any
  pin not backed by street-level geocoding.

---

## Issue 7 — Hide /compare feature from UI

### Approach

Keep the code (so re-enabling later is one revert) but remove every user-facing
entry point. The feature is currently surfaced in five places:

| File | Where | Action |
|---|---|---|
| `components/AppShell.tsx:185-195` | Header "Salīdzināt" link + count badge | Delete the `<Link>` block. |
| `components/project/ProjectDetail.tsx:65-79` | "★ Salīdzināt" star toggle in panel header | Delete the button. |
| `app/sitemap.ts:9` | `/compare` URL in sitemap | Remove the entry. |
| `app/compare/page.tsx` | Route itself | Leave the file in place but the link removal means it's unreachable from the UI. Optionally add a redirect to `/` in the page or delete the file outright. |
| `components/compare/CompareTable.tsx` | Component | Leaves orphaned; no harm. |

### Personal-state cleanup

- `state.saved` array becomes orphaned data (no UI to add or remove). Keep
  storing it — it's harmless. The `toggleSaved` helper stays in
  `lib/personal/hooks.ts` (referenced by the compare page if anyone keeps it).

### Acceptance

- [ ] No "Salīdzināt" link in the header.
- [ ] No star toggle on the project detail panel.
- [ ] Visiting `/compare` directly still loads (orphaned page, ok for now) OR
  redirects to `/` — user preference; recommend leaving as-is for the moment.
- [ ] `sitemap.xml` doesn't advertise `/compare`.

---

## Issue 8 — Default project status = "Jauns" (New)

### What this means

Right now `state.status[projectId]` is `undefined` until the user picks one of
the four chips. Pins of "undefined-status" projects render with the score
percentile gradient (red→amber→green) or with neutral grey for unranked
projects.

User wants: every project starts as "Jauns" by default. That's the baseline
state; tagging as Interesē / Apmeklēts / Noraidīts is a deliberate override.

### Design tension to flag

If the pin color logic is `status > score gradient` and the default status is
`'new'`, then **every pin becomes steel blue by default** and the score
gradient never shows on the map without the user actively classifying projects.

Three resolutions to choose between:

| Option | Pin default | Pros | Cons |
|---|---|---|---|
| **A: status wins always** (recommended) | Steel blue ("new") | Status is the primary visual; map becomes a status map. | Score gradient never visible unless user has tagged projects. |
| **B: 'new' = treat as no status for pins** | Score gradient | Score gradient remains primary; status only changes color for non-default values. | "New" chip selection becomes invisible on the map. |
| **C: score gradient as a thin outer ring around status fill** | Both visible | Most info, no compromise. | Visually busy; pins get larger. |

Recommend Option A: simplest, matches user intent ("all should be New by
default"), score gradient still visible in `ScoreBreakdownDetail` inside the
project panel where ranking is most actionable. Confirm with user before
implementing.

### Implementation

| File | Change |
|---|---|
| `lib/personal/hooks.ts` | Add `getEffectiveStatus(projectId): Status` helper that returns `state.status[id] ?? 'new'`. |
| `components/AppShell.tsx:140, 152` | Replace `personal.status[project.id] ?? null` with `getEffectiveStatus(project.id)`. |
| `components/project/StatusNotes.tsx:26` | Default `current` to `'new'` rather than `null` for chip selected-state. |
| `components/map/Map.tsx` paint expression | Remove the `'!', ['get', 'hasScore']` neutral-grey case if Option A — status is always defined, so unranked projects also get 'new' (blue) by default. Or keep unranked-grey as override for the case where `apartmentCount === 0` (Hepsor/Pillar/Invego). |

### Acceptance

- [ ] Every project's pin is steel blue by default.
- [ ] Status chips show "Jauns" as the active selection by default.
- [ ] Clicking another chip changes both the chip + the pin color.
- [ ] Clicking the active chip a second time does NOT reset to "no status" —
  it stays on the same chip (or wraps to "new"). Confirm UX with user.

---

## Issue 9 — Cluster click should zoom to next zoom level

### Current state

`components/map/Map.tsx:93-100` — the click handler treats all features the
same, including cluster bubbles:

```ts
const handleClick = (e: MapLayerMouseEvent) => {
  const feature = e.features?.[0];
  if (feature?.properties && typeof feature.properties.id === 'string') {
    onSelect?.(feature.properties.id);
  } else {
    onSelect?.(null);
  }
};
```

For a cluster feature, `feature.properties.id` is `undefined` (clusters have
`cluster_id`, not `id`), so the handler falls through to `onSelect?.(null)`
which closes any open detail panel. Useless.

### Fix

Detect cluster features, call MapLibre's standard `getClusterExpansionZoom`,
`easeTo` the cluster center at that zoom.

```ts
// components/map/Map.tsx
const handleClick = (e: MapLayerMouseEvent) => {
  const feature = e.features?.[0];
  if (!feature) { onSelect?.(null); return; }
  const props = feature.properties ?? {};
  // Cluster click → zoom to next level
  if (props.cluster && typeof props.cluster_id === 'number') {
    const map = e.target;
    const src = map.getSource('projects') as maplibregl.GeoJSONSource;
    src.getClusterExpansionZoom(props.cluster_id).then((zoom) => {
      const coords = (feature.geometry as GeoJSON.Point).coordinates;
      map.easeTo({ center: [coords[0], coords[1]], zoom });
    }).catch(() => {});
    return;
  }
  // Single-project click → open detail panel
  if (typeof props.id === 'string') { onSelect?.(props.id); return; }
  onSelect?.(null);
};
```

Note: `getClusterExpansionZoom` returns a Promise in MapLibre 5; older
docs/examples may show a callback API. Use `.then`.

Also set `cursor: 'pointer'` on hover over clusters (already covered by the
existing `cursor="pointer"` Map prop, but worth verifying).

### Acceptance

- [ ] Single click on a cluster zooms the map to a level where the cluster
  expands (either fully splits into pins or splits into smaller sub-clusters).
- [ ] Detail panel state isn't affected by cluster clicks.

---

## Issue 10 — Cluster vs project pin visual differentiation

### Current state

- Cluster: `#C3471A` (warm orange, our `--accent` color), 18–30px radius,
  `#1A1A17` dark stroke, white count text.
- Project pin: color varies by status / score, 8–12px radius, dark stroke
  with build-stage width.

Problem: when many projects rank low (red end of score gradient), the red
project pins and the orange cluster bubbles blend visually because they're
adjacent on the warm-color spectrum.

### Fix

Change cluster styling to a high-contrast NEUTRAL — distinct from any
project-pin color. Two candidates:

| Option | Cluster look | Tradeoff |
|---|---|---|
| **A (recommended)** | Dark `--ink` (#1A1A17) fill, `--paper` (#F5F2EC) count text, no stroke or thin `--ink-3` stroke. | Maximum visual separation from colorful project pins. Inverts the current weight. |
| **B** | `--paper` fill, `--ink` text, thick `--ink` stroke. | "Empty bubble with a number" — looks like a different category entirely. |

Recommended: Option A. Clusters become structural markers (here are N
things), project pins remain the data layer.

### Implementation

`components/map/Map.tsx:151-173` — change the `clusters` + `cluster-count`
layer paint:

```ts
<Layer
  id="clusters"
  type="circle"
  filter={['has', 'point_count']}
  paint={{
    'circle-color': '#1A1A17',           // was #C3471A
    'circle-radius': ['step', ['get', 'point_count'], 18, 5, 24, 20, 30],
    'circle-opacity': 0.95,              // tighter; was 0.85
    'circle-stroke-width': 1,
    'circle-stroke-color': '#F5F2EC',    // light stroke against dark fill
  }}
/>
<Layer
  id="cluster-count"
  ...
  paint={{ 'text-color': '#F5F2EC' }}
/>
```

### Acceptance

- [ ] Clusters visually pop against project pins in any zoom/filter state.
- [ ] Cluster cursor remains pointer (already set).

---

## Issue 11 — ProjectDetail summary: developer, ranges, image, apartment counts

### Spec (per user)

When a project is selected, the right panel should surface, at minimum:

1. Developer name (e.g., "Bonava", "YIT", "Hepsor")
2. m² range across all the project's apartments (`min`–`max`, or single
   value if all the same)
3. Price range across apartments (€min–€max)
4. Bathroom count range
5. Thumbnail image (URL provided by user via override)
6. Total apartments + how many are available
7. Visual breakdown of available / reserved / sold (covered separately in
   Issue 12)

### Data availability check

| Field | Source | Available? |
|---|---|---|
| Developer | `project.developer` (literal enum) | ✓ |
| m² range | `apartments[].area` | ✓ when apartments scraped |
| Price range | `apartments[].price.eur` (when kind = 'amount') | ✓ when apartments scraped |
| Bathroom count range | `apartments[].bathrooms` | **✗ NOT AVAILABLE** — user pushed back ("I believe you can find this when scraping") so I re-investigated thoroughly: dumped all Title/Value pairs from Bonava apartment pages (5 fields total: Platība, Stāvs, Istabas, Cena, Cena par m² — no bathrooms), full-text grep for `vanna|sanmezgl|sanitar|bathroom|wc|tualet` across both YIT and Bonava apartment + project pages (0 hits), checked floor-plan image URLs and alt text (no encoded info). Bathroom count is genuinely not on the public listings — only visible to a human looking at the floor plan PDF. Decision: drop the row from the summary; bathroom info would need OCR of floor plans or direct outreach to developers, both out of scope. |
| Thumbnail image | none today | Need a new override system. |
| Apartment counts | `apartments[]` array | ✓ |

**Bathroom range is blocked.** Two paths:

- (a) Drop it from the summary for now and document the data gap. Recommend
  this — bathroom count is less informative than rooms count for Latvian
  apartments (most 2-3 room have 1 bathroom; 4+ might have 2).
- (b) Add a per-apartment HTML scrape that hunts for bathroom mentions in
  prose. Brittle and likely sparse. Defer.

Plan default: drop bathroom range from the summary (mark "datos nav" or
omit entirely). Mention in commit message + About page that bathroom data
isn't available from public listings.

### Image override system

New override file `data/overrides/project-images.json`:

```json
{
  "yit--ef847be61b92b040": {
    "url": "https://www.yit.lv/.../marpagalmi-5-hero.jpg",
    "alt": "Mārpagalmi 5 fasāde"
  },
  "bonava--3e6a08c23bbacf26": {
    "url": "https://www.bonava.lv/.../piladzu-majas.jpg"
  }
}
```

Loader: `lib/data.server.ts` reads the file (path
`data/overrides/project-images.json`), validates with a zod schema, returns a
`Record<ProjectId, { url: string; alt?: string }>` that AppShell passes down
to ProjectDetail.

CSP: `img-src 'self' https: data: blob:` already permits arbitrary HTTPS, so
hotlinking works without further changes.

Caching path (deferred): if hotlinking proves fragile, move images to
`public/images/<projectId>.jpg` and have a script download from the override
URLs at build time. Single-line change for the user later.

### Range helpers

Add to `lib/format.ts`:

```ts
export function formatAreaRange(apartments: readonly Apartment[]): string | null {
  const areas = apartments.map((a) => a.area).filter((n) => Number.isFinite(n));
  if (areas.length === 0) return null;
  const min = Math.min(...areas);
  const max = Math.max(...areas);
  if (Math.abs(max - min) < 0.1) return formatArea(min);
  return `${formatArea(min)} – ${formatArea(max)}`;
}

export function formatPriceRange(apartments: readonly Apartment[]): string | null {
  const prices = apartments
    .map((a) => (a.price.kind === 'amount' ? a.price.eur : null))
    .filter((n): n is number => n !== null);
  if (prices.length === 0) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return `€${min.toLocaleString('lv-LV')}`;
  return `€${min.toLocaleString('lv-LV')} – €${max.toLocaleString('lv-LV')}`;
}
```

### Developer label

Add a `DEVELOPER_LABELS` constant — humanized names (`yit` → "YIT",
`bonava` → "Bonava", etc.). Lives in `lib/format.ts` or in the developer
literal area of `lib/schema.ts`.

### ProjectDetail layout sketch

Refactor the hero section (currently lines 91-108 of ProjectDetail.tsx) to:

```
┌──────────────────────────────────────────┐
│ ← Atpakaļ                            ×   │
├──────────────────────────────────────────┤
│                                          │
│     [project thumbnail image, 16:9       │
│       fixed aspect-ratio, lazy-load]     │
│                                          │
├──────────────────────────────────────────┤
│ Mārpagalmi                               │
│ (subName: "Mārpagalmi 5")                │
│ Gardenes 6, LV-1002 Rīga                 │
│                                          │
│ [YIT chip] [Gatavs] [Energoklase A]      │
│                                          │
│ ── Kopsavilkums ──                       │
│  Platība:     54 – 89 m²                 │
│  Cena:        €152k – €294k              │
│  Cena/m²:     €2 750 – €3 320            │
│                                          │
│ ── Pieejamība ──                         │
│  [stacked bar: 24 pieejami | 4 rez | 2 pārdoti]   │
│  30 dzīvokļi kopā · 24 pieejami          │
│                                          │
│ ── Vērtējums ── (if scored)              │
│  [ScoreBreakdownDetail]                  │
└──────────────────────────────────────────┘
```

Hero photo is optional; if no override entry, skip it.

### Files to change

| File | Change |
|---|---|
| `lib/schema.ts` | (no change — bathroom drop, image override is runtime). |
| `lib/format.ts` | Add `formatAreaRange`, `formatPriceRange`, `DEVELOPER_LABELS`. |
| `lib/data.server.ts` | Add `loadProjectImages(): Promise<Record<string, ImageOverride>>`. |
| `data/overrides/project-images.json` | New file, empty by default. Documented in README. |
| `components/AppShell.tsx` | Accept `images` from server, pass into ProjectDetail. |
| `components/project/ProjectDetail.tsx` | Add hero `<img>`, summary section (3 rows: area/price/€per m²), availability breakdown (Issue 12). |
| `app/page.tsx` | Load images alongside projects/apartments/runs. |
| `app/about/page.tsx` | Mention bathroom data unavailability + image attribution policy. |

### Acceptance

- [ ] Project panel shows developer name as a chip.
- [ ] m² range and price range shown when apartments are present; gracefully
  hidden when not.
- [ ] Bathroom range not shown (documented gap; revisit if data becomes
  available).
- [ ] Thumbnail renders when an override URL is present; container has fixed
  16:9 aspect to prevent layout shift; broken image shows neutral placeholder.
- [ ] Apartment count visible: "30 dzīvokļi kopā · 24 pieejami".

---

## Issue 12 — Availability breakdown visual

### Spec

Show, visually, the proportion of apartments that are available / reserved /
sold within a project. A single stacked horizontal bar is the natural fit —
matches the existing visual vocabulary of the `ScoreBreakdown` stacked bar.

### Design

```
┌──────────────────────────────────────────┐
│ ████████████░░░░░░░░▓▓                   │  ← stacked bar, h-2 rounded
│ green=avail  amber=reserved  grey=sold   │
├──────────────────────────────────────────┤
│ 24 pieejami · 4 rezervēti · 2 pārdoti    │  ← tiny legend below
└──────────────────────────────────────────┘
```

Colors reuse existing semantic palette:
- Available: `var(--score-100)` (deep green)
- Reserved: `var(--score-50)` (amber)
- Sold: `var(--ink-3)` (muted grey)

This is consistent with the `AvailabilityBadge` colors already in
`components/project/ProjectDetail.tsx`.

### Edge cases

- **Project has zero apartments scraped** (Hepsor/Pillar/Invego, sold-out
  YIT/Bonava): hide the section entirely. The section header reads
  "Pieejamība" — no data to show.
- **All apartments same status**: still show the bar as a single segment;
  the legend reads "24 pieejami" without dot separators for the empty bands.
- **Filter excludes some apartments** (current filter is "rooms=3"):
  show breakdown for THE PROJECT'S TOTAL inventory, not the filtered subset.
  The detail panel is project-level info; filters affect the map, not the
  inventory truth. (This matches how the "Apartments" list section behaves —
  it shows filtered, but the counts are about the unfiltered project total.)

### Implementation

New component `components/project/AvailabilityBreakdown.tsx`:

```tsx
export function AvailabilityBreakdown({ apartments }: { apartments: readonly Apartment[] }) {
  if (apartments.length === 0) return null;
  const counts = { available: 0, reserved: 0, sold: 0 };
  for (const a of apartments) counts[a.availability]++;
  const total = apartments.length;
  return (
    <section className="space-y-2">
      <h3 className="text-[10px] uppercase tracking-wider text-[var(--ink-3)]">Pieejamība</h3>
      <div className="flex h-2 rounded-full overflow-hidden bg-[var(--paper-2)]">
        {counts.available > 0 && <div style={{ width: `${(counts.available / total) * 100}%`, background: 'var(--score-100)' }} />}
        {counts.reserved > 0 && <div style={{ width: `${(counts.reserved / total) * 100}%`, background: 'var(--score-50)' }} />}
        {counts.sold > 0 && <div style={{ width: `${(counts.sold / total) * 100}%`, background: 'var(--ink-3)' }} />}
      </div>
      <div className="text-xs text-[var(--ink-2)] tabular-nums">
        {[
          counts.available > 0 && `${counts.available} pieejami`,
          counts.reserved > 0 && `${counts.reserved} rezervēti`,
          counts.sold > 0 && `${counts.sold} pārdoti`,
        ].filter(Boolean).join(' · ')}
      </div>
    </section>
  );
}
```

NOTE: this needs the FULL project apartments list, not the filter-narrowed
list. ProjectDetail currently receives `apartments: Apartment[]` which is the
filtered list (from AppShell `apartmentsByProject`). We either:

- (a) Pass two lists: filtered + project's full set. Cleaner.
- (b) Pass the parent `Project` and derive `project.apartments`. Simpler if
  Project carries the apartments array at render time (it does — see
  `loadProjects()` which returns full Projects).

Option (b) is cleanest — `project.apartments` is the full set.

### Files to change

| File | Change |
|---|---|
| `components/project/AvailabilityBreakdown.tsx` | New file. |
| `components/project/ProjectDetail.tsx` | Render `<AvailabilityBreakdown apartments={project.apartments} />` inside the summary section. |

### Acceptance

- [ ] Project with apartments shows three-segment stacked bar + legend.
- [ ] Project with no apartments hides the section entirely (no empty box).
- [ ] All-sold project shows a single-color bar (all grey) + "X pārdoti".
- [ ] Colors match the existing availability badge convention (green / amber
  / grey).

---

## Cross-cutting risks

- **Bonava family-fetch (Issue 5)** adds ~14 extra HTTP requests per nightly
  scrape. At 1 req/sec that's 14s extra wall-clock — well within the 5-minute
  budget.
- **Schema enum extension (Issue 6)** is backwards-incompatible: legacy
  scraped JSON with `source: 'manual'` for non-manual fallbacks will fail
  validation. Either keep `'manual'` as the catch-all for those cases (i.e.,
  re-scrape rewrites them as `nominatim-city` etc.) or add a migration step
  in `lib/data.server.ts`.
- **Font swap (Issue 4)** may shift heading metrics; check `/compare` and
  `/about` pages for layout breaks.
- **Sidebar toggleability (Issue 2)** introduces UI state that may interact
  with map ResizeObserver — when the sidebar collapses, MapLibre needs
  `map.resize()` called to redraw at the new container width. Without this,
  the map canvas stays small and there's a grey gap.
- **Default-status 'new' (Issue 8)** changes pin coloring fundamentally —
  the score percentile gradient disappears from the map under Option A.
  Confirm user is OK with that tradeoff before implementing.
- **Image override file (Issue 11)** introduces a new manual data source
  (`data/overrides/project-images.json`). Editing it requires a git commit
  and a redeploy (same workflow as `parking-storage.json`). No in-app form.
- **Hiding /compare (Issue 7)** leaves orphaned code (`/compare` route,
  `CompareTable`, `state.saved`). Decide whether to delete or leave parked.
  Recommend parked for now.

## Suggested fix order

Grouped by what's cheap-and-immediate vs needs-rescrape, ordered to minimize
context switches.

**Pass 1 — pure UI / no data work (one commit, fast):**
1. **Issue 1** (60-second fix; unblocks visual inspection of everything else).
2. **Issue 7** (delete two `<Link>` blocks + sitemap entry).
3. **Issue 4** (verification + font swap).
4. **Issue 10** (cluster color tweak — 3 lines in `Map.tsx`).
5. **Issue 9** (cluster zoom-on-click — 10 lines in `Map.tsx`).
6. **Issue 8** (default status = 'new' — needs UX confirmation first).

**Pass 2 — data & detail panel (one commit, depends on Pass 1):**
7. **Issue 12** (availability breakdown component — pure rendering, no data work).
8. **Issue 11** (developer chip + area/price ranges + image override system).
9. **Issue 2 + 3** together (sidebar toggleability + scroll containment verify).

**Pass 3 — scraper changes that require re-running scrapers (longer wall-clock):**
10. **Issue 5** (YIT one-liner + Bonava family-fetch; schema bump for subName).
11. **Issue 6** (geocoder fallback refactor + source enum bump; manual overrides for known cases).

Pass 3 commits should land BEFORE the next nightly cron so the new
geocodes/names are live by morning. Or trigger `gh workflow run scrape.yml`
manually after the merge.

## References

- Live site: https://latvia-apt-explorer.vercel.app/
- AppShell: `components/AppShell.tsx`
- ProjectDetail: `components/project/ProjectDetail.tsx`
- FilterPanel: `components/filters/FilterPanel.tsx`
- Geocoder: `scrapers/base/geocoder/index.ts`
- YIT scraper: `scrapers/yit/index.ts`
- Bonava scraper: `scrapers/bonava/index.ts`
- Schema: `lib/schema.ts`
- Layout / fonts: `app/layout.tsx`

## Open questions for the user (before implementation)

1. **Issue 8 — pin color tradeoff.** Confirm Option A (status always wins;
   score gradient hidden on map, only visible in detail panel)? Or do you
   want Option C (score as ring around status fill)?
2. **Issue 8 — chip behavior.** When a chip is active and clicked again,
   does it (a) deselect, returning to "new" default, or (b) stay selected?
3. **Issue 11 — bathroom range.** OK with dropping bathrooms entirely
   (the data isn't on public listings)?
4. **Issue 11 — image overrides.** Confirm hotlink approach (you paste a
   URL into a JSON file) vs Vercel Blob caching (more setup, more reliable
   long-term)?

## Out of scope (this plan)

- Mobile-optimized layout (currently desktop-first by spec).
- BVKB energy class verification.
- Price-history sparklines (need ≥30 snapshots first).
- Hepsor/Bonava/YIT scraping accuracy improvements beyond what's required by
  issues 5 & 6.
- Adding bathroom count to per-apartment data (data unavailable on public
  listings; would require deeper page parsing or developer outreach).
- Re-implementing /compare with a better UX (compare feature parked, not
  removed — easy to revive later).
