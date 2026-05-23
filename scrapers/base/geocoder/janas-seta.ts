// Jāņa sēta geocoder — Latvian-native, best coverage for new construction.
// Currently a stub: returns null when no API key is configured.
//
// To activate: set JANAS_SETA_API_KEY in env (locally via .env.local; in CI via
// GitHub Actions secrets). See https://developers.kartes.lv/en/geocoding/ for
// the live API surface to implement here.

export interface GeocodeHit {
  lat: number;
  lng: number;
}

export async function geocodeJanasSeta(_address: string): Promise<GeocodeHit | null> {
  const key = process.env.JANAS_SETA_API_KEY;
  if (!key) return null;
  // TODO(phase-3+): Implement against developers.kartes.lv geocoding endpoint.
  // Fallback chain will skip to Nominatim until this returns a non-null result.
  return null;
}
