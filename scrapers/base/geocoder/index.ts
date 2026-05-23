// Geocoder fallback chain:
//   manual override → cache → Jāņa sēta → Nominatim → fail
//
// Cache and override are committed to git: `data/cache/geocoding.json` and
// `data/overrides/geocoding.json`. Cache is append-only (entries never
// expire); to force a re-geocode delete the entry. Override wins over
// everything else.
//
// The cache key is `<developer>:<normalizedAddress>` so identical
// addresses across developers share a result. The address is the
// normalized form from lib/schema.normalizeAddress (lowercased, NFC,
// whitespace-collapsed).

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { stableStringify } from '@/lib/json-stable';
import { type Developer, normalizeAddress } from '@/lib/schema';
import { type GeocodeHit, geocodeJanasSeta } from './janas-seta';
import { geocodeNominatim } from './nominatim';

const REPO_ROOT = process.cwd();
const CACHE_PATH = join(REPO_ROOT, 'data', 'cache', 'geocoding.json');
const OVERRIDES_PATH = join(REPO_ROOT, 'data', 'overrides', 'geocoding.json');

type CacheRecord = { lat: number; lng: number; source: GeocodeSource };
type CacheMap = Record<string, CacheRecord>;
export type GeocodeSource = 'vzd' | 'janas-seta' | 'nominatim' | 'manual';

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
 * Resolve an address to lat/lng. Order:
 *   1. manual override (data/overrides/geocoding.json)
 *   2. persistent cache (data/cache/geocoding.json)
 *   3. Jāņa sēta API (stub today)
 *   4. Nominatim (rate-limited)
 *
 * On success, the result is appended to the cache (in-memory; flushed via
 * `flushCache()` at end of scraper run).
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
