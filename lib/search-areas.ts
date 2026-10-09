import { z } from "zod";
import departments from "./french-departments.json";
import regions from "./french-regions.json";
import { CANTON_CODES, SWISS_CANTONS, matchesCity, normalizePlace, resolveSwissCanton } from "./swiss-geography";
import { nameToCode, normalizeCountryName } from "./countries";

export const FRENCH_REGIONS = regions;
export const FRENCH_DEPARTMENTS = departments;
export const SearchAreaSchema = z.object({
  country: z.enum(["CH", "FR"]),
  kind: z.enum(["city", "canton", "region", "department"]),
  value: z.string().trim().min(1).max(80),
}).refine(area => area.kind === "city" || (area.country === "CH" && area.kind === "canton" && CANTON_CODES.includes(area.value as keyof typeof SWISS_CANTONS)) || (area.country === "FR" && (area.kind === "region" ? regions.some(r => r.code === area.value) : area.kind === "department" && departments.some(d => d.code === area.value))), "Zone géographique invalide");
export const SearchAreasSchema = z.array(SearchAreaSchema).max(20);
export type SearchArea = z.infer<typeof SearchAreaSchema>;

export function areaLabel(area: SearchArea): string {
  return area.kind === "canton" ? SWISS_CANTONS[area.value as keyof typeof SWISS_CANTONS] : area.kind === "region" ? regions.find(r => r.code === area.value)?.nom ?? area.value : area.kind === "department" ? `${area.value} — ${departments.find(d => d.code === area.value)?.nom ?? area.value}` : area.value;
}

export function searchLocations(areas: SearchArea[] | undefined, country: string): string[] {
  const local = (areas ?? []).filter(area => area.country === nameToCode(normalizeCountryName(country)));
  return local.length ? [...new Set(local.map(area => `${areaLabel(area)}, ${country}`))] : [country];
}

export function frenchDepartment(location?: string | null, code?: unknown): string | null {
  const explicit = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (departments.some(d => d.code === explicit)) return explicit;
  const place = location ?? "";
  const prefix = /^(2[AB]|97[1-6]|\d{2})\s*[-,]/i.exec(place.trim())?.[1]?.toUpperCase();
  if (prefix && departments.some(d => d.code === prefix)) return prefix;
  const postal = /\b(\d{5})\b/.exec(place)?.[1];
  if (postal) {
    const dep = postal.startsWith("97") ? postal.slice(0, 3) : postal.slice(0, 2);
    if (departments.some(d => d.code === dep)) return dep;
  }
  const components = place.split(/[,;|]/).map(part => normalizePlace(part));
  return departments.find(d => components.includes(normalizePlace(d.nom)))?.code ?? null;
}

/** Union des zones d'un même pays. Un pays sans zone reste sans restriction. */
export function matchesSearchAreas(offer: { country?: string | null; location?: string | null; canton?: string | null; department?: string | null; raw_payload?: Record<string, unknown> }, areas: SearchArea[] | undefined, includeUnknown = false): boolean {
  if (!areas?.length) return true;
  const country = nameToCode(normalizeCountryName(offer.country));
  if (!country) return includeUnknown;
  const local = areas.filter(area => area.country === country);
  if (!local.length) return true;
  const canton = country === "CH" ? resolveSwissCanton(offer.canton, offer.location) : null;
  const department = country === "FR" ? frenchDepartment(offer.location, offer.department ?? offer.raw_payload?.department) : null;
  const region = departments.find(d => d.code === department)?.codeRegion;
  let unknown = false;
  for (const area of local) {
    if (area.kind === "city") {
      if (!offer.location?.trim() || /^(?:france|suisse|switzerland|remote|télétravail)$/i.test(offer.location.trim())) unknown = true;
      else if (matchesCity(offer.location, area.value)) return true;
    } else if (area.kind === "canton") {
      if (!canton) unknown = true; else if (canton === area.value) return true;
    } else if (area.kind === "department") {
      if (!department) unknown = true; else if (department === area.value) return true;
    } else {
      if (region === area.value || matchesCity(offer.location, areaLabel(area))) return true;
      if (!region) unknown = true;
    }
  }
  return includeUnknown && unknown;
}
