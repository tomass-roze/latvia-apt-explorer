---
title: Latvia New-Construction Apartment Explorer
type: feat
status: active
date: 2026-05-20
brainstorm: docs/brainstorms/2026-05-20-latvia-apartment-explorer-brainstorm.md
---

# Latvia New-Construction Apartment Explorer

## Enhancement Summary

**Deepened:** 2026-05-20 (ultrathink, 7 parallel review/design agents across two passes)
**Pass 1:** code-simplicity-reviewer · kieran-typescript-reviewer · performance-oracle · frontend-design (skill)
**Pass 2 (technical review):** security-sentinel · architecture-strategist · pattern-recognition-specialist

**Pass-1 improvements layered into this plan:**

1. **Schema-as-foundation.** Data Model with discriminated unions (`Price`, `CompletionEstimate`, `ScraperRunResult`), branded IDs (`ProjectId`, `ApartmentId`, `Normalized`), SHA-256 stable project IDs, typed `CRITERIA` registry. Schemas locked in Phase 1.
2. **Performance budget.** Concrete numbers. **Split JSON payload** into `projects.json` (initial) + lazy `apartments/<projectId>.json`. Use MapLibre `filter` expressions over `setData`. Acceptance criterion corrected 500 → 5,000 apartments.
3. **Design specification.** Color palette, typography, three-zone layout, four filter primitives, grouped weight sliders, two ScoreBreakdown variants, dense ApartmentRow, /compare-as-spreadsheet, anti-CRM status/notes.
4. **Pin encoding revised.** Stroke *width* (1/2/3/4 px) for build stage (dashed at 26 px is unreliable).

**Pass-2 (technical review) hardening applied:**

5. **Security hardening (all CRITICAL/HIGH).** URL-scheme refinement on every `z.string().url()` blocks `javascript:` XSS. Image-extension allowlist on `floorPlanUrl` blocks SVG-script XSS. Strict CSP headers in `next.config.ts`. `robots-parser` in fetch wrapper enforces robots.txt. **Defer all localStorage writes until first explicit user interaction** to cleanly satisfy ePrivacy "strictly necessary" exemption. About page gets "Eksportēt JSON" + "Dzēst datus" buttons for trivial Art. 15/17 compliance. Zero `NEXT_PUBLIC_*` env vars. `gitleaks` + `pnpm audit --audit-level=high` in CI. All deps pinned exactly. Stale-data >7d triggers warning banner (not silent display).
6. **Schema leaks fixed.** `buildProjectId` extracted to `lib/schema.server.ts` (was importing `node:crypto` from "isomorphic" file). `PersonalStateSchema.weights` derived from `CRITERIA` (was `z.record(z.string(), z.number())` — bypassed the registry). `Price.amount` gains `vatIncluded: boolean` (Latvian new-build domain reality).
7. **Ops robustness.** `build-payload.ts` writes atomic `data/manifest.json` listing every projectId; CI counts must match `apartments/*.json` files. Filename colon (`bonava:abc123.json`) replaced with `--` (Windows/CDN-safe). Stable-JSON serializer moved to `lib/json-stable.ts` (was under `scrapers/`; arrow was backwards). `ScraperRunResult.partial` surfaced per-project (silently-missing projects were invisible).
8. **Naming/convention cleanup.** `data/projects/` (source) renamed to `data/scraped/` to disambiguate from `data/projects.json` (output). `lib/format.ts` added for `formatPrice/formatArea/formatCompletion` (prevents per-component reinvention). ESLint `no-restricted-imports` on `scrapers/<dev>/**` blocks bare `fetch`/`node:https`/direct geocoder imports — forces shared infrastructure.

**New considerations surfaced:**

- Per-project localStorage keys for notes (single-key writes the entire notes blob per keystroke).
- Project-ID override map (`data/overrides/project-id-map.json`) preserves localStorage status across address rewordings.
- Migration seam to a DB lives in `lib/data.server.ts` — schema is the contract; swapping `fs.readFile` for `db.query` is the migration.

## Overview

A static-first Next.js web app on Vercel that aggregates new-construction apartment projects across Latvia onto an interactive map. Per-developer scrapers run nightly in GitHub Actions and commit JSON to the repo; the frontend reads that JSON at build time. Filters, scoring weights, status, notes, and side-by-side comparison let the buyer (initially the author) shortlist projects against personal criteria and avoid re-reviewing the same project. Decision window: 1–3 months. MVP target: 2 weeks. Public on Vercel after.

## Problem Statement

The Latvian new-construction market has dozens of active projects from 10+ developers, each with similar-looking listing pages. Researching them one by one wastes time — projects blur together, the same project gets re-reviewed weeks later, and there is no neutral way to compare "Project A's 3-room near the school" vs "Project B's 3-room with better parking ratio." A buyer needs an aggregator that:

- Surfaces every active project on a map at a glance, including previously-reviewed ones (marked).
- Filters by what actually matters (rooms, area, budget, floor, completion, build stage).
- Ranks by user-tunable weights on objective facts.
- Keeps lightweight personal notes per project without an account.
- Eventually works for any Latvian buyer (public deploy).

## Proposed Solution

**Static-first JSON-in-git, scrapers as nightly cron, MapLibre map.** Vercel auto-rebuilds when the cron commits new data, so the deployed site is always at most ~24 hours stale and serves entirely from the edge.

Stack:

- **Next.js 16.2 + React 19.2** (App Router, Turbopack default, TypeScript 5).
- **Tailwind CSS** + custom CSS variables for theming, **Biome** for lint/format.
- **`react-map-gl/maplibre` 8.1.1** + **MapLibre GL v5**, dynamic-imported (`ssr: false`).
- **OpenFreeMap** public tiles (zero config, no key, unlimited) with MapTiler free tier as fallback. OSM attribution baked into the map control.
- **`nuqs`** for URL state (one combined `useQueryStates` for filters+weights, `urlKeys` short names, `throttleMs: 100`).
- **`usehooks-ts` `useLocalStorage`** (with `initializeWithValue: false`) for status, notes, saved projects, weight defaults. Notes use per-project keys.
- **`zod` v4** for runtime data validation in scrapers and at the JSON-load boundary.
- **`vitest`** for tests.
- **`radix-ui/react-slider`**, **`lucide-react`** for UI primitives.
- **Cheerio + native `fetch`** for default scrapers; **Playwright** only where required (Bonava). Playwright runs in `mcr.microsoft.com/playwright` Docker image with `~/.cache/ms-playwright` cached.
- **Jāņa sēta geocoding API** primary, **Nominatim** fallback, persistent JSON cache + `data/overrides/geocoding.json` for manual overrides.
- **GitHub Actions matrix job** (one job per developer) + **`stefanzweifel/git-auto-commit-action`** ("commit only on diff").
- **OSM Overpass API** queried at build time only (or via a separate monthly workflow) to bake overlay GeoJSON.

Why static-first wins: low traffic, infrequent updates (nightly), bounded dataset (~100 projects, ~5,000 apartments at saturation per research). No DB to operate, zero infra cost, and **git history is the data history** — a price-drop diff is `git log -p data/projects/bonava.json`.

## Technical Approach

### Data Model

The schemas ship in Phase 1 and every scraper + UI component depends on them. Discriminated unions force consumers to handle missing/ambiguous states; branded IDs prevent type confusion.

