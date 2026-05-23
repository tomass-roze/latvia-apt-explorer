import { describe, expect, it } from 'vitest';
import {
  ApartmentSchema,
  ImageUrlSchema,
  PriceSchema,
  ProjectSchema,
  SafeUrlSchema,
  ScraperRunResultSchema,
  normalizeAddress,
} from './schema';

describe('SafeUrlSchema', () => {
  it('accepts http/https', () => {
    expect(SafeUrlSchema.safeParse('https://bonava.lv/project').success).toBe(true);
    expect(SafeUrlSchema.safeParse('http://example.com').success).toBe(true);
  });

  it('rejects javascript:', () => {
    expect(SafeUrlSchema.safeParse('javascript:alert(1)').success).toBe(false);
  });

  it('rejects data:', () => {
    expect(SafeUrlSchema.safeParse('data:text/html,<script>alert(1)</script>').success).toBe(false);
  });

  it('rejects file:', () => {
    expect(SafeUrlSchema.safeParse('file:///etc/passwd').success).toBe(false);
  });
});

describe('ImageUrlSchema', () => {
  it('accepts standard image extensions', () => {
    expect(ImageUrlSchema.safeParse('https://cdn.bonava.lv/plan.jpg').success).toBe(true);
    expect(ImageUrlSchema.safeParse('https://cdn.bonava.lv/plan.png?v=2').success).toBe(true);
    expect(ImageUrlSchema.safeParse('https://cdn.bonava.lv/plan.webp#hash').success).toBe(true);
  });

  it('rejects SVG (script payload vector)', () => {
    expect(ImageUrlSchema.safeParse('https://evil.example/plan.svg').success).toBe(false);
  });

  it('rejects extensionless URLs', () => {
    expect(ImageUrlSchema.safeParse('https://cdn.bonava.lv/plan').success).toBe(false);
  });
});

describe('PriceSchema (3-state discriminated union)', () => {
  it('accepts amount with vatIncluded', () => {
    const r = PriceSchema.safeParse({ kind: 'amount', eur: 250000, vatIncluded: true });
    expect(r.success).toBe(true);
  });

  it('rejects amount without vatIncluded (it is required)', () => {
    const r = PriceSchema.safeParse({ kind: 'amount', eur: 250000 });
    expect(r.success).toBe(false);
  });

  it('accepts on-request', () => {
    expect(PriceSchema.safeParse({ kind: 'on-request' }).success).toBe(true);
  });

  it('accepts unknown', () => {
    expect(PriceSchema.safeParse({ kind: 'unknown' }).success).toBe(true);
  });

  it('rejects unrecognized kind', () => {
    expect(PriceSchema.safeParse({ kind: 'free', eur: 0 }).success).toBe(false);
  });
});

describe('ScraperRunResultSchema (discriminated by status)', () => {
  it('accepts ok without errors', () => {
    const r = ScraperRunResultSchema.safeParse({
      status: 'ok',
      developer: 'yit',
      startedAt: '2026-05-20T02:00:00.000Z',
      finishedAt: '2026-05-20T02:03:12.000Z',
      projectCount: 14,
      apartmentCount: 412,
    });
    expect(r.success).toBe(true);
  });

  it('rejects partial without errors[]', () => {
    const r = ScraperRunResultSchema.safeParse({
      status: 'partial',
      developer: 'yit',
      startedAt: '2026-05-20T02:00:00.000Z',
      finishedAt: '2026-05-20T02:03:12.000Z',
      projectCount: 14,
      apartmentCount: 412,
      errors: [],
      lastSuccessAt: '2026-05-19T02:00:00.000Z',
    });
    expect(r.success).toBe(false);
  });

  it('accepts failed with errors[] and lastSuccessAt', () => {
    const r = ScraperRunResultSchema.safeParse({
      status: 'failed',
      developer: 'yit',
      startedAt: '2026-05-20T02:00:00.000Z',
      finishedAt: '2026-05-20T02:00:30.000Z',
      errors: [{ kind: 'fetch', message: 'timeout' }],
      lastSuccessAt: '2026-05-19T02:00:00.000Z',
    });
    expect(r.success).toBe(true);
  });
});

describe('Apartment + Project round-trip', () => {
  const validProject = {
    id: 'yit--abc123def4567890',
    developer: 'yit' as const,
    name: 'Mežciema mājas',
    address: 'Imantas 1. līnija 5, Rīga',
    city: 'Rīga' as const,
    location: { lat: 56.95, lng: 24.05, source: 'janas-seta' as const },
    buildStage: 'under-construction' as const,
    completion: { kind: 'quarter' as const, year: 2027, quarter: 3 as const },
    energyClass: 'A' as const,
    energyClassSource: 'developer-claim' as const,
    constructionType: 'concrete-monolith' as const,
    parkingPrice: { kind: 'amount' as const, eur: 18000, vatIncluded: true },
    storagePrice: { kind: 'unknown' as const },
    sourceUrl: 'https://yit.lv/projekti/mezciema-majas',
    apartments: [
      {
        id: 'yit--abc123def4567890:apt-201',
        projectId: 'yit--abc123def4567890',
        rooms: 3,
        area: 72.4,
        floor: 4,
        price: { kind: 'amount' as const, eur: 185000, vatIncluded: true },
        pricePerSqm: { kind: 'amount' as const, eur: 2555, vatIncluded: true },
        availability: 'available' as const,
        deepLinkUrl: 'https://yit.lv/projekti/mezciema-majas/apt-201',
      },
    ],
    scrapedAt: '2026-05-20T02:03:12.000Z',
  };

  it('parses a valid project', () => {
    const r = ProjectSchema.safeParse(validProject);
    expect(r.success).toBe(true);
  });

  it('rejects a project with non-Latvia city', () => {
    const r = ProjectSchema.safeParse({ ...validProject, city: 'Vilnius' });
    expect(r.success).toBe(false);
  });

  it('rejects an apartment with non-http floor plan URL', () => {
    const bad = {
      ...validProject.apartments[0],
      floorPlanUrl: 'javascript:alert(1)',
    };
    expect(ApartmentSchema.safeParse(bad).success).toBe(false);
  });
});

describe('normalizeAddress', () => {
  it('lowercases and trims', () => {
    expect(normalizeAddress('  Imantas 1. līnija 5, Rīga  ')).toBe('imantas 1. līnija 5, rīga');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeAddress('Imantas   1.   līnija')).toBe('imantas 1. līnija');
  });

  it('preserves Latvian diacritics', () => {
    const out = normalizeAddress('Ķengaraga iela, Rīga');
    expect(out).toContain('ķengaraga');
    expect(out).toContain('rīga');
  });
});
