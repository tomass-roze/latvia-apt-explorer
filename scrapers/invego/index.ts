// Invego Latvia scraper.
//
// /dzivojamas-ekas/ embeds a single `var posts_data = {...}` JSON blob with
// every residential project Invego markets across the Baltics + Portugal. Each
// entry has id/title/slug/content/link/etc. We filter to LV-only by URL TLD
// (link.url ends with .lv) since the schema's CITIES enum is Latvia-only, and
// we extract the district from the content text by substring-matching against
// a known Riga district list. Project-level only — apartment data lives on
// per-project microsites (miera.lv, vitolu.lv, etc.) with no consistent shape.

import { load } from 'cheerio';
import {
  type Project,
  ProjectSchema,
  type ScrapeError,
  type ScraperRunResult,
  normalizeAddress,
} from '@/lib/schema';
import { buildProjectId } from '@/lib/schema.server';
import { fetchError, parseError, validateError } from '../base/errors';
import { politeFetch } from '../base/fetch';
import { flushCache, geocode } from '../base/geocoder';
import type { Scraper, ScrapeOutput } from '../base/interface';

const DEVELOPER = 'invego' as const;
const LISTING_URL = 'https://invego.lv/dzivojamas-ekas/';

// Substring matches inside Latvian content text. First match wins.
// Order matters: more specific entries first (e.g. "Mežaparks" before "Mežciems"
// to avoid Mežaparks matching Mežciems substring).
const RIGA_DISTRICTS = [
  'Āgenskalns',
  'Bišumuiža',
  'Bolderāja',
  'Centrs',
  'Ciekurkalns',
  'Dreiliņi',
  'Imanta',
  'Ķengarags',
  'Ķīpsala',
  'Krasta',
  'Mežaparks',
  'Mežciems',
  'Pārdaugava',
  'Pļavnieki',
  'Purvciems',
  'Sarkandaugava',
  'Skanste',
  'Teika',
  'Torņakalns',
  'Vītoli',
  'Ziepniekkalns',
  'Zolitūde',
] as const;

// Project slug → district override when content doesn't surface one we know.
const SLUG_DISTRICT_OVERRIDES: Record<string, string> = {
  nordale: 'Mežciems',
  'vitolu-parks': 'Mežaparks',
  'skanstes-rezidences': 'Skanste',
  'parka-kvartals': 'Centrs',
};

interface InvegoEntry {
  ID: number;
  title: string;
  slug: string;
  content?: string;
  link?: { url?: string; title?: string; target?: string };
}

function extractPostsData(html: string): InvegoEntry[] {
  // The blob is `var posts_data = {...};` — capture the JSON object.
  // It's a flat object keyed by ID; values are entries. We don't use the
  // outer key (it equals entry.ID anyway).
  const m = html.match(/var\s+posts_data\s*=\s*(\{[\s\S]*?\});/);
  if (!m?.[1]) return [];
  try {
    const obj = JSON.parse(m[1]) as Record<string, InvegoEntry>;
    return Object.values(obj);
  } catch {
    return [];
  }
}

function isLatviaUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).host.toLowerCase();
    if (host.endsWith('.ee')) return false;
    if (host.endsWith('.pt')) return false;
    return host.endsWith('.lv') || host.endsWith('.com');
  } catch {
    return false;
  }
}

function inferDistrict(content: string | undefined): string | undefined {
  if (!content) return undefined;
  const text = content.replace(/<[^>]+>/g, ' ');
  for (const d of RIGA_DISTRICTS) {
    if (text.includes(d)) return d;
  }
  return undefined;
}

function inferEnergyClass(content: string | undefined): Project['energyClass'] {
  if (!content) return 'unknown';
  const m = content.match(/\b(A\+{1,2}|A|B|C|D|E|F)\s*klas/i);
  if (m?.[1]) return m[1].toUpperCase() as Project['energyClass'];
  return 'unknown';
}