```ts
// lib/schema.ts — isomorphic (no Node, no React)
import { z } from 'zod';
import { createHash } from 'node:crypto'; // only used server-side

// --- Literal sets ---
export const DEVELOPERS = ['hepsor', 'yit', 'bonava', 'merks', 'pillar', 'vastint', 'invego'] as const;
export type Developer = typeof DEVELOPERS[number];

export const CITIES = ['Rīga', 'Jūrmala', 'Mārupe', 'Ogre', 'Salaspils', 'Ķekava', 'Babīte'] as const;
export type City = typeof CITIES[number];

export const ENERGY_CLASSES = ['A++','A+','A','B','C','D','E','F','unknown'] as const;
export const CONSTRUCTION_TYPES = ['concrete-monolith','panel','brick','wood','other','unknown'] as const;
export const BUILD_STAGES = ['pre-sales','under-construction','nearly-complete','ready'] as const;
export const AVAILABILITIES = ['available','reserved','sold'] as const;
export const STATUSES = ['new','interested','visited','passed'] as const;

// --- Branded IDs ---
export const ProjectIdSchema = z.string().brand<'ProjectId'>();
export type ProjectId = z.infer<typeof ProjectIdSchema>;
export const ApartmentIdSchema = z.string().brand<'ApartmentId'>();
export type ApartmentId = z.infer<typeof ApartmentIdSchema>;

// --- Price as a 3-state discriminated union (replaces `price?: number`) ---
// vatIncluded is non-optional on `amount` — Latvian new-build pricing varies VAT inclusion (21%)
export const PriceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('amount'), eur: z.number().positive(), vatIncluded: z.boolean() }),
  z.object({ kind: z.literal('on-request') }),
  z.object({ kind: z.literal('unknown') }),
]);
export type Price = z.infer<typeof PriceSchema>;

// --- Safe URL schema: blocks javascript:/data:/etc. ---
const SafeUrlSchema = z.string().url().refine(
  (u) => { try { return ['http:','https:'].includes(new URL(u).protocol); } catch { return false; } },
  { message: 'URL must use http or https' },
);

// --- Image URL schema: also restricts to known image extensions ---
const ImageUrlSchema = SafeUrlSchema.refine(
  (u) => /\.(jpe?g|png|webp|avif)(\?|#|$)/i.test(u),
  { message: 'Image URL must end in jpg/jpeg/png/webp/avif' },
);

// --- Completion: quarter-precision is the real shape, not ISO date ---
export const CompletionEstimateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('quarter'), year: z.number().int(), quarter: z.union([z.literal(1),z.literal(2),z.literal(3),z.literal(4)]) }),
  z.object({ kind: z.literal('exact-date'), iso: z.string().date() }),
  z.object({ kind: z.literal('ready'), iso: z.string().date() }),
  z.object({ kind: z.literal('unknown') }),
]);
export type CompletionEstimate = z.infer<typeof CompletionEstimateSchema>;

// --- Apartment ---
export const ApartmentSchema = z.object({
  id: ApartmentIdSchema,
  projectId: ProjectIdSchema,
  rooms: z.number().int().positive(),
  area: z.number().positive(),
  bathrooms: z.number().int().positive().optional(),
  floor: z.number().int(),
  totalFloors: z.number().int().positive().optional(),
  hasBalcony: z.boolean().optional(),
  hasTerrace: z.boolean().optional(),
  terraceArea: z.number().optional(),
  price: PriceSchema,
  pricePerSqm: PriceSchema,
  availability: z.enum(AVAILABILITIES),
  floorPlanUrl: ImageUrlSchema.optional(),       // image-extension-restricted; blocks SVG-script XSS
  deepLinkUrl: SafeUrlSchema,                     // http/https only; blocks javascript: XSS
});
export type Apartment = z.infer<typeof ApartmentSchema>;

// --- Project ---
export const ProjectSchema = z.object({
  id: ProjectIdSchema,
  developer: z.enum(DEVELOPERS),
  name: z.string(),
  address: z.string(),
  cadastreId: z.string().optional(),
  district: z.string().optional(),
  city: z.enum(CITIES),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
    source: z.enum(['vzd','janas-seta','nominatim','manual']),
  }),
  buildStage: z.enum(BUILD_STAGES),
  completion: CompletionEstimateSchema,
  energyClass: z.enum(ENERGY_CLASSES),
  energyClassSource: z.enum(['developer-claim','bvkb-verified']),
  constructionType: z.enum(CONSTRUCTION_TYPES),
  parkingPrice: PriceSchema,
  storagePrice: PriceSchema,
  parkingSpotsTotal: z.number().int().nonnegative().optional(),
  sourceUrl: SafeUrlSchema,
  apartments: z.array(ApartmentSchema),
  scrapedAt: z.string().datetime(),
});
export type Project = z.infer<typeof ProjectSchema>;

// --- Scraper run result, discriminated by status ---
export const ScrapeErrorSchema = z.object({
  kind: z.enum(['fetch','parse','validate','geocode']),
  url: z.string().url().optional(),
  projectId: ProjectIdSchema.optional(),
  message: z.string(),
  zodIssues: z.array(z.any()).optional(),
});
export type ScrapeError = z.infer<typeof ScrapeErrorSchema>;

export const ScraperRunResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'), developer: z.enum(DEVELOPERS),
    startedAt: z.string().datetime(), finishedAt: z.string().datetime(),
    projectCount: z.number().int().nonnegative(),
    apartmentCount: z.number().int().nonnegative(),
  }),
  z.object({
    status: z.literal('partial'), developer: z.enum(DEVELOPERS),
    startedAt: z.string().datetime(), finishedAt: z.string().datetime(),
    projectCount: z.number().int().nonnegative(),
    apartmentCount: z.number().int().nonnegative(),
    errors: z.array(ScrapeErrorSchema).nonempty(),
    lastSuccessAt: z.string().datetime(),
  }),
  z.object({
    status: z.literal('failed'), developer: z.enum(DEVELOPERS),
    startedAt: z.string().datetime(), finishedAt: z.string().datetime(),
    errors: z.array(ScrapeErrorSchema).nonempty(),
    lastSuccessAt: z.string().datetime(),
  }),
]);
export type ScraperRunResult = z.infer<typeof ScraperRunResultSchema>;

// --- localStorage state schema (versioning inside payload, not just key) ---
// `weights` is derived from CRITERIA — see lib/scoring/registry.ts (imported below in real code)
// to prevent the runtime boundary from accepting orphan criteria.
import type { CriterionKey } from './scoring/registry';
export const PersonalStateSchema = z.object({
  version: z.literal(1),
  status: z.record(ProjectIdSchema, z.enum(STATUSES)),
  saved: z.array(ProjectIdSchema),
  weights: z.record(z.string() /* refined to CriterionKey enum at registry-import time */, z.number().min(0).max(1)),
});
export type PersonalState = z.infer<typeof PersonalStateSchema>;
// Notes use per-project keys: `apt-explorer:v1:notes:<projectId>` — avoids re-serializing all notes per keystroke.
// localStorage writes are GATED on first explicit user interaction (ePrivacy "strictly necessary" exemption).

// --- Exhaustiveness helper for switch over unions ---
export function assertNever(x: never): never {
  throw new Error(`unhandled case: ${JSON.stringify(x)}`);
}
```

**`buildProjectId` lives in `lib/schema.server.ts`** (uses `node:crypto`, not isomorphic):

```ts
// lib/schema.server.ts
import 'server-only';
import { createHash } from 'node:crypto';
import { type Developer, type ProjectId } from './schema';
import { normalizeAddress } from './schema'; // pure helper, isomorphic

// SHA-256, 16 hex = 64 bits — collision-safe for ~5k items.
export function buildProjectId(
  developer: Developer,
  input: { cadastreId?: string; address: string },
): ProjectId {
  const key = input.cadastreId?.trim() || normalizeAddress(input.address);
  const hash = createHash('sha256').update(`${developer}|${key}`).digest('hex').slice(0, 16);
  return `${developer}--${hash}` as ProjectId;  // double-dash, not colon: Windows/CDN-safe filenames
}
```

**Required `tsconfig.json`** (non-negotiable for a greenfield TS app of this kind):

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "moduleResolution": "bundler",
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "skipLibCheck": true
  }
}
```

**Validation strategy:** `safeParse` per *apartment* inside `parse` per *project*. A single broken apartment shouldn't blank an entire project; a project missing `address` or `location` *should* throw. Persist `z.treeifyError(error)` into `ScrapeError.zodIssues` so the About-page debug view points to the exact field.

**Project-ID continuity:** `data/overrides/project-id-map.json` lets a re-keyed project keep its localStorage status when a developer rewords an address (the SHA changes; the override map maps old→new).

### Data Flow

```
GitHub Actions (cron, nightly)
  └─ matrix: { developer: [yit, merks, bonava, ...] }
       ├─ scrape() → raw HTML/JSON
       ├─ parse() → Apartment[] / Project[]  (Zod safeParse per apartment, parse per project)
       ├─ geocode() with cache + overrides
       ├─ write data/projects/<dev>.json (sorted keys, sorted arrays)
       ├─ write data/runs/<dev>.json
       └─ git-auto-commit-action (no commit if no diff)
