// Hepsor Latvia scraper — Playwright-based.
//
// Hepsor's static HTML is empty; all project metadata is rendered client-side
// from a WordPress REST backend. We use Playwright to wait for the
// `.project_page` element, then parse the rendered DOM with cheerio.
//
// Sitemap structure: hepsor.lv/project-sitemap.xml lists ~150 project URLs
// across LV + ET + EN locale prefixes for both Latvia and Estonia projects.
// We filter to:
//   1. Bare LV paths (no /en/ /et/ /ru/ prefix)
//   2. Header location containing "Rīga" (drops Tallinn/Tartu projects)
//
// Result: ~7-8 active Latvian projects, project-level only — Hepsor does not
// publish per-apartment data on their public site.

import { load } from 'cheerio';
import {
  type Project,
  ProjectSchema,
  type ScrapeError,
  type ScraperRunResult,
  normalizeAddress,
} from '@/lib/schema';
import { buildProjectId } from '@/lib/schema.server';
import { renderPage, shutdownBrowser } from '../base/browser';
import { fetchError, parseError, validateError } from '../base/errors';
import { politeFetch } from '../base/fetch';
import { flushCache, geocode } from '../base/geocoder';
import type { Scraper, ScrapeOutput } from '../base/interface';

const DEVELOPER = 'hepsor' as const;
const SITEMAP_URL = 'https://hepsor.lv/project-sitemap.xml';

// Bare LV: `https://hepsor.lv/project/<slug>/` (no locale-prefix segment).
const PROJECT_URL_RE = /^https?:\/\/hepsor\.lv\/project\/([a-z0-9-]+)\/?$/i;

interface ProjectParseResult {
  project: Project | null;
  url: string;
  errors: ScrapeError[];
}

async function fetchProjectUrls(): Promise<{ urls: string[]; errors: ScrapeError[] }> {
  const res = await politeFetch(SITEMAP_URL);
  if (!res.ok) return { urls: [], errors: [res.error] };
  const $ = load(res.body, { xmlMode: true });
  const urls = new Set<string>();
  $('loc').each((_, el) => {
    const url = $(el).text().trim();
    if (PROJECT_URL_RE.test(url)) urls.add(url);
  });
  return { urls: [...urls], errors: [] };
}

function extractLocation(headerText: string, h1: string): string {
  // Hepsor's JS sometimes injects raw HTML strings (like <img src="...">) as
  // text nodes rather than DOM elements, so cheerio's .text() doesn't strip
  // them. Strip any HTML-tag-like substring before further parsing.
  const cleaned = headerText.replace(/<[^>]+\/?>/g, ' ');
  const stripped = cleaned.startsWith(h1) ? cleaned.slice(h1.length) : cleaned;
  return stripped.replace(/\s+/g, ' ').trim();
}

function isRigaLocation(location: string): boolean {
  return /\bR[īi]ga\b/i.test(location);
}

function detailText($: ReturnType<typeof load>, label: string): string | null {
  let result: string | null = null;
  $('.details .row.detail').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.startsWith(label)) {
      result = text.slice(label.length).replace(/^[:\s]+/, '').trim();
      return false;
    }
    return undefined;
  });
  return result;
}

function looksLikeStreetAddress(s: string): boolean {
  return /[A-ZĀČĒĢĪĶĻŅŠŪŽa-zāčēģīķļņšūž]+\s+\d+[A-Za-z]?/.test(s);
}

async function parseProjectPage(url: string): Promise<ProjectParseResult> {
  const result = await renderPage(url, { waitForSelector: '.project_page' });
  if (!result.ok) {
    return { project: null, url, errors: [fetchError(`render failed: ${result.message}`, url)] };
  }

  const $ = load(result.html);
  const name = $('h1').first().text().trim();
  if (!name) {
    return { project: null, url, errors: [parseError(`no h1 found at ${url}`, { url })] };
  }

  const headerText = $('.project-header').first().text().replace(/\s+/g, ' ').trim();
  const location = extractLocation(headerText, name);

  if (!isRigaLocation(location)) {
    // Estonian / Russian project, silently skip.
    return { project: null, url, errors: [] };
  }

  const address = looksLikeStreetAddress(name)
    ? `${name}, Rīga`
    : (() => {
        const cleaned = location
          .replace(/^R[īi]ga[,\s]+/i, '')
          .replace(/[,\s]+R[īi]ga.*$/i, '')
          .trim();
        return looksLikeStreetAddress(cleaned) ? `${cleaned}, Rīga` : `${name}, Rīga`;
      })();

  const projectId = buildProjectId(DEVELOPER, { address });
  const errors: ScrapeError[] = [];

  let geoLocation: Project['location'] = { lat: 56.95, lng: 24.1, source: 'manual' };
  const geo = await geocode({ developer: DEVELOPER, address });
  if (geo) {
    geoLocation = { lat: geo.lat, lng: geo.lng, source: geo.source };
  } else {
    errors.push({
      kind: 'geocode',
      message: `geocoder returned null for "${normalizeAddress(address)}"`,
      projectId,
    });
  }

  const completionStr = detailText($, 'Celtniecība pabeigta');
  const buildStage: Project['buildStage'] = completionStr ? 'ready' : 'pre-sales';
  const completion: Project['completion'] = completionStr
    ? (() => {
        const year = Number.parseInt(completionStr, 10);
        if (Number.isFinite(year)) {
          return { kind: 'ready', iso: `${year}-12-31` };
        }
        return { kind: 'unknown' };
      })()
    : { kind: 'unknown' };

  const districtMatch = location.match(/R[īi]ga,\s*([A-ZĀČĒĢĪĶĻŅŠŪŽ][a-zāčēģīķļņšūž]+)/);
  const district = districtMatch?.[1];

  const candidate: Project = {
    id: projectId,
    developer: DEVELOPER,
    name,
    address,
    city: 'Rīga',
    location: geoLocation,
    buildStage,
    completion,
    energyClass: 'unknown',
    energyClassSource: 'developer-claim',
    constructionType: 'unknown',
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
      validateError(`hepsor project failed schema at ${url}`, parsed.error.issues, {
        url,
        projectId,
      }),
    );
    return { project: null, url, errors };
  }

  return { project: parsed.data, url, errors };
}

export const hepsorScraper: Scraper = {
  developer: DEVELOPER,
  async fetchListings(): Promise<ScrapeOutput> {
    const startedAt = new Date().toISOString();
    const allErrors: ScrapeError[] = [];

    const { urls, errors: sitemapErrors } = await fetchProjectUrls();
    allErrors.push(...sitemapErrors);

    const projects: Project[] = [];
    try {
      for (const url of urls) {
        const { project, errors } = await parseProjectPage(url);
        allErrors.push(...errors);
        if (project) projects.push(project);
      }
    } finally {
      await shutdownBrowser();
      await flushCache();
    }

    const finishedAt = new Date().toISOString();
    const projectCount = projects.length;
    const apartmentCount = 0;

    let result: ScraperRunResult;
    if (sitemapErrors.length > 0 || (urls.length > 0 && projects.length === 0)) {
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
