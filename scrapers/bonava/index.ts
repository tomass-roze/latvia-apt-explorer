// Bonava Latvia scraper.
//
// Both project and apartment pages are server-rendered and embed structured
// data as JSON-escaped `{"Title":"...","Value":"..."}` pairs in inline scripts.
// No Playwright required.
//
// Sitemap structure (after `https://www.bonava.lv/`):
//   /dzivokli/<city>/<district>/<project-family>/<sub-building>             — project entity (~84)
//   /dzivokli/<city>/<district>/<project-family>/<sub-building>/<apt-slug>  — apartment    (~421)
//
// Two-pass like YIT: project pages first to build the URL → ProjectId map,
// apartments second, linked via URL prefix.

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
import { flushCache, geocode } from '../base/geocoder';
import type { Scraper, ScrapeOutput } from '../base/interface';

const DEVELOPER = 'bonava' as const;
const SITEMAP_URL = 'https://www.bonava.lv/sitemap.xml';

// Path segment counts (1-indexed from host root):
//   1=dzivokli  2=city  3=district  4=project-family  5=sub-building [6=apartment]
const PROJECT_URL_RE =
  /^https?:\/\/www\.bonava\.lv\/dzivokli\/(?<city>[a-z-]+)\/(?<district>[a-z-]+)\/(?<family>[a-z0-9-]+)\/(?<sub>[a-z0-9-]+)\/?$/i;
const APARTMENT_URL_RE =
  /^https?:\/\/www\.bonava\.lv\/dzivokli\/(?<city>[a-z-]+)\/(?<district>[a-z-]+)\/(?<family>[a-z0-9-]+)\/(?<sub>[a-z0-9-]+)\/(?<apt>[a-z0-9-]+)\/?$/i;

const LV_CITY_LABELS: Record<string, Project['city']> = {
  riga: 'Rīga',
  jurmala: 'Jūrmala',
  marupe: 'Mārupe',
  ogre: 'Ogre',
  salaspils: 'Salaspils',
  kekava: 'Ķekava',
  babite: 'Babīte',
};

// ─── Sitemap ───────────────────────────────────────────────────────────────

interface SitemapInventory {
  projectUrls: string[];
  apartmentUrls: string[];
  errors: ScrapeError[];
}

async function fetchSitemap(): Promise<SitemapInventory> {
  const res = await politeFetch(SITEMAP_URL);
  if (!res.ok) return { projectUrls: [], apartmentUrls: [], errors: [res.error] };

  const $ = load(res.body, { xmlMode: true });
  const projectUrls = new Set<string>();
  const apartmentUrls = new Set<string>();

  $('loc').each((_, el) => {
    const url = $(el).text().trim();
    // Bonava's sitemap is LV-only on the bonava.lv domain.
    if (APARTMENT_URL_RE.test(url)) apartmentUrls.add(url);
    else if (PROJECT_URL_RE.test(url)) projectUrls.add(url);
  });

  return {
    projectUrls: [...projectUrls],
    apartmentUrls: [...apartmentUrls],
    errors: [],
  };
}

// ─── Page parsing helpers ──────────────────────────────────────────────────

interface TitleValue {
  title: string;
  value: string;
}

// Extract every {"Title":"...","Value":"..."} pair from the inline JSON-escaped
// blobs Bonava embeds. Returns the raw values (still containing \uXXXX escapes
// and `&nbsp;` from JSON encoding).
function extractTitleValuePairs(html: string): TitleValue[] {
  const re = /"Title":"([^"\\]*(?:\\.[^"\\]*)*)","Value":"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  const out: TitleValue[] = [];
  for (const m of html.matchAll(re)) {
    out.push({
      title: decodeJsonString(m[1] ?? ''),
      value: decodeJsonString(m[2] ?? ''),
    });
  }
  return out;
}

function decodeJsonString(input: string): string {
  try {
    // Wrap and JSON.parse to handle \uXXXX, \", \\ etc. uniformly.
    return JSON.parse(`"${input}"`) as string;
  } catch {
    return input;
  }
}

function findValue(pairs: TitleValue[], title: string): string | null {
  for (const p of pairs) {
    // Match on Latvian title prefix (case-sensitive — Bonava is consistent).
    if (p.title === title) return p.value.replace(/\s+/g, ' ').trim();
  }
  return null;
}

function findValueLoose(pairs: TitleValue[], substr: string): string | null {
  for (const p of pairs) {
    if (p.title.includes(substr)) return p.value.replace(/\s+/g, ' ').trim();
  }
  return null;
}

// Parse a Latvian-formatted EUR amount like "167 000 EUR" or "167 000 € " → 167000.
function parseEur(input: string | null): number | null {
  if (!input) return null;
  const m = input.match(/([\d\s ]+(?:[.,]\d+)?)/);
  if (!m?.[1]) return null;
  const num = Number.parseFloat(m[1].replace(/[\s ]/g, '').replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

function parseM2(input: string | null): number | null {
  if (!input) return null;
  // "69,8 m²" or "69.8 m²"
  const m = input.match(/(\d+(?:[.,]\d+)?)\s*m[²2]/);
  if (!m?.[1]) return null;
  return Number.parseFloat(m[1].replace(',', '.'));
}

function parseInteger(input: string | null): number | null {
  if (!input) return null;
  const m = input.match(/(\d+)/);
  return m?.[1] ? Number.parseInt(m[1], 10) : null;
}

function inferBuildStageFromText(text: string): Project['buildStage'] {
  const t = text.toLowerCase();
  if (t.includes('pieejams uzreiz') || t.includes('nodots ekspluatācij')) return 'ready';
  if (t.includes('drīzumā nodos') || t.includes('tuvojas pabeig')) return 'nearly-complete';
  if (t.includes('būvniecības stadij') || t.includes(' stadijā')) return 'under-construction';
  return 'pre-sales';
}

function inferEnergyClass(text: string): Project['energyClass'] {
  const m = text.match(/\b(A\+{1,2}|A|B|C|D|E|F)\s*klas/i);
  if (m?.[1]) return m[1].toUpperCase() as Project['energyClass'];
  return 'unknown';
}

function inferConstructionType(text: string): Project['constructionType'] {
  const t = text.toLowerCase();
  if (t.includes('monolīt') || t.includes('monolit')) return 'concrete-monolith';
  if (t.includes('paneļ')) return 'panel';
  if (t.includes('ķieģeļ') || t.includes('mūr')) return 'brick';
  if (t.includes('koka māj') || t.includes('koka karkas')) return 'wood';
  return 'unknown';
}

function unslugify(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title>([^<]+?)\s*-\s*Bonava<\/title>/);
  if (!m?.[1]) return null;
  return m[1]
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)));
}