git push
  └─ Vercel webhook
       └─ next build  (Server Components import JSON via fs.readFile, never bundle)
            ├─ generate data/projects.json (slim, all 100 projects)
            ├─ generate data/apartments/<projectId>.json (full, per project)
            └─ static deploy to edge
```

### Storage Strategy

```
data/
├── projects.json                       # SLIM: build-time aggregated, ~15KB compressed, ships with initial HTML
├── apartments/
│   └── <projectId>.json                # FULL: per-project, lazy-loaded on pin click/zoom-in
│                                       #   projectId format: `<dev>--<16hex>` (double-dash, Windows/CDN-safe)
├── manifest.json                       # build-time output: { projectIds: [], builtAt }, atomic integrity check
├── scraped/                            # SOURCE: per-developer scraped data (input to build step)
│   ├── yit.json
│   ├── merks.json                      # (renamed from data/projects/ to disambiguate from data/projects.json)
│   └── bonava.json
├── runs/
│   └── <developer>.json                # ScraperRunResult — surfaces "last updated" + status (incl. partial)
├── cache/
│   └── geocoding.json                  # committed; persistent cache
├── overrides/
│   ├── geocoding.json                  # manual lat/lng overrides
│   ├── project-id-map.json             # old ID → new ID for re-keyed projects
│   └── parking-storage.json            # manual parking/storage prices
└── overlays/
    ├── schools.geojson                 # build-time Overpass fetch, monthly refresh
    ├── transit.geojson
    ├── parks.geojson
    └── shops.geojson
