import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetForTests, flushCache, geocode } from './index';

const REPO_ROOT = process.cwd();
const CACHE_DIR = join(REPO_ROOT, 'data', 'cache');
const OVERRIDES_DIR = join(REPO_ROOT, 'data', 'overrides');
const CACHE_PATH = join(CACHE_DIR, 'geocoding.json');
const OVERRIDES_PATH = join(OVERRIDES_DIR, 'geocoding.json');

const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(async () => {
  _resetForTests();
  await rm(CACHE_PATH, { force: true });
  await rm(OVERRIDES_PATH, { force: true });
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  _resetForTests();
});

describe('geocoder fallback chain', () => {
  it('honors manual overrides above everything else', async () => {
    await mkdir(OVERRIDES_DIR, { recursive: true });
    await writeFile(
      OVERRIDES_PATH,
      JSON.stringify({
        'yit:test street 1, riga': { lat: 56.95, lng: 24.1, source: 'manual' },
      }),
      'utf8',
    );

    // Network must not be touched when an override exists.
    globalThis.fetch = vi.fn(() => {
      throw new Error('network should not be called');
    });

    const result = await geocode({ developer: 'yit', address: 'Test Street 1, Riga' });
    expect(result).toEqual({ lat: 56.95, lng: 24.1, source: 'manual' });
  });

  it('returns null when all sources fail', async () => {
    globalThis.fetch = vi.fn(async () => new Response('[]', { status: 200 })) as typeof fetch;
    const result = await geocode({ developer: 'yit', address: 'NowhereStreet 999, NotReal' });
    expect(result).toBeNull();
  });

  it('caches a Nominatim hit and persists via flushCache', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify([{ lat: '56.949', lon: '24.105' }]), { status: 200 }),
    ) as typeof fetch;

    const result = await geocode({ developer: 'yit', address: 'Brīvības iela 1, Rīga' });
    expect(result).not.toBeNull();
    expect(result?.source).toBe('nominatim');
    expect(result?.lat).toBeCloseTo(56.949, 3);

    await flushCache();
    const cached = JSON.parse(await readFile(CACHE_PATH, 'utf8'));
    expect(cached['yit:brīvības iela 1, rīga']).toBeDefined();
  });
});
