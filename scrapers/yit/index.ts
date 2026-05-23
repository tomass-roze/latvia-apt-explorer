// YIT Latvia scraper — project-level data only in Phase 2.
//
// Per-apartment data on YIT is loaded via a JS-rendered search component
// (no XHR endpoint discoverable from the static HTML at the time of writing).
// Phase 3 will either reverse-engineer the search XHR or escalate to Playwright;
// until then, every Project comes back with `apartments: []` and `unknown`
// pricing — pins still render on the map, filtering doesn't engage YIT.
//
// Data sources used here:
//   - sitemap.xml for project URLs (canonical, sitemap-driven)
//   - dataLayer pushes embedded in each project page for name/id/city/district
//   - Project page body text for address pattern + build stage + energy class
//
// Brittleness expectations: dataLayer is a stable analytics surface — high
// confidence. Body-text address regex is medium — fall back to "<district>,
// <city>, Latvia" for geocoding when no street is parseable.

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

const DEVELOPER = 'yit' as const;
const SITEMAP_URL = 'https://www.yit.lv/sitemap.xml';

// Match `/dzivojamas-majas/<city>/<district>/<project>[/<subproject>]` ONLY.
// Per-apartment URLs (one more path segment, like `/.../<slug-or-listing-id>`)
// are intentionally excluded — those land in Phase 3.
const PROJECT_URL_RE =
  /^https?:\/\/www\.yit\.lv\/dzivojamas-majas\/(?<city>[a-z-]+)\/(?<district>[a-z-]+)\/(?<project>[a-z0-9-]+)(?:\/(?<sub>[a-z0-9-]+))?\/?$/i;
// Apartment-page URLs follow the same prefix but always include a 5th path segment
// after the project. We count these per project to populate apartmentCount.
const APARTMENT_URL_RE =
  /^https?:\/\/www\.yit\.lv\/dzivojamas-majas\/(?<city>[a-z-]+)\/(?<district>[a-z-]+)\/(?<project>[a-z0-9-]+)\/(?<sub>[a-z0-9-]+)\/(?<listing>[a-z0-9-]+)\/?$/i;

const LV_CITY_LABELS: Record<string, Project['city']> = {
  riga: 'Rīga',
  jurmala: 'Jūrmala',
  marupe: 'Mārupe',
  ogre: 'Ogre',
  salaspils: 'Salaspils',
  kekava: 'Ķekava',
  babite: 'Babīte',
};

// ─── Sitemap parsing ───────────────────────────────────────────────────────

interface SitemapInventory {
  projectUrls: string[];
  apartmentCountByProjectUrl: Map<string, number>;
  errors: ScrapeError[];
}

async function fetchSitemap(): Promise<SitemapInventory> {
  const res = await politeFetch(SITEMAP_URL);
  if (!res.ok) {
    return { projectUrls: [], apartmentCountByProjectUrl: new Map(), errors: [res.error] };
  }

  const $ = load(res.body, { xmlMode: true });
  const projectUrls: string[] = [];
  const apartmentUrls: string[] = [];

  $('loc').each((_, el) => {
    const url = $(el).text().trim();
    if (url.includes('/en/') || url.includes('/ru/')) return;
    if (APARTMENT_URL_RE.test(url)) {
      apartmentUrls.push(url);
    } else if (PROJECT_URL_RE.test(url)) {
      projectUrls.push(url);
    }
  });

  // Dedupe project URLs + drop parent projects when a sub-project exists.
  const projectSet = new Set(projectUrls);
  const leafProjects = projectUrls.filter((url) => {
    const trimmed = url.replace(/\/$/, '');
    return ![...projectSet].some(
      (other) => other !== url && other.replace(/\/$/, '').startsWith(`${trimmed}/`),
    );
  });

  // Count apartment URLs per leaf project (by URL prefix match).
  const apartmentCountByProjectUrl = new Map<string, number>();
  for (const projectUrl of leafProjects) {
    const prefix = `${projectUrl.replace(/\/$/, '')}/`;
    const count = apartmentUrls.filter((aptUrl) => aptUrl.startsWith(prefix)).length;
    apartmentCountByProjectUrl.set(projectUrl, count);
  }

  return {
    projectUrls: [...new Set(leafProjects)],
    apartmentCountByProjectUrl,
    errors: [],
  };
}