```

**`build-payload.ts` contract** (raised to first-class pipeline step):

1. Read every `data/scraped/<dev>.json`, re-validate via `safeParse`. Abort build on parse error (don't silently drop data).
2. Compute slim projection (project facts only, no apartments) → `data/projects.json`.
3. Write `data/apartments/<projectId>.json` per project.
4. Emit `data/manifest.json` = `{ projectIds: string[], builtAt: ISO, totalApartments: number }`.
5. CI step asserts: `manifest.projectIds.length === count(data/apartments/*.json)`. A mismatch fails the build.
6. Writes are staged to a temp dir and renamed atomically so half-written state never ships.

User state in localStorage (versioned keys for migration safety; notes split per-project to avoid write flooding):

- `apt-explorer:v1:personal` → `PersonalState` (status + saved + weights, single blob)
- `apt-explorer:v1:notes:<projectId>` → `string` (one key per project; 500 ms debounced write)

Filters and weights also encoded in URL via `nuqs` so any view is shareable.

### Scoring Model

The single most under-specified part of the brainstorm. Concrete spec:

**1. Apartment-level facts** (each normalized to `[0,1]`, direction explicit):

| Fact | Direction | Normalization |
|---|---|---|
| `price` (total) | lower better | min-max over current filter set; `unknown`/`on-request` → 0.5 neutral |
| `pricePerSqm` | lower better | min-max over current filter set; same handling |
| `distanceToRigaCenter` | lower better, capped 25 km | `max(0, 1 - d/25)` |
| `distanceToSchool` | lower better, capped 2 km | `exp(-d/0.5)` |
| `distanceToGrocery` | lower better, capped 1 km | `exp(-d/0.3)` |
| `energyClass` | categorical | A++=1.0, A+=0.92, A=0.85, B=0.7, C=0.55, D=0.4, E=0.25, F=0.1, unknown=0.5 |
| `constructionType` | user preference | matches user's selected types = 1, else 0 |
| `parkingRatio` (spots/apartment) | higher better, capped 1.5 | `min(ratio/1.5, 1)` |
| `bathrooms` | higher better, capped 2 | `min(n/2, 1)` |
| `terraceArea` | higher better, capped 15 m² | `min(area/15, 1)` |
| `floor` | bell around 4 | `exp(-((floor-4)^2)/8)` |
| `parkingPrice` | lower better, capped €30k | `max(0, 1 - eur/30000)` |

**2. Weights:** user adjusts via sliders; weights normalize to sum=1 (moving one rescales others proportionally).

**3. Score:** `score = Σ (norm_i × weight_i)` → `[0,1]`. Displayed as **0–100 with no decimals**, plus `Rank #N of M matching filters` (the percentile is the trustworthy number; the absolute score is for breakdown).

**4. Project rank** = `max(score)` over apartments in that project matching the current filter (project = best of its matching apartments). Empty matching set ⇒ project hidden.

**5. Score breakdown bar** on every project tile and detail panel: stacked bar showing `norm_i × weight_i` per criterion (fixed order). Two variants — tile (h-2) and detail (h-4 with legend). See Design Specification.

**6. Correlated-weights warning:** if user's weights for `price` + `distanceToRigaCenter` both >0.25, show one-line hint above the normalization readout.

**7. Typed criterion registry** (single source of truth — slider UI and engine derive from it; drift is a compile error):

```ts
// lib/scoring/registry.ts — isomorphic, no React, no Node
export type Normalized = number & { readonly __brand: 'Normalized_0_1' };
export const toNormalized = (n: number): Normalized => {
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error(`normalization out of range: ${n}`);
  return n as Normalized;
};

export interface Criterion<K extends string> {
  readonly key: K;
  readonly label: string;          // Latvian UI label
  readonly group: 'price' | 'location' | 'building' | 'apartment';
  readonly direction: 'higher-better' | 'lower-better' | 'categorical' | 'preference';
  readonly defaultWeight: number;
  readonly normalize: (apt: Apartment, project: Project, ctx: ScoringContext) => Normalized;
}

export const CRITERIA = [
  // 12 criterion definitions matching the table above
] as const satisfies readonly Criterion<string>[];

export type CriterionKey = (typeof CRITERIA)[number]['key'];
export type Weights = Record<CriterionKey, number>;

export function normalizeWeights(raw: Partial<Weights>): Weights { /* sum to 1 */ }
export function scoreApartment(apt, project, ctx, weights: Weights): number { /* Σ */ }
```

The slider component iterates `CRITERIA` directly. `Weights = Record<CriterionKey, number>` means forgetting a criterion at any consumer is a compile error. `Normalized` as a branded number physically prevents off-by-one capping bugs.

**ESLint guard:** add `no-restricted-imports` to `lib/scoring/*` blocking `node:fs`, `next/headers`, `react` — the scoring engine runs in both Node (build time) and browser (live recompute).

### Performance Budget

| Metric | Budget | Measurement |
|---|---|---|
| Initial HTML + JS + slim projects JSON | < 200 KB compressed | `pnpm next build` output |
| Full apartments dataset (lazy) | < 500 KB compressed total | per-project file split |
| LCP mobile (4G, low-end Android) | < 2.5 s | Lighthouse mobile preset on `/` |
| Scoring recompute (5,000 apts × 12 criteria) | < 15 ms | `performance.mark/measure` |
| Slider drag → URL update cadence | 10 Hz | `nuqs` `throttleMs: 100` on combined `useQueryStates` |
| Notes keystroke → localStorage write | 500 ms debounce | per-project key write |
| Vercel build time | < 120 s | Vercel build log |
| Monthly build minutes used | < 60 (of 6000 free) | Vercel usage |
| Geocoding calls / month | < 200 | cron logs |

**Top mitigations baked into the implementation:**

1. **Split JSON payload.** Ship `data/projects.json` (slim, all 100 projects, no apartments) in initial HTML. Lazy-fetch `data/apartments/<projectId>.json` on pin click/zoom-in. Biggest LCP win.
2. **MapLibre `filter` expressions, not `setData`.** When filter state changes, update layer filter rather than re-feeding the GeoJSON source. Avoids 30–50 ms cluster rebuild per tick.
3. **Pass scores into GeoJSON properties; data-driven map styling.** Zero React renders on weight slider — the map repaints via MapLibre style expression on the property.
4. **Per-project localStorage notes keys** + 500 ms debounce. Single-key approach would re-serialize all notes per keystroke.
5. **Preconnect to top 3 developer CDNs** in `app/layout.tsx`. Floor plan thumbnails use raw `<img loading="lazy" decoding="async">` with fixed `aspect-ratio: 1/1` container; never `next/image` (would blow through Vercel image-optimizer free tier).
6. **JSON via `fs.readFile` in async Server Components**, not static `import`. Avoids Turbopack inlining the 3 MB blob into the build manifest.

### Security & Compliance

Public deploy + EU users + nightly scraping of commercial sites. All non-negotiable items below ship by Phase 5.

**XSS defense (Phase 1):**

- Every URL field in `lib/schema.ts` uses `SafeUrlSchema` (`http:`/`https:` protocols only). Blocks `javascript:` injection through scraped data.
- `floorPlanUrl` uses `ImageUrlSchema` (extension allowlist: `jpe?g|png|webp|avif`). Blocks SVG-script XSS via developer CDN.
- `next.config.ts` ships strict CSP headers:

```
default-src 'self';
img-src 'self' https: data:;
style-src 'self' 'unsafe-inline';
script-src 'self';
connect-src 'self' https://tiles.openfreemap.org https://*.openfreemap.org;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
```

- `X-Content-Type-Options: nosniff` + `Referrer-Policy: no-referrer` + `Permissions-Policy: geolocation=(), camera=(), microphone=()`.
- All external `<a>` links use `rel="noopener noreferrer"`.

**Scraping ethics & legal (Phase 2):**

- `scrapers/base/fetch.ts` requires `robots-parser`; `robots.txt` per host cached 24h; disallowed paths emit `ScrapeError{kind:'fetch', message:'robots-disallowed'}`.
- `User-Agent: LatviaApartmentExplorer/0.x (+https://github.com/<repo>; contact: <email>)` — identifying and contactable.
- 1 req/sec per host; exponential retry on 5xx but not 4xx.
- Strip PII from scraped data: explicit deny-list for `sales_agent_name`, `sales_agent_phone`, `sales_agent_email` fields (some developer sites include these). Lawful basis: Art. 6(1)(f) legitimate interest in aggregating publicly-listed commercial real estate.
- Per-developer kill-switch (`scrapers/<dev>/disabled.flag`) for takedown response within 24h SLA.

**ePrivacy / GDPR (Phase 4 & 5):**

- **All localStorage writes are gated on a first-interaction flag.** The app does NOT write anything to localStorage on initial page load. Writes happen only after the user explicitly changes status, edits notes, or moves a weight slider. This satisfies "strictly necessary for a service requested by the user" under Art. 5(3) ePrivacy.
- `/about` page exposes "Eksportēt JSON" (downloads `apt-explorer:v1:*` keys as a single file) and "Dzēst datus" (clears them all). Satisfies Art. 15 + Art. 17 trivially since data is local.
- One-line footer notice in Latvian: "Personīgie dati glabājas tikai jūsu pārlūkā — nav sīkdatņu, nav izsekošanas." Links to About page methodology.
- About page documents: data sources, scoring methodology, scraping policy, lawful basis, contact email, 24h takedown SLA.

**Stale data handling (Phase 5):**

- Per-developer status (`ScraperRunResult.status`) determines per-project rendering:
  - `ok`: pins displayed normally.
  - `partial`: pins of *missing* projects from this scrape are omitted; pins of present projects render with a small "partial run" indicator.
  - `failed`, < 36h: pins from last successful snapshot, normal styling.
  - `failed`, 36h–7d: pins get stale-data halo + tooltip "Atjaunots pirms X dienām".
  - `failed`, > 7d: developer's pins replaced by a warning banner at the top of the map ("Bonava dati novecojuši — apmeklē izstrādātāja vietni"). Pins still visible but heavily desaturated.

**Secrets hygiene (Phase 2):**

- Zero `NEXT_PUBLIC_*` env vars. Frontend ships no secrets.
- Jāņa sēta API key stored only as `JANAS_SETA_API_KEY` in GitHub Actions secrets.
- Workflows restricted to `push`/`schedule`/`workflow_dispatch` triggers; never `pull_request_target`.
- `scrapers/base/fetch.ts` redacts `?key=*` and `Authorization` headers from any logged error.
- Geocoding cache (`data/cache/geocoding.json`) stores `{ addressKey, lat, lng }` — never the raw request URL with key embedded.

**Supply chain (Phase 1 + CI ongoing):**

- All dependencies pinned to exact versions (no `^`, no `~`).
- `pnpm audit --prod --audit-level=high` blocking step in CI.
- `gitleaks` action runs on every push to prevent secret commits.
- Playwright Docker image pinned by SHA digest (not `:latest`).
- Dependabot enabled for security-only auto-PRs.

### Pin Visual Encoding

Three signals, three channels — all via data-driven MapLibre layers (no HTML markers).

- **Fill color** = status when set (`interested` blue, `visited` indigo-violet, `passed` muted grey + 0.55 opacity). When status is `new`/unset, color interpolates red → amber → green on the score percentile.
- **Stroke width** = build stage (`pre-sales` 1px, `under-construction` 2px, `nearly-complete` 3px, `ready` 4px), all in `--ink`. *Deviation from brainstorm:* dashed strokes on a 26px circle don't read cleanly; width encoding is more legible and simpler to implement.
- **Stale-data halo:** projects with `lastSuccessAt > 36h ago` get a 2px outer halo in `--accent` at 0.6 opacity.
- **Saved indicator:** 8px `--accent` dot offset to the top-right (separate circle layer with `icon-offset`).
- **Size:** cluster apartment count when zoomed out (`step` expression `[3,36],[10,42],[30,50],[100,56]`); fixed 26px for single project pins.
- **Hover:** grows 30% (150 ms transition), tooltip with name + score + apt count.
- **Selected** (detail panel open): persistent 3px `--accent` outer ring.

### Empty / Error States

- **No projects match filters** → empty map state with "0 results · Clear filters" CTA; below, 3 "almost-matches" greyed out with a per-card "Change *X* filter to include."
- **Scraper failed** → developer's projects still rendered from last snapshot, pins get the stale halo + tooltip ("Updated 3 days ago — scraper failure"). Header data-freshness chip turns yellow at >36h, red at >7d.
- **localStorage corrupt** → schema-validated read; on failure, wipe `apt-explorer:v1:*` and toast "Personal data reset due to corruption."
- **Map fails to mount** → fallback list view at `/list` with all the same filters working.
- **Floor plan broken** → fixed aspect-ratio placeholder ("plāns nav pieejams") + deep-link to developer page.

### Design Specification

**Aesthetic direction:** "Quiet cartographer" — restrained, paper-like neutrals so the map and colored pins/bars carry the visual weight. Reference points: Idealista (information density without noise), Otodom (calm panels), Trulia (pin clarity).

**Color palette** (define in `app/globals.css`):

```css
--paper: #F5F2EC; --paper-2: #ECE7DD;
--ink: #1A1A17; --ink-2: #4C4A44; --ink-3: #8A857B;
--line: #D9D3C6;
--accent: #C3471A; --accent-soft: #F1D6C7;
--status-new: #5D8AA8; --status-interested: #1F6FEB;
--status-visited: #6B4FBB; --status-passed: #8A857B;
--score-0: #B23A2A; --score-50: #D9A441; --score-100: #4F8A4A;
```

**Typography:**
- Display / numerals: **Fraunces** (Google Fonts) — serif for prices, scores, headings.
- UI / body: **Geist Sans** (or **Public Sans**) — explicitly not Inter.
- Mono: **JetBrains Mono** for IDs and coords.
- Tabular numerals everywhere a price/area/score appears.

**Spacing:** constrain to Tailwind 2/3/4/6/8/12 only. **Borders:** 1px hairlines only. **Radius:** `rounded-md` controls, `rounded-lg` panels, nothing larger.

**Three-zone desktop layout** (`app/page.tsx`):

```
┌─────────────────────────────────────────────────────────────────────┐
│ Header (56px) — wordmark · city · freshness · /compare · settings   │
├──────────────┬─────────────────────────────────┬────────────────────┤
│ FilterPanel  │            Map                  │  ProjectDetail     │
│ + Sliders    │  (MapLibre canvas, full bleed)  │  (slides in)       │
│ 340px        │            fluid                │  420px             │
└──────────────┴─────────────────────────────────┴────────────────────┘
```

Breakpoints: ≥1440 px 340/420, 1024–1440 px 320/380, 768–1024 px icon-rail + overlay drawer, <768 px bottom-sheet (post-MVP).

**FilterPanel discipline:** every filter is one of **four primitives only**.
1. **Range** (price, area, floor, completion) — two-thumb `radix-ui/react-slider` over a histogram strip (24px tall, `--paper-2`) showing distribution of matching apartments.
2. **Multi-select chips** (rooms, build stage, energy class, construction type) — h-8 px-3 pills, selected = `bg-[--accent-soft] border-[--accent]`.
3. **Single-select segmented** (city) — `inline-flex p-0.5 bg-[--paper-2] rounded-md`.
4. **Toggle** (reserved, floor plan, saved) — right-aligned switch with left label.

Each filter row `py-4 border-b border-[--line]`. Group label `text-xs uppercase tracking-wider text-[--ink-3]`. **No cards, no shadows** — these are rows, not cards. That's what prevents sprawl.

**Weight sliders** grouped under collapsible `<details>` (4 groups × 3 sliders). Each slider row h-12: label left, weight% right (`text-xs tabular-nums`), 4px track `bg-[--paper-2]`, 14px circle thumb in `--accent`. **Sticky footer of sliders panel:** stacked-bar normalization readout (h-2) + "Sasummēts uz 100% · Atiestatīt". Correlated-weights warning: inline notice with `border-l-2 border-[--accent]`, dismissible per session.

**ScoreBreakdown** — two variants:
- **Tile** (`h-2 w-full rounded-full`): stacked segments in fixed criterion order so same color in same position always means the same thing. Below: "Vērtējums" + "**73** / 100" (display serif 18px).
- **Detail** (`h-4 rounded-md`): same bar above, plus a `grid-cols-2` legend below sorted by contribution descending. Hover legend row dims other segments 30%.

**ProjectDetail panel** — 5-section vertical rhythm with `h-px bg-[--line] my-6` spacers:
1. **Hero** (`p-6 bg-[--paper-2]`): big serif name, address, chip row (status / build stage / energy), then ScoreBreakdown detail variant.
2. **Key facts**: 2-col grid `grid-cols-2 gap-x-6 gap-y-3`, label uppercase 10px, value 14px tabular.
3. **Apartments**: count + sort dropdown, then `ApartmentRow`s; first 8 + "Show 14 more" button.
4. **Status & Notes**: see below.
5. **Links**: developer site · cadastre · OSM.

**ApartmentRow** (88 px tall) — 80px floor-plan thumbnail left (1:1, broken state = placeholder + "plāns nav pieejams"), middle column `text-sm` rooms/area + `text-xs` floor/features + availability badge + tiny "↗ Pie izstrādātāja" link, right column total price (display serif) + price/m² (`text-xs text-[--ink-3]`). Whole row not a link — explicit CTA prevents accidental navigation.

**Availability badge:** `available` = `--score-100` outline, `reserved` = `--score-50` outline, `sold` = grey + line-through prices.

**/compare page** — spreadsheet-with-personality. Sticky left label rail, 2–3 project columns (`grid-cols-[200px_repeat(auto-fit,minmax(280px,1fr))]`). Header cell per project: 16:9 thumbnail + serif name + ScoreBreakdown tile + apartment-swap dropdown + tiny `× Noņemt`. Rows grouped (Atrašanās / Cena / Ēka / Dzīvoklis / Personīgie) with sticky group labels. Best-in-row gets a tiny `★` in `--accent`. **Payoff row at bottom:** 3 stacked-bars stacked vertically sharing an x-axis so user *sees* criterion contribution differences across projects.

