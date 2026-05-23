// Filter predicates over the full apartment list. Isomorphic.

import type { Apartment, Project } from './schema';
import type { Filters } from './url-state/filters';

const ROOM_BUCKETS = (rooms: number) => (rooms >= 5 ? 5 : rooms);

export function filterApartments(
  apartments: readonly Apartment[],
  projectsById: ReadonlyMap<string, Project>,
  filters: Filters,
): Apartment[] {
  return apartments.filter((apt) => {
    // Hard exclude: sold apartments never appear in the map.
    if (apt.availability === 'sold') return false;
    if (!filters.includeReserved && apt.availability === 'reserved') return false;

    if (filters.rooms.length > 0 && !filters.rooms.includes(ROOM_BUCKETS(apt.rooms))) return false;

    if (filters.areaMin !== null && apt.area < filters.areaMin) return false;
    if (filters.areaMax !== null && apt.area > filters.areaMax) return false;

    if (filters.priceMin !== null) {
      if (apt.price.kind !== 'amount' || apt.price.eur < filters.priceMin) return false;
    }
    if (filters.priceMax !== null) {
      if (apt.price.kind !== 'amount' || apt.price.eur > filters.priceMax) return false;
    }

    if (filters.pricePerSqmMin !== null) {
      if (apt.pricePerSqm.kind !== 'amount' || apt.pricePerSqm.eur < filters.pricePerSqmMin) {
        return false;
      }
    }
    if (filters.pricePerSqmMax !== null) {
      if (apt.pricePerSqm.kind !== 'amount' || apt.pricePerSqm.eur > filters.pricePerSqmMax) {
        return false;
      }
    }

    if (filters.floorMin !== null && apt.floor < filters.floorMin) return false;
    if (filters.floorMax !== null && apt.floor > filters.floorMax) return false;

    // build-stage filter is project-level, not apartment-level.
    if (filters.buildStage.length > 0) {
      const project = projectsById.get(apt.projectId);
      if (!project || !filters.buildStage.includes(project.buildStage)) return false;
    }

    return true;
  });
}

export function filtersAreDefault(filters: Filters): boolean {
  return (
    filters.rooms.length === 0 &&
    filters.areaMin === null &&
    filters.areaMax === null &&
    filters.priceMin === null &&
    filters.priceMax === null &&
    filters.pricePerSqmMin === null &&
    filters.pricePerSqmMax === null &&
    filters.floorMin === null &&
    filters.floorMax === null &&
    filters.buildStage.length === 0 &&
    filters.includeReserved === true
  );
}

export const FILTER_DEFAULTS: Filters = {
  rooms: [],
  areaMin: null,
  areaMax: null,
  priceMin: null,
  priceMax: null,
  pricePerSqmMin: null,
  pricePerSqmMax: null,
  floorMin: null,
  floorMax: null,
  buildStage: [],
  includeReserved: true,
  p: null,
};
