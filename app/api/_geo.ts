// UK postcode → coordinates (postcodes.io, free, no key) and distance helpers.

export type LatLng = { lat: number; lng: number };

const POSTCODES_API = "https://api.postcodes.io/postcodes";

// How close (metres) a worker must be to the shift site to clock in. GPS accuracy is
// allowed for, up to MAX_ACCURACY_ALLOWANCE_M, so a fuzzy indoor fix isn't unfairly rejected.
export const CLOCKIN_RADIUS_M = Number(process.env.CLOCKIN_RADIUS_M) || 200;
const MAX_ACCURACY_ALLOWANCE_M = 100;

const normalizePostcode = (pc: string) => pc.replace(/\s+/g, "").toUpperCase();

// Looks up one postcode.
//   LatLng     → found
//   null       → postcodes.io says the postcode doesn't exist
//   undefined  → lookup failed (network etc.); caller should not treat the postcode as invalid
export async function geocodePostcode(postcode: string): Promise<LatLng | null | undefined> {
  try {
    const res = await fetch(`${POSTCODES_API}/${encodeURIComponent(normalizePostcode(postcode))}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404) return null;
    if (!res.ok) return undefined;
    const { result } = await res.json();
    return result?.latitude != null ? { lat: result.latitude, lng: result.longitude } : null;
  } catch {
    return undefined;
  }
}

// Bulk lookup (postcodes.io allows 100 per request). Unknown or failed postcodes are left out.
export async function geocodePostcodes(postcodes: string[]): Promise<Map<string, LatLng>> {
  const out = new Map<string, LatLng>();
  const unique = [...new Set(postcodes.filter(Boolean).map(normalizePostcode))];
  for (let i = 0; i < unique.length; i += 100) {
    try {
      const res = await fetch(POSTCODES_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postcodes: unique.slice(i, i + 100) }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const { result } = await res.json();
      for (const r of result ?? []) {
        if (r?.result?.latitude != null) out.set(normalizePostcode(r.query), { lat: r.result.latitude, lng: r.result.longitude });
      }
    } catch {
      // leave these out; they'll be retried on a later request
    }
  }
  return out;
}

export const postcodeKey = normalizePostcode;

// Great-circle distance in metres.
export function distanceMeters(a: LatLng, b: LatLng) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Reads { lat, lng, accuracy } from a request body, or null if missing / malformed.
export function parseLocation(body: any): (LatLng & { accuracy: number }) | null {
  const loc = body?.location;
  if (!loc) return null;
  const lat = Number(loc.lat), lng = Number(loc.lng), accuracy = Number(loc.accuracy ?? 0);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : 0 };
}

// True when the worker counts as "at the site", allowing for reported GPS accuracy.
export function withinSite(distanceM: number, accuracyM: number) {
  return distanceM - Math.min(accuracyM, MAX_ACCURACY_ALLOWANCE_M) <= CLOCKIN_RADIUS_M;
}

export function describeDistance(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1609.344).toFixed(1)} miles`;
}
