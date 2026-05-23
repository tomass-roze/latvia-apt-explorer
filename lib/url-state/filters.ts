'use client';

// URL-state parsers for filters + weights + selected-project.
//
// Design: a single combined useQueryStates so all filter/weight changes write
// the URL atomically (and we can throttle a single setter rather than one-per-key).
// urlKeys map verbose names → short ones so the URL stays scannable.
// `history: 'replace'` keeps slider drags from flooding the back stack.

import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsFloat,
  parseAsInteger,
  parseAsString,
  useQueryStates,
} from 'nuqs';
import { AVAILABILITIES, BUILD_STAGES } from '@/lib/schema';
import { CRITERIA, type CriterionKey, DEFAULT_WEIGHTS, type Weights } from '@/lib/scoring/registry';

// ─── Filter parsers ────────────────────────────────────────────────────────

const filterParsers = {
  // Multi-select: rooms (1, 2, 3, 4+ as integers; 5 means "5+")
  rooms: parseAsArrayOf(parseAsInteger).withDefault([]),
  // Range: area in m²
  areaMin: parseAsFloat,
  areaMax: parseAsFloat,
  // Range: total price in EUR
  priceMin: parseAsFloat,
  priceMax: parseAsFloat,
  // Range: €/m²
  pricePerSqmMin: parseAsFloat,
  pricePerSqmMax: parseAsFloat,
  // Range: floor
  floorMin: parseAsInteger,
  floorMax: parseAsInteger,
  // Multi-select: build stages
  buildStage: parseAsArrayOf(parseAsString).withDefault([]),
  // Toggle: include reserved (default true; toggling false hides reserved)
  includeReserved: parseAsBoolean.withDefault(true),
  // Selected project for the right-side detail panel
  p: parseAsString,
};

const filterUrlKeys = {
  rooms: 'r',
  areaMin: 'amin',
  areaMax: 'amax',
  priceMin: 'pmin',
  priceMax: 'pmax',
  pricePerSqmMin: 'psqmin',
  pricePerSqmMax: 'psqmax',
  floorMin: 'fmin',
  floorMax: 'fmax',
  buildStage: 'st',
  includeReserved: 'res',
  p: 'p',
} as const;

export type Filters = {
  rooms: number[];
  areaMin: number | null;
  areaMax: number | null;
  priceMin: number | null;
  priceMax: number | null;
  pricePerSqmMin: number | null;
  pricePerSqmMax: number | null;
  floorMin: number | null;
  floorMax: number | null;
  buildStage: string[];
  includeReserved: boolean;
  p: string | null;
};

export function useFilters() {
  return useQueryStates(filterParsers, {
    urlKeys: filterUrlKeys,
    history: 'replace',
    throttleMs: 100,
  }) as [Filters, (next: Partial<Filters>) => Promise<URLSearchParams>];
}

// ─── Weight parsers ────────────────────────────────────────────────────────
//
// Derived from CRITERIA. Each weight is a [0,1] float. Defaults match
// DEFAULT_WEIGHTS so unchanged sliders contribute zero URL characters.

const weightParsers = Object.fromEntries(
  CRITERIA.map((c) => [c.key, parseAsFloat.withDefault(DEFAULT_WEIGHTS[c.key as CriterionKey])]),
) as Record<CriterionKey, ReturnType<typeof parseAsFloat.withDefault>>;

// Short URL keys: first 4 chars of criterion key (collision-free at 12 criteria).
const weightUrlKeys = Object.fromEntries(
  CRITERIA.map((c) => [c.key, `w${c.key.slice(0, 6)}`]),
) as Record<CriterionKey, string>;

export function useWeights(): readonly [Weights, (next: Partial<Weights>) => void] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [state, setState] = useQueryStates(weightParsers as any, {
    urlKeys: weightUrlKeys,
    history: 'replace',
    throttleMs: 150,
  });
  return [state as Weights, setState as (next: Partial<Weights>) => void];
}

// Used to encode "currently selected project ID" in URL.
export function selectedProjectIdFromFilters(filters: Filters): string | null {
  return filters.p;
}
