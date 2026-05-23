// Pillar Latvia scraper.
//
// Pillar's per-project pages return soft 404s, so we extract everything from
// the listing page (/lv/meklet-ipasumu) which is rendered server-side and
// contains both the navigation menu (with name + address per project) and
// project cards (with badge → build stage, energy class, price range). No
// per-apartment data — Pillar publishes ranges only at the public level.

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
import { flushCache, geocodeWithFallback } from '../base/geocoder';
import type { Scraper, ScrapeOutput } from '../base/interface';

const DEVELOPER = 'pillar' as const;
const LISTING_URL = 'https://pillar.lv/lv/meklet-ipasumu';

interface NavEntry {
  slug: string;
  name: string;
  address: string;
}

interface CardSignal {
  slug: string;
  buildStage: Project['buildStage'];
  energyClass: Project['energyClass'];
}

// Map the Latvian badge text to our BuildStage enum.
function badgeToStage(text: string): Project['buildStage'] {
  const t = text.toLowerCase();
  if (t.includes('nodots') || t.includes('ekspluatācij')) return 'ready';
  if (t.includes('drīzumā')) return 'nearly-complete';
  if (t.includes('būvniec')) return 'under-construction';
  return 'pre-sales';
}

function parseEnergyClass(text: string): Project['energyClass'] {
  const m = text.match(/\b(A\+{1,2}|A|B|C|D|E|F)\b/);
  if (m?.[1]) return m[1].toUpperCase() as Project['energyClass'];
  return 'unknown';
}

// Two passes over the same listing page:
//   1. Walk every <a href="/lv/jaunie-projekti/<slug>/par-projektu"> and pull
//      the project name + address from the nav-subtitle. Dedupe by slug.
//   2. Walk every projectbadge + its surrounding card, find the closest
//      preceding /lv/jaunie-projekti/<slug>/par-projektu href, attach the
//      badge's build stage + the card's energy class.
function parseListing(html: string): { entries: NavEntry[]; signals: Map<string, CardSignal> } {
  const $ = load(html);
  const entryBySlug = new Map<string, NavEntry>();

  $('a[href*="/lv/jaunie-projekti/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const slugMatch = href.match(/\/lv\/jaunie-projekti\/([a-z0-9-]+)/);
    if (!slugMatch?.[1]) return;
    const slug = slugMatch[1];

    const name = $(el).find('> div').first().contents().filter((_, n) => n.type === 'text').text().trim();
    const address = $(el).find('.uk-nav-subtitle').text().trim();
    if (!name) return;
    if (!entryBySlug.has(slug) || (!entryBySlug.get(slug)?.address && address)) {
      entryBySlug.set(slug, { slug, name, address });
    }
  });

  const signals = new Map<string, CardSignal>();
  // Each card looks like <span class="projectbadge ready">Nodots ekspluatācijā</span>
  // — we walk badges in document order and look back for the most recent
  // jaunie-projekti link, which identifies the project the card belongs to.
  const badgeRegex = /projectbadge\s+\w+">([^<]+)<\/span>/g;
  const energyRegex = /Energoefektivit[āa]te:.{0,400}?el-meta">\s*([^<]+)\s*</s;
  const slugAtPosRegex = /\/lv\/jaunie-projekti\/([a-z0-9-]+)/g;

  // Build an ordered list of (position, slug) so we can find the slug nearest to each badge.
  const slugPositions: { pos: number; slug: string }[] = [];
  for (const m of html.matchAll(slugAtPosRegex)) {
    if (m.index !== undefined && m[1]) slugPositions.push({ pos: m.index, slug: m[1] });
  }

  for (const m of html.matchAll(badgeRegex)) {
    if (m.index === undefined) continue;
    const stage = badgeToStage(m[1] ?? '');
    // Find the slug whose position is the largest one still <= badge position.
    let slug: string | null = null;
    for (const sp of slugPositions) {
      if (sp.pos <= m.index) slug = sp.slug;
      else break;
    }
    if (!slug) continue;
    // Energy class in the same card (look forward a bit from the badge).
    const cardSlice = html.slice(m.index, m.index + 4000);
    const energyMatch = cardSlice.match(energyRegex);
    const energy = energyMatch?.[1] ? parseEnergyClass(energyMatch[1]) : 'unknown';
    // Prefer the most ready stage (ready > nearly-complete > under-construction > pre-sales).
    const ORDER: Project['buildStage'][] = ['pre-sales', 'under-construction', 'nearly-complete', 'ready'];
    const existing = signals.get(slug);
    if (!existing || ORDER.indexOf(stage) > ORDER.indexOf(existing.buildStage)) {
      signals.set(slug, { slug, buildStage: stage, energyClass: energy });
    } else if (existing.energyClass === 'unknown' && energy !== 'unknown') {
      signals.set(slug, { ...existing, energyClass: energy });
    }
  }

  return { entries: [...entryBySlug.values()], signals };
}

export const pillarScraper: Scraper = {
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

    const { entries, signals } = parseListing(res.body);

    const projects: Project[] = [];
    for (const entry of entries) {
      if (!entry.address) {
        // Best-effort: try to surface name as address ("Mežciema mājas, Rīga")
        // and let the geocoder fail gracefully.
        allErrors.push(parseError(`no address for ${entry.slug}`, { url: LISTING_URL }));
      }
      const addressForGeocoding = entry.address ? `${entry.address}, Rīga` : `${entry.name}, Rīga`;
      const projectId = buildProjectId(DEVELOPER, { address: addressForGeocoding });

      let location: Project['location'] = { lat: 56.95, lng: 24.1, source: 'manual' };
      const geo = await geocodeWithFallback({
        developer: DEVELOPER,
        variants: [
          { address: addressForGeocoding, tier: 'street' },
          { address: 'Rīga', tier: 'city' },
        ],
      });
      if (geo) {
        location = { lat: geo.lat, lng: geo.lng, source: geo.source };
      } else {
        allErrors.push({
          kind: 'geocode',
          message: `geocoder returned null for "${normalizeAddress(addressForGeocoding)}"`,
          projectId,
        });
      }

      const signal = signals.get(entry.slug);
      const candidate: Project = {
        id: projectId,
        developer: DEVELOPER,
        name: entry.name,
        address: addressForGeocoding,
        city: 'Rīga',
        location,
        buildStage: signal?.buildStage ?? 'pre-sales',
        completion: { kind: 'unknown' },
        energyClass: signal?.energyClass ?? 'unknown',
        energyClassSource: 'developer-claim',
        constructionType: 'unknown',
        parkingPrice: { kind: 'unknown' },
        storagePrice: { kind: 'unknown' },
        sourceUrl: `https://pillar.lv/lv/jaunie-projekti/${entry.slug}/par-projektu`,
        apartments: [],
        scrapedAt: new Date().toISOString(),
      };

      const parsed = ProjectSchema.safeParse(candidate);
      if (!parsed.success) {
        allErrors.push(
          validateError(`pillar project failed schema`, parsed.error.issues, {
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
    const apartmentCount = projects.reduce((sum, p) => sum + p.apartments.length, 0);

    let result: ScraperRunResult;
    if (projects.length === 0 && entries.length > 0) {
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
