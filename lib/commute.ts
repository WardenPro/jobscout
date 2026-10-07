import "server-only";
import { getDb } from "@/lib/db";
import { normalizePlace, normalizeCity } from "@/lib/swiss-geography";

export type CommuteEstimate = { minutes: number; distanceKm: number; calculatedAt: string };
type Coordinates = [number, number];
const ROUTE_TTL = 7 * 24 * 60 * 60 * 1000;
const GEO_TTL = 30 * 24 * 60 * 60 * 1000;
const FAILURE_TTL = 60 * 60 * 1000;

/** Plusieurs villes, un canton seul ou une localisation distante ne donnent pas un trajet fiable. */
export function commuteCity(location: string | null | undefined): string | null {
  const parts = (location ?? "").split(",").map(part => part.trim());
  if (parts.slice(1).some(part => !/^(?:CH|Suisse|Switzerland|Schweiz|[A-Z]{2}|\d{4})$/i.test(part))) return null;
  const city = parts[0].replace(/\s*(?:\([A-Z]{2}\)|[A-Z]{2})\s*$/, "").trim();
  if (!city || city.includes("/") || /\b(?:remote|teletravail|suisse|switzerland|toute|divers|et|ou)\b/.test(normalizePlace(city))) return null;
  return city;
}

function recent(updated: string, ttl: number): boolean {
  const elapsed = Date.now() - Date.parse(updated);
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed < ttl;
}

export function cachedCommute(origin: string, location: string | null | undefined): CommuteEstimate | null {
  const city = commuteCity(location);
  if (!city) return null;
  const row = getDb().prepare("SELECT minutes, distance_km, updated_at FROM commute_routes WHERE origin_key = ? AND destination_key = ?")
    .get(normalizePlace(origin), normalizePlace(city)) as { minutes: number; distance_km: number; updated_at: string } | undefined;
  return row && recent(row.updated_at, ROUTE_TTL)
    ? { minutes: row.minutes, distanceKm: row.distance_km, calculatedAt: row.updated_at } : null;
}

async function requestJson(url: URL): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "JobScout/3.4.14 (user-requested commute estimate)" }, signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error(`Service de trajet indisponible (HTTP ${response.status})`);
  return response.json();
}

/** Photon/OpenStreetMap : on exige un lieu habité dans le pays attendu et un nom concordant. */
async function geocode(place: string, country: "FR" | "CH"): Promise<Coordinates> {
  const key = `${country}:${normalizePlace(place)}`;
  const row = getDb().prepare("SELECT longitude, latitude, updated_at FROM commute_geocodes WHERE place_key = ?").get(key) as
    { longitude: number; latitude: number; updated_at: string } | undefined;
  if (row && recent(row.updated_at, GEO_TTL)) return [row.longitude, row.latitude];
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", `${place} ${country === "FR" ? "France" : "Suisse"}`);
  url.searchParams.set("lang", "fr");
  url.searchParams.set("limit", "5");
  const data = await requestJson(url) as { features?: { properties?: Record<string, unknown>; geometry?: { coordinates?: unknown } }[] } | null;
  const postcode = /\b\d{4,5}\b/.exec(place)?.[0];
  const name = normalizeCity(place.replace(/\b\d{4,5}\b/g, "").replace(/,\s*(?:France|Suisse)$/i, ""));
  const candidates = (Array.isArray(data?.features) ? data.features : []).filter(feature => {
    const props = feature?.properties;
    const coordinates = feature?.geometry?.coordinates;
    return props && typeof props.name === "string" && normalizeCity(props.name) === name &&
      typeof props.countrycode === "string" && props.countrycode.toUpperCase() === country &&
      ["city", "town", "village", "municipality", "hamlet"].includes(String(props.osm_value)) &&
      (!postcode || String(props.postcode) === postcode) && Array.isArray(coordinates) && coordinates.length === 2 &&
      coordinates.every(n => typeof n === "number" && Number.isFinite(n)) && Math.abs(coordinates[0]) <= 180 && Math.abs(coordinates[1]) <= 90;
  });
  const points = new Map(candidates.map(feature => {
    const point = feature.geometry!.coordinates as Coordinates;
    return [point.join(","), point];
  }));
  if (points.size !== 1) throw new Error(`Lieu introuvable ou ambigu : ${place}. Précisez la commune et son code postal.`);
  const point = [...points.values()][0];
  getDb().prepare("INSERT INTO commute_geocodes (place_key, longitude, latitude, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(place_key) DO UPDATE SET longitude = excluded.longitude, latitude = excluded.latitude, updated_at = excluded.updated_at")
    .run(key, ...point, new Date().toISOString());
  return point;
}

