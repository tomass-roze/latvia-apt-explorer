// Scoring criterion registry — the single source of truth.
//
// Adding a 13th criterion = compile error everywhere Weights is consumed.
// The slider UI, scoring engine, URL state, palette, and PersonalState all
// derive from CRITERIA.
//
// This module is ISOMORPHIC. ESLint config blocks node/react imports here.

import type { Apartment, EnergyClass, Project } from '../schema';

// ─── Branded Normalized number ─────────────────────────────────────────────
// Physically prevents off-by-one capping bugs: every normalize fn must call
// toNormalized() and toNormalized() throws if the value is out of [0, 1].

export type Normalized = number & { readonly __brand: 'Normalized_0_1' };

export function toNormalized(n: number): Normalized {
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new Error(`normalization out of [0,1]: ${n}`);
  }
  return n as Normalized;
}

// ─── Scoring context ────────────────────────────────────────────────────────
// Carries the filter-set-relative ranges and precomputed per-apartment
// distances needed by criterion normalize functions.

export interface ScoringContext {
  /** Min/max for normalizing min-max scaled criteria within the current filter set. */
  readonly priceRange: { min: number; max: number } | null;
  readonly pricePerSqmRange: { min: number; max: number } | null;
  /** Precomputed distances per apartment id, all in kilometers. */
  readonly distances: ReadonlyMap<string, DistanceSet>;
  /** User-selected construction preferences (matches give 1, others 0). */
  readonly preferredConstructionTypes: ReadonlySet<string>;
}

export interface DistanceSet {
  readonly rigaCenter: number;
  readonly nearestSchool: number;
  readonly nearestGrocery: number;
}

// ─── Criterion definition ───────────────────────────────────────────────────

export interface Criterion {
  readonly key: string;
  /** Latvian UI label */
  readonly label: string;
  readonly group: 'price' | 'location' | 'building' | 'apartment';
  readonly direction: 'higher-better' | 'lower-better' | 'categorical' | 'preference';
  readonly defaultWeight: number;
  readonly normalize: (apt: Apartment, project: Project, ctx: ScoringContext) => Normalized;
}

// ─── Normalization helpers ──────────────────────────────────────────────────

const NEUTRAL = toNormalized(0.5);

function minMax(value: number, range: { min: number; max: number } | null, direction: 'lower-better' | 'higher-better'): Normalized {
  if (!range || range.min === range.max) return NEUTRAL;
  const t = (value - range.min) / (range.max - range.min);
  const score = direction === 'lower-better' ? 1 - t : t;
  return toNormalized(Math.max(0, Math.min(1, score)));
}

function cappedDecay(distance: number, halfLifeKm: number): Normalized {
  return toNormalized(Math.max(0, Math.min(1, Math.exp(-distance / halfLifeKm))));
}

function cappedLinear(distance: number, capKm: number): Normalized {
  return toNormalized(Math.max(0, Math.min(1, 1 - distance / capKm)));
}

const ENERGY_CLASS_SCORE: Record<EnergyClass, Normalized> = {
  'A++': toNormalized(1.0),
  'A+': toNormalized(0.92),
  A: toNormalized(0.85),
  B: toNormalized(0.7),
  C: toNormalized(0.55),
  D: toNormalized(0.4),
  E: toNormalized(0.25),
  F: toNormalized(0.1),
  unknown: NEUTRAL,
};

// ─── CRITERIA registry ─────────────────────────────────────────────────────
//
// Order is the SOURCE OF TRUTH for visual ordering in ScoreBreakdown bars,
// slider panels, and /compare. Do not reorder lightly.

