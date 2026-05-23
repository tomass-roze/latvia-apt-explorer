// Geographic utilities. Isomorphic.

/** Riga old-town center — used as the reference for `distanceToRigaCenter` scoring. */
export const RIGA_CENTER = { lat: 56.9496, lng: 24.1052 } as const;

/** Latvia bounding box [west, south, east, north] for MapLibre initial view. */
export const LATVIA_BBOX = [20.97, 55.67, 28.24, 58.09] as const;

/** Approximate Latvia center — used as MapLibre initial center. */
export const LATVIA_CENTER = { lat: 56.88, lng: 24.6 } as const;

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance between two lat/lng points in kilometers. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}
