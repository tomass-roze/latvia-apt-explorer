// Compute a 0..1 score for an apartment given context + weights.
// Isomorphic — runs at build time and in the browser.

import type { Apartment, Project } from '../schema';
import { CRITERIA, type CriterionKey, type ScoringContext, type Weights } from './registry';

/** Per-criterion contribution = normalize(apt) × weight[key]. */
export interface ScoreBreakdown {
  readonly total: number;
  readonly contributions: ReadonlyArray<{
    readonly key: CriterionKey;
    readonly normalized: number;
    readonly weight: number;
    readonly contribution: number;
  }>;
}

export function scoreApartment(
  apt: Apartment,
  project: Project,
  ctx: ScoringContext,
  weights: Weights,
): ScoreBreakdown {
  const contributions = CRITERIA.map((c) => {
    const normalized = c.normalize(apt, project, ctx);
    const weight = weights[c.key as CriterionKey];
    return {
      key: c.key as CriterionKey,
      normalized: normalized as number,
      weight,
      contribution: (normalized as number) * weight,
    };
  });
  const total = contributions.reduce((acc, c) => acc + c.contribution, 0);
  return { total, contributions };
}

/** Project rank = best apartment score within the current filter set. */
export function scoreProject(
  project: Project,
  matchingApartments: readonly Apartment[],
  ctx: ScoringContext,
  weights: Weights,
): { best: ScoreBreakdown; bestApartmentId: string } | null {
  if (matchingApartments.length === 0) return null;
  let best: ScoreBreakdown | null = null;
  let bestId = '';
  for (const apt of matchingApartments) {
    const breakdown = scoreApartment(apt, project, ctx, weights);
    if (best === null || breakdown.total > best.total) {
      best = breakdown;
      bestId = apt.id;
    }
  }
  // best is non-null because matchingApartments is non-empty.
  return best ? { best, bestApartmentId: bestId } : null;
}