export const CRITERIA = [
  // ─── Price group ──────────────────────────────────────────────────────────
  {
    key: 'priceTotal',
    label: 'Kopējā cena',
    group: 'price',
    direction: 'lower-better',
    defaultWeight: 0.18,
    normalize: (apt, _project, ctx) => {
      if (apt.price.kind !== 'amount') return NEUTRAL;
      return minMax(apt.price.eur, ctx.priceRange, 'lower-better');
    },
  },
  {
    key: 'pricePerSqm',
    label: 'Cena par m²',
    group: 'price',
    direction: 'lower-better',
    defaultWeight: 0.18,
    normalize: (apt, _project, ctx) => {
      if (apt.pricePerSqm.kind !== 'amount') return NEUTRAL;
      return minMax(apt.pricePerSqm.eur, ctx.pricePerSqmRange, 'lower-better');
    },
  },
  {
    key: 'parkingPrice',
    label: 'Autostāvvietas cena',
    group: 'price',
    direction: 'lower-better',
    defaultWeight: 0.05,
    normalize: (_apt, project) => {
      if (project.parkingPrice.kind !== 'amount') return NEUTRAL;
      return toNormalized(Math.max(0, Math.min(1, 1 - project.parkingPrice.eur / 30_000)));
    },
  },

  // ─── Location group ───────────────────────────────────────────────────────
  {
    key: 'distRigaCenter',
    label: 'Attālums līdz Rīgas centram',
    group: 'location',
    direction: 'lower-better',
    defaultWeight: 0.1,
    normalize: (apt, _project, ctx) => {
      const d = ctx.distances.get(apt.id);
      return d ? cappedLinear(d.rigaCenter, 25) : NEUTRAL;
    },
  },
  {
    key: 'distSchool',
    label: 'Attālums līdz skolai',
    group: 'location',
    direction: 'lower-better',
    defaultWeight: 0.08,
    normalize: (apt, _project, ctx) => {
      const d = ctx.distances.get(apt.id);
      return d ? cappedDecay(d.nearestSchool, 0.5) : NEUTRAL;
    },
  },
  {
    key: 'distGrocery',
    label: 'Attālums līdz veikalam',
    group: 'location',
    direction: 'lower-better',
    defaultWeight: 0.05,
    normalize: (apt, _project, ctx) => {
      const d = ctx.distances.get(apt.id);
      return d ? cappedDecay(d.nearestGrocery, 0.3) : NEUTRAL;
    },
  },

  // ─── Building group ───────────────────────────────────────────────────────
  {
    key: 'energyClass',
    label: 'Energoklase',
    group: 'building',
    direction: 'categorical',
    defaultWeight: 0.08,
    normalize: (_apt, project) => ENERGY_CLASS_SCORE[project.energyClass],
  },
  {
    key: 'constructionType',
    label: 'Būvtips',
    group: 'building',
    direction: 'preference',
    defaultWeight: 0.05,
    normalize: (_apt, project, ctx) =>
      ctx.preferredConstructionTypes.has(project.constructionType)
        ? toNormalized(1)
        : toNormalized(0),
  },
  {
    key: 'parkingRatio',
    label: 'Autostāvvietu attiecība',
    group: 'building',
    direction: 'higher-better',
    defaultWeight: 0.05,
    normalize: (_apt, project) => {
      if (!project.parkingSpotsTotal || project.apartments.length === 0) return NEUTRAL;
      const ratio = project.parkingSpotsTotal / project.apartments.length;
      return toNormalized(Math.max(0, Math.min(1, ratio / 1.5)));
    },
  },

  // ─── Apartment group ──────────────────────────────────────────────────────
  {
    key: 'bathrooms',
    label: 'Vannas istabu skaits',
    group: 'apartment',
    direction: 'higher-better',
    defaultWeight: 0.05,
    normalize: (apt) =>
      apt.bathrooms === undefined ? NEUTRAL : toNormalized(Math.min(apt.bathrooms / 2, 1)),
  },
  {
    key: 'terraceArea',
    label: 'Terases laukums',
    group: 'apartment',
    direction: 'higher-better',
    defaultWeight: 0.05,
    normalize: (apt) =>
      apt.terraceArea === undefined ? NEUTRAL : toNormalized(Math.min(apt.terraceArea / 15, 1)),
  },
  {
    key: 'floor',
    label: 'Stāvs',
    group: 'apartment',
    direction: 'higher-better',
    defaultWeight: 0.1,
    // Bell curve around floor 4 — third-to-sixth floors are typically preferred.
    normalize: (apt) => toNormalized(Math.exp(-((apt.floor - 4) ** 2) / 8)),
  },
] as const satisfies readonly Criterion[];

export type CriterionKey = (typeof CRITERIA)[number]['key'];
export type Weights = Record<CriterionKey, number>;

// ─── Default weights, normalized to sum=1 ───────────────────────────────────

export const DEFAULT_WEIGHTS: Weights = (() => {
  const raw = Object.fromEntries(CRITERIA.map((c) => [c.key, c.defaultWeight])) as Weights;
  return normalizeWeights(raw);
})();

/** Rescale a partial weight map so values sum to 1. Missing keys get defaults. */
export function normalizeWeights(raw: Partial<Weights>): Weights {
  const filled = Object.fromEntries(
    CRITERIA.map((c) => [c.key, raw[c.key as CriterionKey] ?? c.defaultWeight]),
  ) as Weights;
  const sum = Object.values(filled).reduce((acc, v) => acc + v, 0);
  if (sum <= 0) {
    const even = 1 / CRITERIA.length;
    return Object.fromEntries(CRITERIA.map((c) => [c.key, even])) as Weights;
  }
  return Object.fromEntries(
    (Object.entries(filled) as [CriterionKey, number][]).map(([k, v]) => [k, v / sum]),
  ) as Weights;
}
