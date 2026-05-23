// YIT Latvia scraper.
//
// Project pages: sitemap-driven URLs at depth 4-5; pageType="ProjectPage"
// dataLayer push pinned as the discriminator. From the page body we extract
// the street address (regex), build stage, energy class, and construction type.
//
// Apartment pages: depth-6 sitemap URLs. Each apartment page embeds an HTML-
// entity-encoded JSON blob with `crmId`, `projectCRMId`, `numberOfRooms`,
// `floorNumber`, `cmsFloorNumberOfTotalFloors`, `apartmentSize`, `salesPrice`,
// `reservationStatusKey` (Free/Reserved/Sold), and `apartmentType`. We decode
// the entities, JSON.parse, and link to the parent project via `projectCRMId`.
//
// The two passes share a YIT-projectCRMId → internal-ProjectId map so apartments
// land in the right Project bucket. Apartments under projects we don't have
// (e.g., archived or filtered-out projects) are skipped.

import { load } from 'cheerio';
import {
  type Apartment,
  ApartmentSchema,
  type ApartmentId,
  type Project,
  type ProjectId,
  ProjectSchema,
  type ScrapeError,
  type ScraperRunResult,
  normalizeAddress,
} from '@/lib/schema';
import { buildProjectId } from '@/lib/schema.server';
import { fetchError, parseError, validateError } from '../base/errors';
import { politeFetch } from '../base/fetch';
import { flushCache, geocodeWithFallback } from '../base/geocoder';
import type { Scraper, ScrapeOutput } from '../base/interface';

const DEVELOPER = 'yit' as const;
const SITEMAP_URL = 'https://www.yit.lv/sitemap.xml';

// Project page: 4-5 path segments after `/dzivojamas-majas/`.
const PROJECT_URL_RE =
  /^https?:\/\/www\.yit\.lv\/dzivojamas-majas\/(?<city>[a-z-]+)\/(?<district>[a-z-]+)\/(?<project>[a-z0-9-]+)(?:\/(?<sub>[a-z0-9-]+))?\/?$/i;
// Apartment page: 5 path segments after `/dzivojamas-majas/<city>/<district>/<project>/`.
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
  apartmentUrls: string[];
  errors: ScrapeError[];
}

