// Builds a ScoringContext for a given filter snapshot. Isomorphic.
//
// Inputs: filtered apartments + their parent projects + user preferences.
// Outputs: min-max ranges for price/m², haversine distances per apartment,
// plus the preferred construction-type set.
//
// School/grocery distances are NEUTRAL today — Phase 5 will bake POI overlays
// from OSM Overpass and fill these in. NEUTRAL is what `cappedDecay(Infinity,...)`
// gives us; we just leave the keys undefined and the registry handles it.

import type { Apartment, Project } from '../schema';
import { RIGA_CENTER, haversineKm } from '../geo';
import type { DistanceSet, ScoringContext } from './registry';

export interface ContextInput {
  filteredApartments: readonly Apartment[];
  projectsById: ReadonlyMap<string, Project>;
  preferredConstructionTypes?: ReadonlySet<string>;
}

export function buildScoringContext({
  filteredApartments,
  projectsById,
  preferredConstructionTypes,
}: ContextInput): ScoringContext {
  const prices: number[] = [];
  const pricesPerSqm: number[] = [];
  const distances = new Map<string, DistanceSet>();

  for (const apt of filteredApartments) {
    if (apt.price.kind === 'amount') prices.push(apt.price.eur);
    if (apt.pricePerSqm.kind === 'amount') pricesPerSqm.push(apt.pricePerSqm.eur);
    const project = projectsById.get(apt.projectId);
    if (project) {
      distances.set(apt.id, {
        rigaCenter: haversineKm(project.location, RIGA_CENTER),
        // School/grocery distances unknown until Phase 5 overlays land. Use
        // 0.4/0.2 (cap thresholds for halfLifeKm=0.5/0.3 respectively) so the
        // exp() decay yields ~0.45 each — close to neutral without exploding.
        nearestSchool: 0.4,
        nearestGrocery: 0.2,
      });
    }
  }

  return {
    priceRange: prices.length > 0 ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
    pricePerSqmRange:
      pricesPerSqm.length > 0
        ? { min: Math.min(...pricesPerSqm), max: Math.max(...pricesPerSqm) }
        : null,
    distances,
    preferredConstructionTypes: preferredConstructionTypes ?? new Set<string>(),
  };
}