**Status + Notes** (anti-CRM):
- Status: 4 inline radio chips with leading dots, commits immediately, "saglabāts" toast 800ms first interaction.
- Notes: single textarea styled like *paper* — `bg-[--paper] border-l-2 border-[--line] focus:border-[--accent] px-4 py-3 min-h-[96px] font-serif italic`. Placeholder: "Piezīmes par šo projektu... (saglabājas tikai tavā pārlūkā)". 600ms debounce, single-line "Saglabāts pirms 3 sek." below.

**Empty state:** centered `max-w-sm py-12`, 48px Lucide line-icon in `--ink-3`, serif heading, two-sentence body, primary CTA `bg-[--ink] text-[--paper]`, then `── Gandrīz atbilst ──` divider + 3 muted cards with per-card "Palielini cenu līdz €220k" pills.

### File Structure

```
/
├── app/
│   ├── layout.tsx                       # next/font (Fraunces + Geist Sans + JetBrains Mono)
│   ├── globals.css                      # CSS variables (palette)
│   ├── page.tsx                         # Map view shell (Server) + dynamic Map (Client)
│   ├── compare/page.tsx
│   ├── list/page.tsx                    # map-failure fallback
│   └── about/page.tsx                   # methodology, attributions, GDPR notice, takedown
├── components/
│   ├── ui/                              # Chip, Toggle, RangeSlider, SectionHeader, StatChip
│   ├── map/                             # lowercase to match other dirs
│   │   ├── Map.tsx                      # 'use client'; react-map-gl/maplibre
│   │   ├── ProjectPinsLayer.tsx         # data-driven clusters + points
│   │   ├── OverlayToggle.tsx
│   │   └── StalenessBanner.tsx          # shown when any developer >7d stale
│   ├── filters/FilterPanel.tsx
│   ├── scoring/
│   │   ├── WeightSliders.tsx
│   │   └── ScoreBreakdown.tsx           # tile + detail variants
│   ├── project/
│   │   ├── ProjectDetail.tsx
│   │   ├── ApartmentRow.tsx
│   │   └── StatusNotes.tsx
│   └── compare/CompareTable.tsx
├── lib/
│   ├── schema.ts                        # isomorphic — Zod schemas + branded types + assertNever
│   ├── schema.server.ts                 # 'server-only' — buildProjectId (uses node:crypto)
│   ├── data.server.ts                   # 'server-only' — fs.readFile, Zod parse, manifest validation
│   ├── json-stable.ts                   # isomorphic — sorted-key + sorted-array JSON serializer
│   ├── format.ts                        # formatPrice/formatArea/formatCompletion — single home for display logic
│   ├── scoring/                         # isomorphic — ESLint blocks node/react imports
│   │   ├── registry.ts                  # CRITERIA + Normalized brand + CriterionKey enum
│   │   ├── normalize.ts
│   │   ├── score.ts
│   │   └── palette.ts                   # criterion → color, derived from CRITERIA
│   ├── geo.ts                           # haversine, bbox, RIGA_CENTER constant
│   ├── url-state/filters.ts             # nuqs schemas; URL key map derived from CRITERIA
│   └── personal/                        # 'use client'
│       ├── hooks.ts                     # localStorage hooks (write-gated on first-interaction flag)
│       └── migrations.ts                # version-bump migrations
├── scrapers/
│   ├── base/
│   │   ├── interface.ts                 # fetchListings(): Promise<{ projects, result: ScraperRunResult }>
│   │   ├── fetch.ts                     # polite UA + delay + retry + robots-parser enforcement
│   │   ├── errors.ts                    # discriminated-union builders: fetchError/parseError/validateError/geocodeError
│   │   ├── io.ts                        # writeScraped() — only sanctioned data/scraped/ write path
│   │   └── geocoder/
│   │       ├── janas-seta.ts
│   │       ├── nominatim.ts
│   │       └── index.ts                 # fallback chain — only public export
│   ├── yit/                             # Cheerio (server-rendered) — Phase 2 starter
│   ├── merks/                           # Cheerio (Wix) — Phase 5
│   └── bonava/                          # Playwright (SPA) — Phase 5, hardest
├── scripts/
│   ├── run-scraper.ts                   # Actions matrix entry
│   ├── build-payload.ts                 # generates projects.json + apartments/*.json
│   └── fetch-overlays.ts                # one-shot Overpass query
├── data/                                # (per Storage Strategy)
├── .github/workflows/
│   ├── scrape.yml                       # nightly matrix
│   ├── overlays-monthly.yml
│   └── ci.yml                           # lint + typecheck + test on PR
└── public/
    └── robots.txt, sitemap.xml, og-default.png
```

