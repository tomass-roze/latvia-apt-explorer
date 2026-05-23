// Latvia Apartment Explorer — canonical data shapes.
// This module is ISOMORPHIC: no Node built-ins, no React, no Next.
// Server-only helpers (e.g., buildProjectId) live in schema.server.ts.

import { z } from 'zod';

// ─── Literal sets ──────────────────────────────────────────────────────────

export const DEVELOPERS = ['hepsor', 'yit', 'bonava', 'merks', 'pillar', 'vastint', 'invego'] as const;
export type Developer = (typeof DEVELOPERS)[number];

export const CITIES = ['Rīga', 'Jūrmala', 'Mārupe', 'Ogre', 'Salaspils', 'Ķekava', 'Babīte'] as const;
export type City = (typeof CITIES)[number];

export const ENERGY_CLASSES = [
  'A++',
  'A+',
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'unknown',
] as const;
export type EnergyClass = (typeof ENERGY_CLASSES)[number];

export const CONSTRUCTION_TYPES = [
  'concrete-monolith',
  'panel',
  'brick',
  'wood',
  'other',
  'unknown',
] as const;
export type ConstructionType = (typeof CONSTRUCTION_TYPES)[number];

export const BUILD_STAGES = [
  'pre-sales',
  'under-construction',
  'nearly-complete',
  'ready',
] as const;
export type BuildStage = (typeof BUILD_STAGES)[number];

export const AVAILABILITIES = ['available', 'reserved', 'sold'] as const;
export type Availability = (typeof AVAILABILITIES)[number];

export const STATUSES = ['new', 'interested', 'visited', 'passed'] as const;
export type Status = (typeof STATUSES)[number];

// ─── Branded IDs ───────────────────────────────────────────────────────────

export const ProjectIdSchema = z.string().min(1).brand<'ProjectId'>();
export type ProjectId = z.infer<typeof ProjectIdSchema>;

export const ApartmentIdSchema = z.string().min(1).brand<'ApartmentId'>();
export type ApartmentId = z.infer<typeof ApartmentIdSchema>;

// ─── URL schemas — defense against javascript:/data: XSS ───────────────────

export const SafeUrlSchema = z
  .string()
  .url()
  .refine(
    (u) => {
      try {
        return ['http:', 'https:'].includes(new URL(u).protocol);
      } catch {
        return false;
      }
    },
    { message: 'URL must use http or https' },
  );

export const ImageUrlSchema = SafeUrlSchema.refine(
  (u) => /\.(jpe?g|png|webp|avif)(\?|#|$)/i.test(u),
  { message: 'Image URL must end in jpg/jpeg/png/webp/avif' },
);

// ─── Price as a 3-state discriminated union ────────────────────────────────
//
// `vatIncluded` is non-optional on `amount` — Latvian new-build pricing varies
// VAT inclusion (21%), so comparing apples-to-apples requires the answer.

export const PriceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('amount'),
    eur: z.number().positive(),
    vatIncluded: z.boolean(),
  }),
  z.object({ kind: z.literal('on-request') }),
  z.object({ kind: z.literal('unknown') }),
]);
export type Price = z.infer<typeof PriceSchema>;

// ─── Completion: quarter-precision matches developer marketing ─────────────

export const CompletionEstimateSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('quarter'),
    year: z.number().int().min(2020).max(2040),
    quarter: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  }),
  z.object({ kind: z.literal('exact-date'), iso: z.string().date() }),
  z.object({ kind: z.literal('ready'), iso: z.string().date() }),
  z.object({ kind: z.literal('unknown') }),
]);
export type CompletionEstimate = z.infer<typeof CompletionEstimateSchema>;

// ─── Apartment ─────────────────────────────────────────────────────────────

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
  terraceArea: z.number().nonnegative().optional(),
  price: PriceSchema,
  pricePerSqm: PriceSchema,
  availability: z.enum(AVAILABILITIES),
  floorPlanUrl: ImageUrlSchema.optional(),
  deepLinkUrl: SafeUrlSchema,
});
export type Apartment = z.infer<typeof ApartmentSchema>;