// ─── Per-project parsing ───────────────────────────────────────────────────

interface DataLayerEntryRaw {
  project?: string;
  projectId?: string;
  city?: string;
  area?: string;
  subarea?: string;
  pageType?: string;
}

interface ProjectPageDataLayer {
  project: string;
  projectId: string;
  city?: string;
  area?: string;
  subarea?: string;
  pageType: 'ProjectPage';
}

function extractProjectDataLayer(html: string): ProjectPageDataLayer | null {
  // dataLayer pushes are JSON literals injected by their analytics layer.
  // We want ONLY pageType="ProjectPage" — apartment pages emit pageType=
  // "ApartmentPage" with the same projectId, and we'd otherwise treat each
  // apartment URL as a separate project.
  const re = /window\.dataLayer\.push\((\{[^)]+\})\)/g;
  for (const match of html.matchAll(re)) {
    const literal = match[1];
    if (!literal) continue;
    try {
      const obj = JSON.parse(literal) as DataLayerEntryRaw;
      if (obj.pageType === 'ProjectPage' && obj.projectId && obj.project) {
        const result: ProjectPageDataLayer = {
          project: obj.project,
          projectId: obj.projectId,
          pageType: 'ProjectPage',
        };
        if (obj.city) result.city = obj.city;
        if (obj.area) result.area = obj.area;
        if (obj.subarea) result.subarea = obj.subarea;
        return result;
      }
    } catch {
      // Not all dataLayer pushes are pure JSON; skip the ones that aren't.
    }
  }
  return null;
}

// Address regex: street + house number, comma, LV-postal, comma, city word.
// Stops at the city name word boundary so apartment-listing text after the
// address ("Būvniecības stadija Brīvs Istabu skaits...") doesn't bleed in.
const ADDRESS_RE =
  /([A-ZĀČĒĢĪĶĻŅŠŪŽ][a-zāčēģīķļņšūžA-ZĀČĒĢĪĶĻŅŠŪŽ.\s-]{2,40}\s\d+[a-z]?)\s*,?\s*(LV-\d{4})\s*,?\s*(Rīga|Jūrmala|Mārupe|Ogre|Salaspils|Ķekava|Babīte|Sigulda|Ādaži|Olaine|Carnikava|Liepāja|Daugavpils|Ventspils|Jelgava|Valmiera|Rēzekne)\b/;

function extractAddress(bodyText: string): string | null {
  const match = bodyText.match(ADDRESS_RE);
  if (!match) return null;
  const [, street, postal, city] = match;
  return `${street?.replace(/\s+/g, ' ').trim() ?? ''}, ${postal} ${city}`;
}

function inferBuildStage(text: string): Project['buildStage'] {
  const t = text.toLowerCase();
  if (t.includes('pieejams uzreiz') || t.includes('nodots ekspluatācijā')) return 'ready';
  if (t.includes('drīzumā nodots') || t.includes('tuvojas pabeigšanai')) return 'nearly-complete';
  if (t.includes('būvniecības stadij')) return 'under-construction';
  return 'pre-sales';
}

function inferEnergyClass(text: string): Project['energyClass'] {
  // YIT pages mention "A klases", "A++ energoefektivitāte" etc.
  const m = text.match(/\b(A\+{1,2}|A|B|C|D|E|F)\s*klas/i);
  if (m?.[1]) return m[1].toUpperCase() as Project['energyClass'];
  return 'unknown';
}

function inferConstructionType(text: string): Project['constructionType'] {
  const t = text.toLowerCase();
  if (t.includes('monolīt')) return 'concrete-monolith';
  if (t.includes('paneļ')) return 'panel';
  if (t.includes('ķieģeļ') || t.includes('mūr')) return 'brick';
  if (t.includes('koka māj') || t.includes('koka karkas')) return 'wood';
  return 'unknown';
}