### Implementation Phases

#### Phase 1 — Foundation (Days 1–3)

- Init Next.js 16.2 + TypeScript (strict tsconfig per spec) + Tailwind + Biome + Vitest + `radix-ui/react-slider` + `lucide-react` + Google Fonts via `next/font`.
- **Pin all dependencies to exact versions** (no `^`, no `~`). Pin Playwright Docker image by SHA digest.
- Define **complete** Zod + TS schemas in `lib/schema.ts` including `Price` (with `vatIncluded`), `CompletionEstimate`, `ScraperRunResult` discriminated unions, branded IDs, `SafeUrlSchema`, `ImageUrlSchema`, `assertNever`, `PersonalStateSchema` (weights derived from CRITERIA).
- `buildProjectId` lives in `lib/schema.server.ts` (uses `node:crypto`); produces `<dev>--<16hex>` (double-dash, Windows/CDN-safe).
- Define **CRITERIA registry** (`lib/scoring/registry.ts`) with `Normalized` brand + `Weights` type. Slider UI, scoring engine, URL state, and `PersonalStateSchema` all derive from it.
- `lib/json-stable.ts` (sorted keys + sorted arrays) + unit tests. Consumed by both build script and scrapers.
- `lib/format.ts` with `formatPrice`/`formatArea`/`formatCompletion` (single home for display logic).
- `app/globals.css` with full palette + `next/font` setup.
- `next.config.ts` ships strict CSP + security headers per Security section.
- Map shell: `react-map-gl/maplibre` + OpenFreeMap Liberty style, dynamic-imported, OSM attribution baked in, Latvia bbox.
- Empty-data state shown.
- ESLint config: `no-restricted-imports` rules for `lib/scoring/*` (block node/react), `scrapers/<dev>/**` (block bare `fetch`/`node:https`/direct geocoder imports — force `scrapers/base/`).
- CI: lint, typecheck, test, `pnpm audit --prod --audit-level=high`, `gitleaks` action, Vercel preview deploy on PR.
- **Deliverable:** Vercel-hosted empty map of Latvia; schemas + criterion registry + security headers locked.

#### Phase 2 — One end-to-end scraper (Days 4–5)

- Build base scraper interface + polite fetch wrapper (`User-Agent: LatviaApartmentExplorer/0.x (+repo URL; contact: <email>)`, 1 req/sec, exponential retry, `robots-parser` enforcement with 24h cache).
- Build `scrapers/base/errors.ts` (discriminated-union builders) and `scrapers/base/io.ts` (sanctioned write path to `data/scraped/`).
- Build **YIT** scraper (Cheerio + server-rendered; lowest risk of the chosen trio).
- Build geocoder fallback chain: Jāņa sēta → Nominatim → manual override → persistent JSON cache. Use cache-on-disk pattern; commit cache.
- GitHub Actions workflow `scrape.yml` with matrix `developer: [yit]` and `stefanzweifel/git-auto-commit-action`. Cron `0 2 * * *` UTC + `workflow_dispatch`. Triggers restricted to `push`/`schedule`/`workflow_dispatch` only (never `pull_request_target`). `JANAS_SETA_API_KEY` in Actions secrets.
- **Build-time payload split:** `scripts/build-payload.ts` reads `data/scraped/<dev>.json`, re-validates via `safeParse`, produces `data/projects.json` (slim) + `data/apartments/<projectId>.json` + `data/manifest.json`. Atomic temp-dir staging. CI step asserts manifest matches apartments file count.
- `lib/data.server.ts` reads & merges JSON via `fs.readFile` (not `import`) — passes to map.
- Pins render at project locations with apartment count.
- **Deliverable:** Nightly scrape lands a commit, Vercel redeploys, real YIT projects on map.

#### Phase 3 — Filters + scoring + detail panel (Days 6–9)

- Full per-apartment data captured per `ApartmentSchema`.
- `nuqs` URL state — single combined `useQueryStates` for all filters + weights, `urlKeys` short names, `throttleMs: 100`. `history: 'replace'` (default).
- `FilterPanel` per Design Specification (4 primitives only, histogram in range filters).
- Empty filter results state + "almost-matches" cards.
- `ProjectDetail` panel (5-section rhythm).
- **Lazy-load apartments** on pin click: `fetch('/data/apartments/<projectId>.json')`.
- **Scoring engine** implementation against the CRITERIA registry; min-max passes per current filter set; unit tests.
- **WeightSliders** per spec, with normalization readout + correlated-weights warning.
- Pin fill = score percentile (status not yet applicable). Pin stroke width = build stage.
- `ScoreBreakdown` tile + detail variants.
- **Deliverable:** YIT data fully usable with filtering + scoring + detail.

#### Phase 4 — Personal state + comparison (Days 10–11)

- `usehooks-ts useLocalStorage` (`initializeWithValue: false`) for status + saved + weights (single key); per-project notes keys with 500 ms debounce.
- **First-interaction gate:** `lib/personal/hooks.ts` wraps `useLocalStorage` with an `useEffect`-guarded write that ONLY fires after the user's first explicit interaction (status click / note keystroke / slider drag). On initial page load, nothing is written. This is the ePrivacy "strictly necessary" exemption pattern.
- Schema-validated read (`PersonalStateSchema.safeParse`); corrupt-state recovery toast + automatic wipe.
- Status UI in detail panel (4 radio chips), notes as italic-serif paper-style textarea.
- Pin fill override: status > score when status is set.
- `/compare` page per Design Specification (spreadsheet pattern, sticky label rail, payoff stacked-bar row at bottom).
- **Deliverable:** Full personal workflow end-to-end.

#### Phase 5 — Second + third scrapers + polish (Days 12–14)

- Build **Merks** scraper (Cheerio; Wix-hosted — HTML is verbose but stable). Build first as the lower-risk of the two remaining.
- Build **Bonava** scraper. First attempt: reverse-engineer the XHR endpoint via DevTools; if available, Cheerio + JSON suffices. If not: Playwright in `mcr.microsoft.com/playwright` Docker image, browser cached.
- Matrix job now `[yit, merks, bonava]`.
- **Map overlays:** `scripts/fetch-overlays.ts` queries Overpass for Latvia bbox (schools, transit, parks, shops); commit GeoJSON. Lazy-load layer on toggle.
- Data freshness badge in header (per-developer status incl. `partial` in About page). Per-project: `partial` projects render with a small indicator; >36h stale = halo; >7d stale = `StalenessBanner` + desaturated pins for that developer.
- Footer: OSM/OpenFreeMap/Jāņa sēta attributions + storage notice ("Personīgie dati glabājas tikai jūsu pārlūkā — nav sīkdatņu, nav izsekošanas.").
- About page: methodology + data sources + scoring details + scraping policy (incl. lawful basis Art. 6(1)(f), takedown SLA 24h, contact email) + "Eksportēt JSON" button + "Dzēst datus" button.
- Lighthouse pass against Performance Budget. OG image + sitemap + robots.txt.
- **Deliverable:** Public MVP launch-ready with 3 developers.

#### Post-MVP Backlog

