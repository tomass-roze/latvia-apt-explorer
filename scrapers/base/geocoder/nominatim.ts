// Nominatim (OpenStreetMap) geocoder — free, rate-limited to 1 req/sec.
//
// Per OSMF policy, identifying User-Agent + politeness are mandatory.
// Coverage in Latvia is decent for established addresses but lags for
// brand-new construction. The fallback chain pairs this with a manual
// override file.

import type { GeocodeHit } from './janas-seta';

const USER_AGENT =
  'LatviaApartmentExplorer/0.1 (+https://github.com/tomass/jp; contact: thomas@bubblebeeindustries.com)';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';

let lastReqAt = 0;
const REQ_DELAY_MS = 1100; // strict 1 req/sec, +100ms buffer

async function rateLimit(): Promise<void> {
  const wait = Math.max(0, REQ_DELAY_MS - (Date.now() - lastReqAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastReqAt = Date.now();
}

export async function geocodeNominatim(address: string): Promise<GeocodeHit | null> {
  await rateLimit();
  const url = new URL(NOMINATIM_BASE);
  url.searchParams.set('q', `${address}, Latvia`);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'lv');
  url.searchParams.set('addressdetails', '0');

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    const first = data[0];
    if (!first) return null;
    const lat = Number.parseFloat(first.lat);
    const lng = Number.parseFloat(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
