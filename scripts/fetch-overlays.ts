// One-shot Overpass fetch for the four map overlay categories.
//
// Runs at build time (or on demand) — Overpass is explicitly discouraged
// from per-visitor querying. Output is stable-sorted GeoJSON committed to
// data/overlays/, served as static assets, lazy-loaded by the client only
// when the user toggles a layer on.
//
// Categories scoped to the Latvia bounding box. Schools and shops are
// pruned to nodes (the rep point of each amenity) to keep payload small.
// Transit includes bus/tram/trolleybus stops (the dense set; railway is
// less informative for apartment-buying decisions).
//
// Politeness: 1 request at a time, 60s server-side timeout, identifying UA.

import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { stableStringify } from '@/lib/json-stable';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const USER_AGENT =
  'LatviaApartmentExplorer/0.1 (+https://github.com/tomass/jp; contact: thomas@bubblebeeindustries.com)';
const REPO_ROOT = process.cwd();
const OUT_DIR = join(REPO_ROOT, 'data', 'overlays');

// Latvia bbox [south, west, north, east] per Overpass convention.
const LATVIA_BBOX = '55.67,20.97,58.09,28.24';

const QUERIES: Record<string, string> = {
  schools: `
    [out:json][timeout:60][bbox:${LATVIA_BBOX}];
    (
      node["amenity"="school"];
      node["amenity"="kindergarten"];
    );
    out body;
  `,
  // Rail + tram stops only. Bus stops would be ~22k nodes (>5MB) — too dense
  // to ship and not the most useful signal for apartment buyers anyway.
  transit: `
    [out:json][timeout:60][bbox:${LATVIA_BBOX}];
    (
      node["railway"~"^(station|halt|tram_stop)$"];
    );
    out body;
  `,
  parks: `
    [out:json][timeout:60][bbox:${LATVIA_BBOX}];
    (
      node["leisure"~"^(park|playground|garden)$"];
    );
    out body;
  `,
  shops: `
    [out:json][timeout:60][bbox:${LATVIA_BBOX}];
    (
      node["shop"~"^(supermarket|convenience|mall|grocery)$"];
    );
    out body;
  `,
};

interface OverpassNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassNode[];
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, path);
}

async function fetchCategory(category: string, query: string): Promise<void> {
  console.log(`[overlays] fetching ${category}…`);
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'text/plain' },
    body: query,
  });
  if (!res.ok) {
    throw new Error(`Overpass ${category} returned HTTP ${res.status}`);
  }
  const data = (await res.json()) as OverpassResponse;
  const nodes = data.elements.filter((e) => e.type === 'node');

  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: nodes.map((n) => ({
      type: 'Feature',
      properties: {
        id: String(n.id),
        // Keep only a small subset of tags — names if present, otherwise nothing.
        name: n.tags?.name ?? n.tags?.['name:lv'] ?? '',
      },
      geometry: { type: 'Point', coordinates: [n.lon, n.lat] },
    })),
  };

  await atomicWrite(join(OUT_DIR, `${category}.geojson`), stableStringify(geojson));
  console.log(`[overlays] ${category}: ${nodes.length} features`);
}

async function main(): Promise<void> {
  for (const [category, query] of Object.entries(QUERIES)) {
    await fetchCategory(category, query.trim());
    // Be polite — 2 seconds between Overpass calls.
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log('[overlays] done.');
}

main().catch((err) => {
  console.error('[overlays] fatal:', err);
  process.exit(1);
});