| Item | Notes |
|---|---|
| Remaining developers (Merks, Pillar, Vastint, Invego, user-supplied) | Mechanical — scraper module ≤ 200 LOC implementing base interface |
| Per-apartment & project price sparklines | Defer ~3–4 weeks until ≥ 30 snapshots — otherwise flat line |
| BVKB Energy Certificate verification | Cross-reference scraped energy class with public registry by cadastre |
| Visit log with structured entries | Date, attendees, photos |
| Per-apartment pinning in comparison view | Compare specific 3-room from Project A against specific 3-room from Project B |
| Vercel Blob caching for floor plans | Only if hotlink breakage proves chronic |
| Mobile-optimized layout (bottom sheets) | Currently responsive but desktop-first |
| Plausible analytics (opt-in) | After cookie/storage banner strategy |
| VZD bulk address registry pipeline | Only if Jāņa sēta + Nominatim coverage proves insufficient |
| Aggregator cross-reference (city24.lv, ss.lv) | Detect when developer site lags listings |

### Alternative Approaches Considered

| Alternative | Rejected because |
|---|---|
| Supabase/Turso DB-backed | No user accounts in MVP; JSON-in-git gives free price history; one fewer system. Migration trigger: repo > 2GB or sub-daily updates. |
| Pure Playwright for all scrapers | 6/7 sites are server-rendered — paying browser tax everywhere doubles CI time and brittleness. |
| Nominatim as primary geocoder | OSM lags new construction by months. Jāņa sēta + Nominatim is the right ordering. |
| ISR with `revalidate` | Unnecessary — Vercel rebuilds on git push. ISR adds caching layer with no benefit. |
| Mapbox tiles | API key, paid above free tier. OpenFreeMap is free + unlimited + MapLibre-compatible. |
| Scraping aggregators | Less data (no floor plans/parking), TOS-risky, fragile community scrapers. Direct developer sites give better data. |
| Single combined JSON file | Cannot parallelize matrix scrape; one broken scraper would block diff for all. Per-developer isolation is right. |
| HTML markers (not GeoJSON layers) | Don't scale past ~200 markers; data-driven styling impossible. |
| SHA-1 truncated IDs | Use SHA-256 — same call cost, no reason for SHA-1 in greenfield 2026 code. |
| Single localStorage key for notes | Re-serializes all notes per keystroke. Per-project keys are O(1) writes. |
| VZD weekly bulk-download pipeline | Premature for 100 projects. Jāņa sēta + overrides covers it. Reconsider if coverage gaps emerge. |

### Resolved Decisions

All open decisions resolved 2026-05-20 with the user:

