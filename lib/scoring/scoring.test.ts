import { describe, expect, it } from 'vitest';
import type { Apartment, Project } from '../schema';
import {
  CRITERIA,
  DEFAULT_WEIGHTS,
  type ScoringContext,
  type Weights,
  normalizeWeights,
  toNormalized,
} from './registry';
import { scoreApartment, scoreProject } from './score';

describe('toNormalized brand', () => {
  it('accepts values in [0, 1]', () => {
    expect(toNormalized(0)).toBe(0);
    expect(toNormalized(0.5)).toBe(0.5);
    expect(toNormalized(1)).toBe(1);
  });

  it('throws on values outside [0, 1]', () => {
    expect(() => toNormalized(-0.01)).toThrow();
    expect(() => toNormalized(1.01)).toThrow();
    expect(() => toNormalized(Number.NaN)).toThrow();
    expect(() => toNormalized(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('normalizeWeights', () => {
  it('sums DEFAULT_WEIGHTS to exactly 1', () => {
    const sum = Object.values(DEFAULT_WEIGHTS).reduce((acc, v) => acc + v, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('fills missing keys with defaults then renormalizes', () => {
    const partial = { priceTotal: 0.5 } as Partial<Weights>;
    const out = normalizeWeights(partial);
    const sum = Object.values(out).reduce((acc, v) => acc + v, 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(Object.keys(out).length).toBe(CRITERIA.length);
  });

  it('falls back to even distribution when all weights are zero', () => {
    const zeros = Object.fromEntries(CRITERIA.map((c) => [c.key, 0])) as Weights;
    const out = normalizeWeights(zeros);
    const even = 1 / CRITERIA.length;
    for (const v of Object.values(out)) expect(v).toBeCloseTo(even, 10);
  });
});

describe('scoreApartment', () => {
  const project: Project = {
    id: 'yit--test1234567890ab' as Project['id'],
    developer: 'yit',
    name: 'Test',
    address: 'Test Street 1, Rīga',
    city: 'Rīga',
    location: { lat: 56.95, lng: 24.05, source: 'manual' },
    buildStage: 'under-construction',
    completion: { kind: 'quarter', year: 2027, quarter: 3 },
    energyClass: 'A',
    energyClassSource: 'developer-claim',
    constructionType: 'concrete-monolith',
    parkingPrice: { kind: 'amount', eur: 15000, vatIncluded: true },
    storagePrice: { kind: 'unknown' },
    parkingSpotsTotal: 30,
    sourceUrl: 'https://yit.lv/test',
    apartments: [],
    scrapedAt: '2026-05-20T02:00:00.000Z',
  };

  const apt: Apartment = {
    id: 'yit--test1234567890ab:apt1' as Apartment['id'],
    projectId: project.id,
    rooms: 3,
    area: 72,
    bathrooms: 2,
    floor: 4,
    hasBalcony: true,
    terraceArea: 8,
    price: { kind: 'amount', eur: 200000, vatIncluded: true },
    pricePerSqm: { kind: 'amount', eur: 2778, vatIncluded: true },
    availability: 'available',
    deepLinkUrl: 'https://yit.lv/test/apt1',
  };

  const ctx: ScoringContext = {
    priceRange: { min: 150000, max: 300000 },
    pricePerSqmRange: { min: 2000, max: 4000 },
    distances: new Map([
      [apt.id, { rigaCenter: 5, nearestSchool: 0.4, nearestGrocery: 0.2 }],
    ]),
    preferredConstructionTypes: new Set(['concrete-monolith']),
  };

  it('produces a score in [0, 1]', () => {
    const { total } = scoreApartment(apt, project, ctx, DEFAULT_WEIGHTS);
    expect(total).toBeGreaterThanOrEqual(0);
    expect(total).toBeLessThanOrEqual(1);
  });

  it('handles unknown price gracefully (neutral 0.5 contribution)', () => {
    const unknownPriceApt: Apartment = {
      ...apt,
      price: { kind: 'unknown' },
      pricePerSqm: { kind: 'unknown' },
    };
    const { total } = scoreApartment(unknownPriceApt, project, ctx, DEFAULT_WEIGHTS);
    expect(total).toBeGreaterThanOrEqual(0);
    expect(total).toBeLessThanOrEqual(1);
  });

  it('returns one contribution per criterion in CRITERIA order', () => {
    const { contributions } = scoreApartment(apt, project, ctx, DEFAULT_WEIGHTS);
    expect(contributions.length).toBe(CRITERIA.length);
    contributions.forEach((c, idx) => {
      expect(c.key).toBe(CRITERIA[idx]?.key);
    });
  });
});

describe('scoreProject', () => {
  const project: Project = {
    id: 'yit--p1' as Project['id'],
    developer: 'yit',
    name: 'P1',
    address: 'A',
    city: 'Rīga',
    location: { lat: 56.95, lng: 24.05, source: 'manual' },
    buildStage: 'ready',
    completion: { kind: 'ready', iso: '2026-04-01' },
    energyClass: 'B',
    energyClassSource: 'developer-claim',
    constructionType: 'panel',
    parkingPrice: { kind: 'unknown' },
    storagePrice: { kind: 'unknown' },
    sourceUrl: 'https://yit.lv/p1',
    apartments: [],
    scrapedAt: '2026-05-20T02:00:00.000Z',
  };

  const mkApt = (id: string, floor: number): Apartment => ({
    id: id as Apartment['id'],
    projectId: project.id,
    rooms: 3,
    area: 70,
    floor,
    price: { kind: 'amount', eur: 200000, vatIncluded: true },
    pricePerSqm: { kind: 'amount', eur: 2857, vatIncluded: true },
    availability: 'available',
    deepLinkUrl: `https://yit.lv/p1/${id}`,
  });

  const ctx: ScoringContext = {
    priceRange: { min: 150000, max: 300000 },
    pricePerSqmRange: { min: 2000, max: 4000 },
    distances: new Map(),
    preferredConstructionTypes: new Set(),
  };

  it('returns null when matching apartment list is empty', () => {
    const result = scoreProject(project, [], ctx, DEFAULT_WEIGHTS);
    expect(result).toBeNull();
  });

  it('picks the highest-scoring apartment as project rank', () => {
    const apts = [mkApt('a1', 10), mkApt('a2', 4), mkApt('a3', 1)];
    const result = scoreProject(project, apts, ctx, DEFAULT_WEIGHTS);
    expect(result).not.toBeNull();
    expect(result?.bestApartmentId).toBe('a2'); // floor 4 has highest bell-curve score
  });
});
