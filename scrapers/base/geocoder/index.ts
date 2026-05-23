// Geocoder fallback chain:
//   manual override → cache → Jāņa sēta → Nominatim → fail
//
// The single-address `geocode()` API is what scrapers historically called.
// `geocodeWithFallback()` takes ordered variants — typically
// [street_address, "district, city", "city"] — and tries each in turn,
// tagging the result with the degraded source enum ('nominatim-district' /
// 'nominatim-city') so the UI can mark pins as approximate.
//
// Cache + overrides are committed to git: `data/cache/geocoding.json` and
// `data/overrides/geocoding.json`. Cache is append-only (entries never
// expire). Cache keys include the developer to avoid cross-developer
// contamination on identical-looking addresses.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { stableStringify } from '@/lib/json-stable';
import { type Developer, normalizeAddress } from '@/lib/schema';
import { type GeocodeHit, geocodeJanasSeta } from './janas-seta';
import { geocodeNominatim } from './nominatim';

const REPO_ROOT = process.cwd();
const CACHE_PATH = join(REPO_ROOT, 'data', 'cache', 'geocoding.json');
const OVERRIDES_PATH = join(REPO_ROOT, 'data', 'overrides', 'geocoding.json');

export type GeocodeSource =
  | 'vzd'
  | 'janas-seta'
  | 'nominatim'
  | 'nominatim-district'
  | 'nominatim-city'
  | 'manual';

type CacheRecord = { lat: number; lng: number; source: GeocodeSource };
type CacheMap = Record<string, CacheRecord>;

export interface GeocodeResult extends GeocodeHit {
  source: GeocodeSource;
}

async function readJsonOrEmpty<T extends object>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, path);
}

let cache: CacheMap | null = null;
let overrides: CacheMap | null = null;

async function getCache(): Promise<CacheMap> {
  if (cache === null) cache = await readJsonOrEmpty<CacheMap>(CACHE_PATH, {});
  return cache;
}
async function getOverrides(): Promise<CacheMap> {
  if (overrides === null) overrides = await readJsonOrEmpty<CacheMap>(OVERRIDES_PATH, {});
  return overrides;
}

function cacheKey(developer: Developer, address: string): string {
  return `${developer}:${normalizeAddress(address)}`;
}

export interface GeocodeInput {
  developer: Developer;
  address: string;
}

/**
 * Single-address geocode. Order:
 *   1. manual override (data/overrides/geocoding.json)
 *   2. persistent cache (data/cache/geocoding.json)
 *   3. Jāņa sēta API (stub today)
 *   4. Nominatim (rate-limited)
 *
 * Result cached on hit. Returns null on miss.
 */
export async function geocode({ developer, address }: GeocodeInput): Promise<GeocodeResult | null> {
  const key = cacheKey(developer, address);
  const ov = await getOverrides();
  const fromOverride = ov[key];
  if (fromOverride) return { lat: fromOverride.lat, lng: fromOverride.lng, source: 'manual' };

  const c = await getCache();
  const fromCache = c[key];
  if (fromCache) return { lat: fromCache.lat, lng: fromCache.lng, source: fromCache.source };

  const fromJanasSeta = await geocodeJanasSeta(address);
  if (fromJanasSeta) {
    const result: GeocodeResult = { ...fromJanasSeta, source: 'janas-seta' };
    c[key] = result;
    return result;
  }

  const fromNominatim = await geocodeNominatim(address);
  if (fromNominatim) {
    const result: GeocodeResult = { ...fromNominatim, source: 'nominatim' };
    c[key] = result;
    return result;
  }

  return null;
}

export interface GeocodeFallbackInput {
  developer: Developer;
  /**
   * Ordered candidate addresses. The first that resolves wins. By convention:
   *   [0] full street + number + city  (best precision)
   *   [1] district + city               (fallback if street unknown)
   *   [2] city                          (last resort centroid)
   */
  variants: Array<{ address: string; tier: 'street' | 'district' | 'city' }>;
}

/**
 * Try multiple address variants in order until one resolves. The returned
 * `source` is degraded to reflect which tier matched ('nominatim' for street,
 * 'nominatim-district' for district, 'nominatim-city' for city). The cache
 * stores the degraded source so subsequent runs honour it.
 *
 * Manual overrides (keyed on the FIRST variant's address) still take
 * precedence — they're declarative truth.
 */
export async function geocodeWithFallback({
  developer,
  variants,
}: GeocodeFallbackInput): Promise<GeocodeResult | null> {
  // Manual overrides keyed on the primary (most specific) address.
  if (variants.length === 0) return null;
  const primary = variants[0]!;
  const ov = await getOverrides();
  const overrideHit = ov[cacheKey(developer, primary.address)];
  if (overrideHit) {
    return { lat: overrideHit.lat, lng: overrideHit.lng, source: 'manual' };
  }

  const c = await getCache();

  for (const variant of variants) {
    const key = cacheKey(developer, variant.address);
    const cached = c[key];
    if (cached) {
      return { lat: cached.lat, lng: cached.lng, source: cached.source };
    }
    // Try Jāņa sēta (stub today) then Nominatim for this variant.
    const fromJanasSeta = await geocodeJanasSeta(variant.address);
    if (fromJanasSeta) {
      const result: GeocodeResult = { ...fromJanasSeta, source: 'janas-seta' };
      c[key] = result;
      return result;
    }
    const fromNominatim = await geocodeNominatim(variant.address);
    if (fromNominatim) {
      const source: GeocodeSource =
        variant.tier === 'street'
          ? 'nominatim'
          : variant.tier === 'district'
            ? 'nominatim-district'
            : 'nominatim-city';
      const result: GeocodeResult = { ...fromNominatim, source };
      c[key] = result;
      return result;
    }
    // Variant didn't resolve — try the next tier.
  }
  return null;
}

/** Persist the in-memory cache to disk. Call once at end of a scraper run. */
export async function flushCache(): Promise<void> {
  if (cache === null) return;
  await atomicWrite(CACHE_PATH, stableStringify(cache));
}

/** Reset module state. Tests only. */
export function _resetForTests(): void {
  cache = null;
  overrides = null;
}