export const invegoScraper: Scraper = {
  developer: DEVELOPER,
  async fetchListings(): Promise<ScrapeOutput> {
    const startedAt = new Date().toISOString();
    const allErrors: ScrapeError[] = [];

    const res = await politeFetch(LISTING_URL);
    if (!res.ok) {
      return {
        projects: [],
        result: {
          status: 'failed',
          developer: DEVELOPER,
          startedAt,
          finishedAt: new Date().toISOString(),
          errors: [res.error],
          lastSuccessAt: startedAt,
        },
      };
    }

    const allEntries = extractPostsData(res.body);
    if (allEntries.length === 0) {
      return {
        projects: [],
        result: {
          status: 'failed',
          developer: DEVELOPER,
          startedAt,
          finishedAt: new Date().toISOString(),
          errors: [parseError('posts_data blob not found or unparseable', { url: LISTING_URL })],
          lastSuccessAt: startedAt,
        },
      };
    }

    const lvEntries = allEntries.filter((e) => isLatviaUrl(e.link?.url));

    const projects: Project[] = [];
    for (const entry of lvEntries) {
      const district =
        inferDistrict(entry.content) ?? SLUG_DISTRICT_OVERRIDES[entry.slug] ?? undefined;
      const addressForGeocoding = district
        ? `${entry.title}, ${district}, Rīga`
        : `${entry.title}, Rīga`;

      const projectId = buildProjectId(DEVELOPER, { address: addressForGeocoding });

      let location: Project['location'] = { lat: 56.95, lng: 24.1, source: 'manual' };
      const geo = await geocode({ developer: DEVELOPER, address: addressForGeocoding });
      if (geo) {
        location = { lat: geo.lat, lng: geo.lng, source: geo.source };
      } else {
        // Fallback: try the district alone. Invego project names are brands
        // (Mārupes Sirds, Vītolu Parks), not street addresses, so the
        // name+district query mostly misses. The district by itself reliably
        // resolves to a neighborhood centroid.
        const fallbackAddress = district ? `${district}, Rīga` : 'Rīga';
        const geoFallback = await geocode({ developer: DEVELOPER, address: fallbackAddress });
        if (geoFallback) {
          location = { lat: geoFallback.lat, lng: geoFallback.lng, source: geoFallback.source };
        } else {
          allErrors.push({
            kind: 'geocode',
            message: `geocoder returned null for "${normalizeAddress(addressForGeocoding)}" and fallback "${normalizeAddress(fallbackAddress)}"`,
            projectId,
          });
        }
      }

      const sourceUrl = entry.link?.url ?? `https://invego.lv/${entry.slug}`;
      const candidate: Project = {
        id: projectId,
        developer: DEVELOPER,
        name: entry.title,
        address: addressForGeocoding,
        city: 'Rīga',
        location,
        buildStage: 'pre-sales',
        completion: { kind: 'unknown' },
        energyClass: inferEnergyClass(entry.content),
        energyClassSource: 'developer-claim',
        constructionType: 'unknown',
        parkingPrice: { kind: 'unknown' },
        storagePrice: { kind: 'unknown' },
        sourceUrl,
        apartments: [],
        scrapedAt: new Date().toISOString(),
      };
      if (district) candidate.district = district;

      const parsed = ProjectSchema.safeParse(candidate);
      if (!parsed.success) {
        allErrors.push(
          validateError(`invego project failed schema`, parsed.error.issues, {
            url: LISTING_URL,
            projectId,
          }),
        );
        continue;
      }
      projects.push(parsed.data);
    }

    await flushCache();

    const finishedAt = new Date().toISOString();
    const projectCount = projects.length;
    const apartmentCount = 0;

    let result: ScraperRunResult;
    if (projects.length === 0 && lvEntries.length > 0) {
      const errs = allErrors.length > 0
        ? (allErrors as [ScrapeError, ...ScrapeError[]])
        : [fetchError('no projects produced')];
      result = {
        status: 'failed',
        developer: DEVELOPER,
        startedAt,
        finishedAt,
        errors: errs,
        lastSuccessAt: startedAt,
      };
    } else if (allErrors.length > 0) {
      result = {
        status: 'partial',
        developer: DEVELOPER,
        startedAt,
        finishedAt,
        projectCount,
        apartmentCount,
        errors: allErrors as [ScrapeError, ...ScrapeError[]],
        lastSuccessAt: startedAt,
      };
    } else {
      result = {
        status: 'ok',
        developer: DEVELOPER,
        startedAt,
        finishedAt,
        projectCount,
        apartmentCount,
      };
    }

    return { projects, result };
  },
};