interface ParseResult {
  project: Project | null;
  errors: ScrapeError[];
}

async function parseProjectPage(url: string): Promise<ParseResult> {
  const res = await politeFetch(url);
  if (!res.ok) return { project: null, errors: [res.error] };

  const $ = load(res.body);
  const html = res.body;
  const dl = extractProjectDataLayer(html);

  // Drop if it's not actually a project page (404, apartment page, redirected, etc.).
  // The pageType discriminator means we silently skip every apartment URL the
  // sitemap throws at us — those are Phase 3's job.
  if (!dl) {
    return { project: null, errors: [] };
  }

  // Address: try regex; fall back to "<area>, <city>, Latvia" so geocoder gets something.
  const bodyText = $('main, body').text();
  const parsedAddress = extractAddress(bodyText);
  const cityLabel = LV_CITY_LABELS[dl.city?.toLowerCase() ?? 'riga'] ?? 'Rīga';
  const address = parsedAddress ?? [dl.area, dl.city].filter(Boolean).join(', ');

  if (!address) {
    return {
      project: null,
      errors: [parseError(`no address extractable at ${url}`, { url })],
    };
  }

  const projectId = buildProjectId(DEVELOPER, { address });
  const errors: ScrapeError[] = [];

  // Geocode (cache-backed)
  let location: Project['location'] = { lat: 56.95, lng: 24.1, source: 'manual' };
  const geo = await geocode({ developer: DEVELOPER, address });
  if (geo) {
    location = { lat: geo.lat, lng: geo.lng, source: geo.source };
  } else {
    errors.push({
      kind: 'geocode',
      message: `geocoder returned null for "${normalizeAddress(address)}"`,
      projectId,
    });
    // Use city centroid as a last-resort fallback so the pin still renders.
  }

  const candidate: Project = {
    id: projectId,
    developer: DEVELOPER,
    name: dl.project,
    address,
    city: cityLabel,
    location,
    buildStage: inferBuildStage(bodyText),
    completion: { kind: 'unknown' },
    energyClass: inferEnergyClass(bodyText),
    energyClassSource: 'developer-claim',
    constructionType: inferConstructionType(bodyText),
    parkingPrice: { kind: 'unknown' },
    storagePrice: { kind: 'unknown' },
    sourceUrl: url,
    apartments: [],
    scrapedAt: new Date().toISOString(),
  };
  if (dl.area) candidate.district = dl.area;

  const parsed = ProjectSchema.safeParse(candidate);
  if (!parsed.success) {
    errors.push(
      validateError(`project at ${url} failed schema`, parsed.error.issues, { url, projectId }),
    );
    return { project: null, errors };
  }

  return { project: parsed.data, errors };
}

// ─── Public scraper interface ───────────────────────────────────────────────

export const yitScraper: Scraper = {
  developer: DEVELOPER,
  async fetchListings(): Promise<ScrapeOutput> {
    const startedAt = new Date().toISOString();
    const allErrors: ScrapeError[] = [];

    const inventory = await fetchSitemap();
    allErrors.push(...inventory.errors);

    const projects: Project[] = [];
    for (const url of inventory.projectUrls) {
      const { project, errors } = await parseProjectPage(url);
      allErrors.push(...errors);
      if (project) projects.push(project);
    }
    await flushCache();

    const finishedAt = new Date().toISOString();
    const projectCount = projects.length;
    const apartmentCount = projects.reduce((sum, p) => sum + p.apartments.length, 0);

    let result: ScraperRunResult;
    if (inventory.errors.length > 0 || (inventory.projectUrls.length > 0 && projects.length === 0)) {
      result = {
        status: 'failed',
        developer: DEVELOPER,
        startedAt,
        finishedAt,
        errors: allErrors.length > 0 ? (allErrors as [ScrapeError, ...ScrapeError[]]) : [fetchError('no errors recorded but zero projects produced')],
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