async function fetchSitemap(): Promise<SitemapInventory> {
  const res = await politeFetch(SITEMAP_URL);
  if (!res.ok) return { projectUrls: [], apartmentUrls: [], errors: [res.error] };

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

  // Dedupe project URLs + drop parents when sub-projects exist.
  const projectSet = new Set(projectUrls);
  const leafProjects = projectUrls.filter((url) => {
    const trimmed = url.replace(/\/$/, '');
    return ![...projectSet].some(
      (other) => other !== url && other.replace(/\/$/, '').startsWith(`${trimmed}/`),
    );
  });

  return {
    projectUrls: [...new Set(leafProjects)],
    apartmentUrls: [...new Set(apartmentUrls)],
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

interface ProjectParseResult {
  project: Project | null;
  yitProjectId: string | null;
  errors: ScrapeError[];
}

async function parseProjectPage(url: string): Promise<ProjectParseResult> {
  const res = await politeFetch(url);
  if (!res.ok) return { project: null, yitProjectId: null, errors: [res.error] };

  const $ = load(res.body);
  const html = res.body;
  const dl = extractProjectDataLayer(html);

  if (!dl) return { project: null, yitProjectId: null, errors: [] };

  const bodyText = $('main, body').text();
  const parsedAddress = extractAddress(bodyText);
  const cityLabel = LV_CITY_LABELS[dl.city?.toLowerCase() ?? 'riga'] ?? 'Rīga';
  const address = parsedAddress ?? [dl.area, dl.city].filter(Boolean).join(', ');

  if (!address) {
    return {
      project: null,
      yitProjectId: dl.projectId,
      errors: [parseError(`no address extractable at ${url}`, { url })],
    };
  }

  const projectId = buildProjectId(DEVELOPER, { address });
  const errors: ScrapeError[] = [];

  // Geocode with tiered fallback: street → district → city. Marking the
  // result's source tier so the UI can flag approximate pins.
  const variants: { address: string; tier: 'street' | 'district' | 'city' }[] = [
    { address, tier: 'street' },
  ];
  if (dl.area) variants.push({ address: `${dl.area}, ${cityLabel}`, tier: 'district' });
  variants.push({ address: String(cityLabel), tier: 'city' });
  let location: Project['location'] = { lat: 56.95, lng: 24.1, source: 'manual' };
  const geo = await geocodeWithFallback({ developer: DEVELOPER, variants });
  if (geo) {
    location = { lat: geo.lat, lng: geo.lng, source: geo.source };
  } else {
    errors.push({
      kind: 'geocode',
      message: `geocoder returned null for "${normalizeAddress(address)}"`,
      projectId,
    });
  }

  // YIT's dataLayer surfaces a `subarea` field on project pages that holds
  // the project FAMILY name with proper Latvian diacritics (e.g., "Mārpagalmi"),
  // while `project` holds the per-building leaf name ("Mārpagalmi 5"). Prefer
  // the family name and keep the leaf as subName, falling back to the leaf
  // name when subarea isn't usable.
  const hasFamily =
    dl.subarea && dl.subarea !== 'N/A' && dl.subarea.trim() !== dl.project.trim();
  const finalName = hasFamily ? dl.subarea! : dl.project;
  const candidate: Project = {
    id: projectId,
    developer: DEVELOPER,
    name: finalName,
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
  if (hasFamily) candidate.subName = dl.project;
  if (dl.area) candidate.district = dl.area;

  const parsed = ProjectSchema.safeParse(candidate);
  if (!parsed.success) {
    errors.push(
      validateError(`project at ${url} failed schema`, parsed.error.issues, { url, projectId }),
    );
    return { project: null, yitProjectId: dl.projectId, errors };
  }

  return { project: parsed.data, yitProjectId: dl.projectId, errors };
}

// ─── Per-apartment parsing ─────────────────────────────────────────────────

interface ApartmentBlob {
  crmId: string;
  projectCRMId: string;
  reservationStatusKey?: string;
  numberOfRooms?: string;
  floorNumber?: string;
  cmsFloorNumberOfTotalFloors?: string;
  apartmentSize?: number | string;
  salesPrice?: number | string;
  apartmentType?: string;
}

// The blob lives inline in the HTML as HTML-entity-encoded JSON. We find it by
// locating the crmId field and slurping a JSON object around it, then decode
// `&quot;` → `"` etc. before parsing.
function extractApartmentBlob(html: string): ApartmentBlob | null {
  // Try a tight, single-object match first. The blob starts with `{` and contains
  // the encoded `crmId` literal `&quot;crmId&quot;`.
  const re = /\{[^{}]{0,1500}&quot;crmId&quot;[^{}]{0,1500}\}/;
  const match = html.match(re);
  if (!match) return null;
  const decoded = match[0]
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  try {
    return JSON.parse(decoded) as ApartmentBlob;
  } catch {
    return null;
  }
}

const AVAILABILITY_MAP: Record<string, Apartment['availability']> = {
  Free: 'available',
  Available: 'available',
  Reserved: 'reserved',
  Sold: 'sold',
};

function parseRooms(blob: ApartmentBlob): number | null {
  if (blob.numberOfRooms) {
    const n = Number.parseInt(blob.numberOfRooms, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  // Fallback: parse from apartmentType like "2h+k" → 2
  if (blob.apartmentType) {
    const m = blob.apartmentType.match(/^(\d+)/);
    if (m?.[1]) return Number.parseInt(m[1], 10);
  }
  return null;
}

interface ApartmentParseResult {
  apartment: Apartment | null;
  errors: ScrapeError[];
}

async function parseApartmentPage(
  url: string,
  projectIdByYit: Map<string, ProjectId>,
): Promise<ApartmentParseResult> {
  const res = await politeFetch(url);
  if (!res.ok) return { apartment: null, errors: [res.error] };

  const blob = extractApartmentBlob(res.body);
  if (!blob || !blob.crmId || !blob.projectCRMId) {
    // Apartment is gone / 404 / page restructured. Don't log — it's the common case for stale sitemap entries.
    return { apartment: null, errors: [] };
  }

  const projectId = projectIdByYit.get(blob.projectCRMId);
  if (!projectId) {
    // Parent project wasn't scraped (filtered out, or under a sub-route we don't visit).
    // Silently skip — the apartment is orphaned for us.
    return { apartment: null, errors: [] };
  }

  const rooms = parseRooms(blob);
  const area = typeof blob.apartmentSize === 'number'
    ? blob.apartmentSize
    : Number.parseFloat(String(blob.apartmentSize ?? ''));
  const floor = blob.floorNumber ? Number.parseInt(blob.floorNumber, 10) : null;
  const priceEur =
    typeof blob.salesPrice === 'number'
      ? blob.salesPrice
      : Number.parseFloat(String(blob.salesPrice ?? ''));
  const availability = AVAILABILITY_MAP[blob.reservationStatusKey ?? 'Free'] ?? 'available';

  if (rooms === null || !Number.isFinite(area) || floor === null || !Number.isFinite(floor)) {
    return {
      apartment: null,
      errors: [parseError(`incomplete apartment data at ${url}`, { url, projectId })],
    };
  }

  const apartmentId = `${projectId}:${blob.crmId}` as ApartmentId;

  const candidate: Apartment = {
    id: apartmentId,
    projectId,
    rooms,
    area,
    floor,
    price: Number.isFinite(priceEur) && priceEur > 0
      ? { kind: 'amount', eur: priceEur, vatIncluded: true }
      : { kind: 'unknown' },
    pricePerSqm:
      Number.isFinite(priceEur) && priceEur > 0 && area > 0
        ? { kind: 'amount', eur: Math.round(priceEur / area), vatIncluded: true }
        : { kind: 'unknown' },
    availability,
    deepLinkUrl: url,
  };

  if (blob.cmsFloorNumberOfTotalFloors) {
    const total = Number.parseInt(blob.cmsFloorNumberOfTotalFloors, 10);
    if (Number.isFinite(total) && total > 0) candidate.totalFloors = total;
  }

  const parsed = ApartmentSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      apartment: null,
      errors: [
        validateError(`apartment at ${url} failed schema`, parsed.error.issues, {
          url,
          projectId,
        }),
      ],
    };
  }
  return { apartment: parsed.data, errors: [] };
}

// ─── Public scraper interface ───────────────────────────────────────────────

export const yitScraper: Scraper = {
  developer: DEVELOPER,
  async fetchListings(): Promise<ScrapeOutput> {
    const startedAt = new Date().toISOString();
    const allErrors: ScrapeError[] = [];

    const inventory = await fetchSitemap();
    allErrors.push(...inventory.errors);

    // Pass 1: project pages.
    const projectsByInternalId = new Map<ProjectId, Project>();
    const projectIdByYit = new Map<string, ProjectId>();
    for (const url of inventory.projectUrls) {
      const { project, yitProjectId, errors } = await parseProjectPage(url);
      allErrors.push(...errors);
      if (project) {
        projectsByInternalId.set(project.id, project);
        if (yitProjectId) projectIdByYit.set(yitProjectId, project.id);
      }
    }

    // Pass 2: apartment pages.
    const apartmentsByProjectId = new Map<ProjectId, Apartment[]>();
    for (const url of inventory.apartmentUrls) {
      const { apartment, errors } = await parseApartmentPage(url, projectIdByYit);
      allErrors.push(...errors);
      if (apartment) {
        const list = apartmentsByProjectId.get(apartment.projectId) ?? [];
        list.push(apartment);
        apartmentsByProjectId.set(apartment.projectId, list);
      }
    }

    // Merge apartments into their parent projects.
    const projects: Project[] = [];
    for (const project of projectsByInternalId.values()) {
      const apartments = apartmentsByProjectId.get(project.id) ?? [];
      projects.push({ ...project, apartments });
    }

    await flushCache();

    const finishedAt = new Date().toISOString();
    const projectCount = projects.length;
    const apartmentCount = projects.reduce((sum, p) => sum + p.apartments.length, 0);

    let result: ScraperRunResult;
    if (
      inventory.errors.length > 0 ||
      (inventory.projectUrls.length > 0 && projects.length === 0)
    ) {
      const errs = allErrors.length > 0
        ? (allErrors as [ScrapeError, ...ScrapeError[]])
        : [fetchError('no errors recorded but zero projects produced')];
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