// Pull a "Street Name <number>[<letter>]" address out of a free-form Bonava
// project name. Falls back to "<unslugified-family>, <city>" if the name
// doesn't contain a clean street + number.
function deriveAddress(
  name: string,
  districtSlug: string | undefined,
  _citySlug: string | undefined,
  cityLabel: Project['city'],
): string {
  // Prefer a tail like "..., Robežu 17" or just "Robežu 17"
  const streetWithNum = name.match(
    /([A-ZĀČĒĢĪĶĻŅŠŪŽ][a-zāčēģīķļņšūžA-ZĀČĒĢĪĶĻŅŠŪŽ.\s]{2,40}\s\d+[A-Za-z]?(?:[\s/-]?\d+[A-Za-z]?)?)/,
  );
  if (streetWithNum?.[1]) {
    return `${streetWithNum[1].trim()}, ${cityLabel}`;
  }
  const districtPart = districtSlug ? unslugify(districtSlug) : '';
  return [name, districtPart, cityLabel].filter(Boolean).join(', ');
}

// ─── Per-project parsing ───────────────────────────────────────────────────

interface ProjectParseResult {
  project: Project | null;
  projectUrl: string;
  errors: ScrapeError[];
}

async function parseProjectPage(url: string): Promise<ProjectParseResult> {
  const res = await politeFetch(url);
  if (!res.ok) return { project: null, projectUrl: url, errors: [res.error] };

  const match = url.match(PROJECT_URL_RE);
  if (!match?.groups) {
    return {
      project: null,
      projectUrl: url,
      errors: [parseError(`URL did not match expected shape: ${url}`, { url })],
    };
  }
  const { city: citySlug, district: districtSlug, family: familySlug, sub: subSlug } =
    match.groups;

  const $ = load(res.body);
  const html = res.body;
  const bodyText = $('body').text();
  const pairs = extractTitleValuePairs(html);

  // Discriminate project vs apartment page: project pages embed `Dzīvokļu skaits`
  // (apartment count) and/or a Cena value formatted as a range (contains `–` or
  // hyphen between two amounts). Apartment pages have a single concrete price.
  // Depth-5 URLs aren't a clean signal — some Bonava projects skip the sub-building
  // layer and apartments hang directly off the project family, so the URL pattern
  // alone matches both.
  const hasApartmentCount = pairs.some((p) => p.title.includes('Dzīvokļu skaits'));
  const cenaValue = findValue(pairs, 'Cena') ?? '';
  const looksLikeRange = /[-–]/.test(cenaValue) && /\d.*[-–].*\d/.test(cenaValue);
  if (!hasApartmentCount && !looksLikeRange) {
    // It's an apartment URL masquerading as a project — skip silently.
    return { project: null, projectUrl: url, errors: [] };
  }

  const name = extractTitle(html) ?? unslugify(subSlug ?? familySlug ?? '');
  const cityLabel = LV_CITY_LABELS[citySlug?.toLowerCase() ?? 'riga'] ?? 'Rīga';
  const district = districtSlug ? unslugify(districtSlug) : undefined;

  // Address: prefer a street+number extracted from the page name (which has
  // proper Latvian diacritics), fall back to the name itself, then to the
  // unslugified URL parts. Slugs strip diacritics, which breaks Nominatim.
  const address = deriveAddress(name, districtSlug, citySlug, cityLabel);

  const projectId = buildProjectId(DEVELOPER, { address });
  const errors: ScrapeError[] = [];

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
  }

  const handover = findValueLoose(pairs, 'nodošana');
  const candidate: Project = {
    id: projectId,
    developer: DEVELOPER,
    name,
    address,
    city: cityLabel,
    location,
    buildStage: inferBuildStageFromText(`${bodyText} ${handover ?? ''}`),
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
  if (district) candidate.district = district;

  const parsed = ProjectSchema.safeParse(candidate);
  if (!parsed.success) {
    errors.push(
      validateError(`project at ${url} failed schema`, parsed.error.issues, { url, projectId }),
    );
    return { project: null, projectUrl: url, errors };
  }

  return { project: parsed.data, projectUrl: url, errors };
}