// ─── Project ───────────────────────────────────────────────────────────────

export const ProjectSchema = z.object({
  id: ProjectIdSchema,
  developer: z.enum(DEVELOPERS),
  name: z.string().min(1),
  address: z.string().min(1),
  cadastreId: z.string().optional(),
  district: z.string().optional(),
  city: z.enum(CITIES),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    source: z.enum(['vzd', 'janas-seta', 'nominatim', 'manual']),
  }),
  buildStage: z.enum(BUILD_STAGES),
  completion: CompletionEstimateSchema,
  energyClass: z.enum(ENERGY_CLASSES),
  energyClassSource: z.enum(['developer-claim', 'bvkb-verified']),
  constructionType: z.enum(CONSTRUCTION_TYPES),
  parkingPrice: PriceSchema,
  storagePrice: PriceSchema,
  parkingSpotsTotal: z.number().int().nonnegative().optional(),
  sourceUrl: SafeUrlSchema,
  apartments: z.array(ApartmentSchema),
  scrapedAt: z.string().datetime(),
});
export type Project = z.infer<typeof ProjectSchema>;

// ─── Scraper run result — discriminated by status ──────────────────────────

export const ScrapeErrorSchema = z.object({
  kind: z.enum(['fetch', 'parse', 'validate', 'geocode']),
  url: SafeUrlSchema.optional(),
  projectId: ProjectIdSchema.optional(),
  message: z.string(),
  // Free-form structured detail from zod issues etc. Kept loose; consumers shouldn't depend on shape.
  zodIssues: z.array(z.unknown()).optional(),
});
export type ScrapeError = z.infer<typeof ScrapeErrorSchema>;

export const ScraperRunResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    developer: z.enum(DEVELOPERS),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime(),
    projectCount: z.number().int().nonnegative(),
    apartmentCount: z.number().int().nonnegative(),
  }),
  z.object({
    status: z.literal('partial'),
    developer: z.enum(DEVELOPERS),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime(),
    projectCount: z.number().int().nonnegative(),
    apartmentCount: z.number().int().nonnegative(),
    errors: z.array(ScrapeErrorSchema).nonempty(),
    lastSuccessAt: z.string().datetime(),
  }),
  z.object({
    status: z.literal('failed'),
    developer: z.enum(DEVELOPERS),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime(),
    errors: z.array(ScrapeErrorSchema).nonempty(),
    lastSuccessAt: z.string().datetime(),
  }),
]);
export type ScraperRunResult = z.infer<typeof ScraperRunResultSchema>;

// ─── localStorage state ────────────────────────────────────────────────────
//
// `version` lives inside the payload (not just in the storage key) so
// migrations are typed. Notes use per-project keys
// (`apt-explorer:v1:notes:<projectId>`) to avoid re-serializing all notes
// on every keystroke. `weights` keys are constrained to CriterionKey at the
// hook layer (lib/scoring/registry.ts is the authoritative list); the schema
// here only enforces value range.

export const PersonalStateSchema = z.object({
  version: z.literal(1),
  status: z.record(ProjectIdSchema, z.enum(STATUSES)),
  saved: z.array(ProjectIdSchema),
  weights: z.record(z.string(), z.number().min(0).max(1)),
});
export type PersonalState = z.infer<typeof PersonalStateSchema>;

// ─── Exhaustiveness helper ────────────────────────────────────────────────

export function assertNever(x: never): never {
  throw new Error(`unhandled case: ${JSON.stringify(x)}`);
}

// ─── Address normalization (isomorphic) ───────────────────────────────────
//
// Used by buildProjectId in schema.server.ts. Lowercase, NFC, collapse
// whitespace, strip leading/trailing punctuation. Latvian diacritics
// preserved (NFC keeps them as single codepoints).

export function normalizeAddress(input: string): string {
  return input
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s ]+/g, ' ')
    .replace(/^[\s.,;:]+|[\s.,;:]+$/g, '')
    .trim();
}