/** Calcul routier OSRM en voiture, sans trafic ; aucun calcul n'est lancé pendant une recherche. */
export async function calculateCommutes(origin: string, locations: string[]): Promise<{ calculated: number; remaining: number; unknown: { city: string; reason: string }[] }> {
  const cities = [...new Set(locations.map(commuteCity).filter((city): city is string => !!city))];
  const unknown: { city: string; reason: string }[] = [];
  const pending = cities.filter(city => {
    if (cachedCommute(origin, city)) return false;
    const failure = getDb().prepare("SELECT reason, updated_at FROM commute_failures WHERE origin_key = ? AND destination_key = ?")
      .get(normalizePlace(origin), normalizePlace(city)) as { reason: string; updated_at: string } | undefined;
    if (failure && recent(failure.updated_at, FAILURE_TTL)) {
      unknown.push({ city, reason: failure.reason });
      return false;
    }
    return true;
  });
  if (!pending.length) return { calculated: 0, remaining: 0, unknown };
  const start = await geocode(origin, "FR");
  const deadline = Date.now() + 80_000;
  let calculated = 0;
  let attempted = 0;
  // Services publics : petit lot, cache et appels séquentiels ; jamais un géocodage massif.
  for (const city of pending.slice(0, 12)) {
    if (Date.now() >= deadline) break;
    attempted++;
    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
      const end = await geocode(city, "CH");
      const url = new URL(`https://router.project-osrm.org/route/v1/driving/${start.join(",")};${end.join(",")}`);
      url.searchParams.set("overview", "false");
      url.searchParams.set("alternatives", "false");
      url.searchParams.set("steps", "false");
      const data = await requestJson(url) as { code?: string; routes?: { duration?: unknown; distance?: unknown }[] } | null;
      const route = Array.isArray(data?.routes) ? data.routes[0] : null;
      if (data?.code !== "Ok" || typeof route?.duration !== "number" || typeof route.distance !== "number" ||
        !Number.isFinite(route.duration) || !Number.isFinite(route.distance) || route.duration < 0 || route.distance < 0) throw new Error("Itinéraire en voiture non disponible");
      getDb().prepare("INSERT INTO commute_routes (origin_key, destination_key, minutes, distance_km, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(origin_key, destination_key) DO UPDATE SET minutes = excluded.minutes, distance_km = excluded.distance_km, updated_at = excluded.updated_at")
        .run(normalizePlace(origin), normalizePlace(city), Math.ceil(route.duration / 60), route.distance / 1000, new Date().toISOString());
      calculated++;
      getDb().prepare("DELETE FROM commute_failures WHERE origin_key = ? AND destination_key = ?").run(normalizePlace(origin), normalizePlace(city));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Trajet inconnu";
      unknown.push({ city, reason });
      getDb().prepare("INSERT INTO commute_failures (origin_key, destination_key, reason, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(origin_key, destination_key) DO UPDATE SET reason = excluded.reason, updated_at = excluded.updated_at")
        .run(normalizePlace(origin), normalizePlace(city), reason, new Date().toISOString());
    }
  }
  return { calculated, remaining: pending.length - attempted, unknown };
}