// ─── Per-apartment parsing ─────────────────────────────────────────────────

interface ApartmentParseResult {
  apartment: Apartment | null;
  errors: ScrapeError[];
}

const AVAILABILITY_MAP: Record<string, Apartment['availability']> = {
  rezervēts: 'reserved',
  pārdots: 'sold',
};

function inferAvailability(text: string): Apartment['availability'] {
  const t = text.toLowerCase();
  for (const [marker, status] of Object.entries(AVAILABILITY_MAP)) {
    if (t.includes(marker)) return status;
  }
  return 'available';
}

async function parseApartmentPage(
  url: string,
  projectIdByUrl: Map<string, ProjectId>,
): Promise<ApartmentParseResult> {
  const parentUrl = url.replace(/\/[^/]+\/?$/, '');
  const projectId = projectIdByUrl.get(parentUrl) ?? projectIdByUrl.get(`${parentUrl}/`);
  if (!projectId) {
    // Parent project wasn't scraped — silently skip orphan apartments.
    return { apartment: null, errors: [] };
  }

  const res = await politeFetch(url);
  if (!res.ok) return { apartment: null, errors: [res.error] };

  const $ = load(res.body);
  const html = res.body;
  const bodyText = $('body').text();
  const pairs = extractTitleValuePairs(html);

  const rooms = parseInteger(findValue(pairs, 'Istabas'));
  const area = parseM2(findValue(pairs, 'Platība'));
  const floor = parseInteger(findValue(pairs, 'Stāvs'));
  const price = parseEur(findValue(pairs, 'Cena'));
  const pricePerSqm = parseEur(findValueLoose(pairs, 'Cena par m'));
  const availability = inferAvailability(bodyText);

  if (rooms === null || area === null || floor === null) {
    return {
      apartment: null,
      errors: [parseError(`incomplete apartment data at ${url}`, { url, projectId })],
    };
  }

  const aptSlug = url.split('/').filter(Boolean).at(-1) ?? '';
  const apartmentId = `${projectId}:${aptSlug}` as ApartmentId;

  const candidate: Apartment = {
    id: apartmentId,
    projectId,
    rooms,
    area,
    floor,
    price: price !== null && price > 0
      ? { kind: 'amount', eur: price, vatIncluded: true }
      : { kind: 'unknown' },
    pricePerSqm: pricePerSqm !== null && pricePerSqm > 0
      ? { kind: 'amount', eur: pricePerSqm, vatIncluded: true }
      : area > 0 && price !== null && price > 0
        ? { kind: 'amount', eur: Math.round(price / area), vatIncluded: true }
        : { kind: 'unknown' },
    availability,
    deepLinkUrl: url,
  };

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

// ─── Public scraper interface ──────────────────────────────────────────────

export const bonavaScraper: Scraper = {
  developer: DEVELOPER,
  async fetchListings(): Promise<ScrapeOutput> {
    const startedAt = new Date().toISOString();
    const allErrors: ScrapeError[] = [];

    const inventory = await fetchSitemap();
    allErrors.push(...inventory.errors);

    const projectsByInternalId = new Map<ProjectId, Project>();
    const projectIdByUrl = new Map<string, ProjectId>();
    for (const url of inventory.projectUrls) {
      const { project, projectUrl, errors } = await parseProjectPage(url);
      allErrors.push(...errors);
      if (project) {
        projectsByInternalId.set(project.id, project);
        // Stash without trailing slash for prefix matching of apartment URLs.
        projectIdByUrl.set(projectUrl.replace(/\/$/, ''), project.id);
      }
    }

    const apartmentsByProjectId = new Map<ProjectId, Apartment[]>();
    for (const url of inventory.apartmentUrls) {
      const { apartment, errors } = await parseApartmentPage(url, projectIdByUrl);
      allErrors.push(...errors);
      if (apartment) {
        const list = apartmentsByProjectId.get(apartment.projectId) ?? [];
        list.push(apartment);
        apartmentsByProjectId.set(apartment.projectId, list);
      }
    }

    const projects: Project[] = [];
    for (const project of projectsByInternalId.values()) {
      projects.push({ ...project, apartments: apartmentsByProjectId.get(project.id) ?? [] });
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
