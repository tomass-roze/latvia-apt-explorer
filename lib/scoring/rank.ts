// Project ranking helpers. Isomorphic.
//
// Given filtered apartments + a scoring context + weights, produces:
//   - per-project best-score breakdown (= the highest-scoring apartment that matched filters)
//   - 0..100 percentile rank for use in pin gradients and "#N of M" labels
// Memoize at the call site.

import type { Apartment, Project } from '../schema';
import type { ScoringContext, Weights } from './registry';
import { type ScoreBreakdown, scoreApartment } from './score';

export interface RankedProject {
  projectId: string;
  best: ScoreBreakdown;
  bestApartmentId: string;
  matchingApartmentCount: number;
}

export interface RankedProjectWithPercentile extends RankedProject {
  /** 0..1, where 1 is the top-scoring project among all ranked. */
  percentile: number;
  /** 1-indexed rank, 1 is best. */
  rank: number;
}

export function rankProjects(
  projectsById: ReadonlyMap<string, Project>,
  filteredApartmentsByProjectId: ReadonlyMap<string, readonly Apartment[]>,
  ctx: ScoringContext,
  weights: Weights,
): RankedProjectWithPercentile[] {
  const ranked: RankedProject[] = [];
  for (const [projectId, apartments] of filteredApartmentsByProjectId) {
    const project = projectsById.get(projectId);
    if (!project || apartments.length === 0) continue;
    let best: ScoreBreakdown | null = null;
    let bestId = '';
    for (const apt of apartments) {
      const sb = scoreApartment(apt, project, ctx, weights);
      if (best === null || sb.total > best.total) {
        best = sb;
        bestId = apt.id;
      }
    }
    if (best) {
      ranked.push({
        projectId,
        best,
        bestApartmentId: bestId,
        matchingApartmentCount: apartments.length,
      });
    }
  }

  ranked.sort((a, b) => b.best.total - a.best.total);

  const total = ranked.length;
  return ranked.map((r, idx) => ({
    ...r,
    rank: idx + 1,
    percentile: total > 1 ? 1 - idx / (total - 1) : 1,
  }));
}

/**
 * Group filtered apartments by their projectId. Returns a Map for fast lookup.
 */
export function groupByProjectId(
  filteredApartments: readonly Apartment[],
): Map<string, Apartment[]> {
  const map = new Map<string, Apartment[]>();
  for (const apt of filteredApartments) {
    const list = map.get(apt.projectId) ?? [];
    list.push(apt);
    map.set(apt.projectId, list);
  }
  return map;
}