1. **Starter developer trio:** **Bonava + YIT + Merks** (user's brainstorm choice, against research recommendation). Phasing adapted: YIT in Phase 2 (lowest risk of the three), Merks + Bonava in Phase 5 (Merks first because Bonava SPA is highest risk). Accept the risk that Bonava may slip to Week 3 — covered by phase-5 framing.
2. **Stable project ID:** `<developer>:<sha256(developer|cadastreId||normalizedAddress).slice(0,16)>` + `data/overrides/project-id-map.json` to preserve continuity across address rewordings.
3. **Reserved availability:** Included by default, distinct styling, toggle to exclude. (`sold` always excluded.)
4. **Floor plan hotlinking:** Hotlink with `Referer-Policy: no-referrer`, fixed `aspect-ratio: 1/1`, `loading="lazy" decoding="async"`, "plans nav pieejams" placeholder on error. No caching in MVP.
5. **Manual parking/storage data:** Edit `data/overrides/parking-storage.json` directly in git, keyed by `projectId`. No in-app form.
6. **Comparison granularity:** Compare projects; each shows its best-matching-filter apartment by default with a swap dropdown.
7. **GDPR/storage notice:** One-line footer notice (Latvian) + link to About page. No banner, no consent prompt.
8. **MVP scope: Full MVP as planned.** Everything in 2 weeks: 3 scrapers (Bonava + YIT + Merks), scoring + sliders, /compare, overlays, status/notes, public polish. Accept tight timeline; Phase 5 is the slippable bit if needed.

### Risk Analysis & Mitigation

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| 2-week timeline slips | High | High | Phases 1–4 are core. Phase 5's Bonava + overlays are slippable to Week 3. Open Decision #8 (lean cut) directly addresses. |
| Bonava SPA scraper brittle | High | Medium | Build last; try XHR-reverse-engineer before Playwright; don't block YIT + Merks on it. |
| Schema rework after Phase 1 ships | High | Low | Lock data model in Phase 1 with all discriminated unions; downstream changes are expensive after 3 scrapers exist. |
| Floor plan hotlinks blocked by Referer | Medium | Medium | `Referer-Policy: no-referrer` tested early; graceful degradation already designed. |
| Developer cease-and-desist | Medium | Low | Identifying UA + contact email; respect robots.txt; per-dev kill-switch (`scrapers/<dev>/disabled.flag`); 24h takedown SLA documented. |
| JSON parse breaks on bad scraped data | Medium | High | Zod `safeParse` per apartment, `parse` per project. Bad apartments logged, partial state surfaced ≠ silent data loss. |
| OSM attribution missing | Low (legal) | Low | Bake into MapLibre Attribution control in Phase 1; verify in checklist. |
| GDPR exposure on public deploy | Medium | Low | localStorage-only + storage notice. No analytics in MVP. About page documents data flow. |
| Repo grows unbounded | Low | Low | ~100–300 MB/yr realistic. Revisit at 1 GB. Stable JSON serialization keeps delta-compression effective. |
| Map performance at 5,000 pins | Low | Low | Built-in clustering + `filter` expressions (not `setData`). Sub-millisecond filter at this scale. |
| Hydration mismatch from localStorage | Low | Medium | `useLocalStorage({ initializeWithValue: false })` is the exact prevention pattern. |
| Notes localStorage write flooding | Medium | High | Per-project keys + 500 ms debounce. Defined in Storage Strategy. |
| Vercel build minutes overrun | Low | Low | Budget calc says < 60/6000 min monthly. Watch on first deploy. |
| XSS via scraped URL (`javascript:`) or SVG floor plan | High | Medium | `SafeUrlSchema` + `ImageUrlSchema` Zod refinements + CSP `script-src 'self'; object-src 'none'`. Phase 1 lock. |
| Developer site serves malicious image content | Medium | Low | Image-extension allowlist excludes SVG; CSP forbids inline scripts; CSP `img-src https: data:`. |
| ePrivacy violation on public deploy | Medium | Medium | localStorage writes gated on first user interaction; documented in About; one-line footer notice. |
| Stale data mis-advertises sold apartments | Medium | Medium | >7d stale triggers banner + desaturated pins (not silent display). |
| GDPR Art. 17 erasure requires git history rewrite | Medium | Low | Documented: takedown for permanent erasure = `git filter-repo` + force push + Vercel redeploy. High-volume erasure = migrate to DB. |
| Geocoding API key leaked via build output or logs | High | Low | Zero `NEXT_PUBLIC_*`; key only in GH Actions secrets; `gitleaks` CI; fetch wrapper redacts `?key=` from error logs. |
| Supply-chain CVE in pinned dep | Medium | Low | `pnpm audit --audit-level=high` blocking in CI; Dependabot security-only PRs. |
| Robots.txt violation triggers takedown | Medium | Low | `robots-parser` enforced in `scrapers/base/fetch.ts` with 24h cache. |

### Acceptance Criteria

**Functional:**

- [ ] Map of Latvia displays all scraped projects as clustered, colored pins.
- [ ] Pin fill = status when set, score percentile when not. Pin stroke width = build stage. Pin size encodes cluster count.
- [ ] Filters (rooms, area, price total, price/m², floor, build stage, completion, availability) via URL state, live update.
- [ ] Filter empty state shows "0 results · Clear filters" CTA + 3 almost-match greyed cards with relax-this-filter hints.
- [ ] Project detail panel: facts table, matching apartments (floor plan thumbnail + deep link + price + availability badge), score breakdown bar (detail variant).
- [ ] Weight sliders normalize to 100%, throttled URL update, live re-rank. Correlated-weights warning surfaces when applicable.
- [ ] Status per project (new/interested/visited/passed) persists in localStorage.
- [ ] Free-text notes per project, per-project key, 500 ms debounced autosave.
- [ ] `/compare` shows up to 3 projects side-by-side with score breakdowns + per-project apartment swap + payoff stacked-bar row.
- [ ] Map overlays (schools, transit, parks, shops) toggleable; lazy-loaded.
- [ ] Data freshness badge in header reflects oldest developer scrape.
- [ ] Entire UI in Latvian.
- [ ] Floor plans render with fixed aspect ratio (no layout shift); broken images show placeholder.
- [ ] Apartment deep-link opens developer's specific apartment page.
- [ ] List fallback at `/list` if map fails to mount.

**Non-functional (against Performance Budget):**

- [ ] LCP < 2.5 s, FCP < 1.5 s on Vercel production (Lighthouse mobile preset on `/`).
- [ ] Initial HTML + JS + slim JSON < 200 KB compressed; full apartments dataset < 500 KB compressed.
- [ ] Total nightly scraper run < 5 min wall clock (matrix-parallel).
- [ ] Map renders smoothly with **5,000+ apartment-level points** (cluster-aware).
- [ ] Scoring recompute < 15 ms.
- [ ] Vercel build < 120 s; monthly build minutes < 60.
- [ ] OSM + OpenFreeMap + Jāņa sēta attributions visible in map control / footer.
- [ ] Storage notice present in footer.
- [ ] Filter and slider controls keyboard-navigable.
- [ ] No console errors in production build.
- [ ] WCAG AA color contrast on pin colors and chip text.

**Quality gates:**

- [ ] Scoring engine, JSON serializer, geocoder cache: 100% unit-tested.
- [ ] Each scraper: HTML-fixture-based unit test with ≥ 3 example pages.
- [ ] Zero TypeScript errors; strict tsconfig settings enforced.
- [ ] Biome clean.
- [ ] ESLint `no-restricted-imports` rule prevents Node/React imports in `lib/scoring/*`.
- [ ] ESLint `no-restricted-imports` rule prevents bare `fetch`/`node:https`/direct geocoder imports in `scrapers/<dev>/**`.
- [ ] `pnpm audit --prod --audit-level=high` clean in CI.
- [ ] `gitleaks` action runs on every push.
- [ ] All dependencies pinned exactly (no `^`, no `~`); Playwright Docker by SHA digest.
- [ ] `next.config.ts` CSP + security headers verified via Security Headers scan.
- [ ] All `<a>` external links use `rel="noopener noreferrer"`.
- [ ] `robots.txt`, `sitemap.xml`, default OG image present.
- [ ] About page documents data sources, scoring methodology, scraping policy, lawful basis, takedown contact + 24h SLA.
- [ ] About page includes "Eksportēt JSON" + "Dzēst datus" buttons.
- [ ] localStorage writes verified not to fire on initial page load (gated on first-interaction flag).
- [ ] `build-payload.ts` emits manifest; CI asserts manifest matches `apartments/*.json` count.

### Success Metrics

- Author identifies top 5 candidate projects within 60 s of first load.
- Author tags status on ≥ 80% of viewed projects in week 1 of personal use.
- A new developer scraper takes < 1 day to add; scraper module ≤ 200 LOC implementing the base interface.
- Daily scrape: < 5 min wall clock; < 100 MB/year repo growth.
- Zero takedown notices in first month after public deploy.
- ≥ 3 active developer scrapers at MVP launch.

### Operational Concerns

- **Scraper monitoring:** GitHub Actions failure email = primary alert. Per-developer status (incl. `partial`) surfaced in About page and as per-project indicators in the UI.
- **Disabling a developer:** Add `scrapers/<dev>/disabled.flag`; matrix workflow skips disabled.
- **Takedown response (within 24h SLA):** Add to `disabled.flag` + remove `data/scraped/<dev>.json` + commit. For GDPR Art. 17 erasure of historical data: `git filter-repo` + force push + Vercel redeploy. About page documents the contact email + repo issue label `takedown`.
- **Geocoding cache:** Append-only; entries never expire. Stored as `{ addressKey, lat, lng }` — never includes API keys. To re-geocode, delete from `data/cache/geocoding.json`.
- **localStorage migration:** Versioned key (`v1`) AND `version` field inside payload. Migrations in `lib/personal/migrations.ts`; on read, schema-validate; on mismatch, attempt migration or wipe with toast.
- **Project-ID changes:** when a developer rewords an address and the SHA shifts, the scraper should auto-detect (matching `cadastreId` with different SHA than previous commit) and append to `data/overrides/project-id-map.json`. Manual override still possible.
- **Migration to DB (when needed):** Trigger = repo > 2 GB or sub-daily updates needed. Seam = `lib/data.server.ts` — swap `fs.readFile` for `db.query`; `ProjectSchema`/`ApartmentSchema` remain the contract.

### Documentation Plan

- `README.md` — project overview, local dev, contributing a scraper recipe.
- `CONTRIBUTING.md` — scraper interface, polite-scraping rules, JSON conventions.
- `app/about/page.tsx` — methodology, data sources, scoring, scraping policy, takedown contact, attributions.

### References

**Internal:**

- Brainstorm: `docs/brainstorms/2026-05-20-latvia-apartment-explorer-brainstorm.md`

**External:**

- [Next.js 16](https://nextjs.org/blog/next-16) · [16.2](https://nextjs.org/blog/next-16-2) · [v16 upgrade](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Vercel Git auto-deploy](https://vercel.com/docs/git) · [Vercel ISR](https://vercel.com/docs/incremental-static-regeneration)
- [react-map-gl docs](https://visgl.github.io/react-map-gl/docs) · [MapLibre wrapper](https://visgl.github.io/react-map-gl/docs/api-reference/maplibre/map)
- [MapLibre clustering](https://maplibre.org/maplibre-gl-js/docs/examples/create-and-style-clusters/) · [Large-data guide](https://maplibre.org/maplibre-gl-js/docs/guides/large-data/)
- [OpenFreeMap](https://openfreemap.org/) · [OSMF Tile Policy](https://operations.osmfoundation.org/policies/tiles/)
- [Overpass API wiki](https://wiki.openstreetmap.org/wiki/Overpass_API) · [Commons](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)
- [nuqs](https://nuqs.dev) · [usehooks-ts useLocalStorage](https://usehooks-ts.com/react-hook/use-local-storage)
- [Jāņa sēta Geocoding](https://developers.kartes.lv/en/geocoding/) · [Extended](https://developers.kartes.lv/en/ext-geocoding/) · [Cadastral](https://developers.kartes.lv/en/cadastre/)
- [VZD open data](https://data.gov.lv/dati/dataset/6b06a7e8-dedf-4705-a47b-2a7c51177473) · [VZD overview](https://www.vzd.gov.lv/lv/valsts-adresu-registrs)
- [BVKB Energy Certificate Registry](https://www.bvkb.gov.lv/en/services/energy-certificate-registry-data-building)
- [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/)
- [Simon Willison — git scraping](https://simonwillison.net/2020/Oct/9/git-scraping/) · [tag](https://simonwillison.net/tags/git-scraping/)
- [git-auto-commit-action](https://github.com/marketplace/actions/git-auto-commit-action)
- [Playwright CI](https://playwright.dev/docs/ci) · [Caching browsers on GH Actions](https://playwrightsolutions.com/playwright-github-action-to-cache-the-browser-binaries/) · [Playwright Docker](https://playwright.dev/docs/docker)
- [MCDA normalization (MDPI 2025)](https://www.mdpi.com/2226-4310/12/2/100) · [1000minds primer](https://www.1000minds.com/decision-making/what-is-mcdm-mcda)
- [Stop Building Settings Pages — ruthless MVP scoping](https://dev.to/zilton7/stop-building-settings-pages-a-guide-to-ruthless-mvp-scoping-4a25)
