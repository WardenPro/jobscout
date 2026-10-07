/** Cantons et principaux lieux non ambigus. Aucun géocodage ni appel externe. */
export const SWISS_CANTONS = {
  AG: "Argovie", AI: "Appenzell Rhodes-Intérieures", AR: "Appenzell Rhodes-Extérieures",
  BE: "Berne", BL: "Bâle-Campagne", BS: "Bâle-Ville", FR: "Fribourg", GE: "Genève",
  GL: "Glaris", GR: "Grisons", JU: "Jura", LU: "Lucerne", NE: "Neuchâtel", NW: "Nidwald",
  OW: "Obwald", SG: "Saint-Gall", SH: "Schaffhouse", SO: "Soleure", SZ: "Schwytz",
  TG: "Thurgovie", TI: "Tessin", UR: "Uri", VD: "Vaud", VS: "Valais", ZG: "Zoug", ZH: "Zurich",
} as const;
export type SwissCanton = keyof typeof SWISS_CANTONS;
export const CANTON_CODES = Object.keys(SWISS_CANTONS) as SwissCanton[];

export function normalizePlace(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Équivalents usuels des villes suisses, sans confondre Bâle-Ville et Bâle-Campagne. */
export function normalizeCity(text: string): string {
  return normalizePlace(text)
    .replace(/\b(?:geneva|genf)\b/g, "geneve")
    .replace(/\bbasel\b/g, "bale")
    .replace(/\bneuenburg\b/g, "neuchatel")
    .replace(/\bbiel\b/g, "bienne")
    .replace(/\bbern\b/g, "berne")
    .replace(/\bluzern\b/g, "lucerne");
}

/** Mots complets du lieu publié : Bern/Berne ne doit pas correspondre à Berneck. */
export function matchesCity(location: string | null | undefined, query: string): boolean {
  const city = normalizeCity(query);
  return !city || ` ${normalizeCity(location ?? "")} `.includes(` ${city} `);
}

const CANTON_ALIASES: Record<string, SwissCanton> = {
  geneva: "GE", genf: "GE", neuenburg: "NE", bern: "BE", baselstadt: "BS", "basel stadt": "BS",
  baselland: "BL", "basel landschaft": "BL", aargau: "AG", freiburg: "FR", graubunden: "GR",
  luzern: "LU", schwyz: "SZ", solothurn: "SO", stgallen: "SG", "st gallen": "SG",
  ticino: "TI", thurgau: "TG", wallis: "VS", zug: "ZG", zurich: "ZH",
};
const CITIES: Record<string, SwissCanton> = {
  geneve: "GE", geneva: "GE", genf: "GE", carouge: "GE", meyrin: "GE", vernier: "GE", "plan les ouates": "GE",
  lausanne: "VD", nyon: "VD", morges: "VD", vevey: "VD", montreux: "VD", "yverdon les bains": "VD", renens: "VD", rolle: "VD",
  neuchatel: "NE", neuenburg: "NE", "la chaux de fonds": "NE", "le locle": "NE", boudry: "NE",
  delemont: "JU", porrentruy: "JU", saignelegier: "JU", basel: "BS", bale: "BS", liestal: "BL", allschwil: "BL", pratteln: "BL",
  bern: "BE", berne: "BE", biel: "BE", bienne: "BE", thun: "BE", zurich: "ZH", winterthur: "ZH",
  fribourg: "FR", freiburg: "FR", bulle: "FR", sion: "VS", sierre: "VS", martigny: "VS", monthey: "VS",
  lucerne: "LU", luzern: "LU", lugano: "TI", bellinzona: "TI", locarno: "TI", zug: "ZG", zoug: "ZG",
};

export function normalizeCanton(value: string | null | undefined): SwissCanton | null {
  const trimmed = (value ?? "").trim();
  const code = trimmed.toUpperCase();
  if (CANTON_CODES.includes(code as SwissCanton)) return code as SwissCanton;
  const normalized = normalizePlace(trimmed);
  return CANTON_CODES.find(c => normalizePlace(SWISS_CANTONS[c]) === normalized) ?? CANTON_ALIASES[normalized] ?? null;
}

const SWISS_COUNTRY_NAMES = new Set(["ch", "suisse", "switzerland", "schweiz", "svizzera"]);
const CITY_NAMES: Record<string, string> = {
  geneve: "Genève", bale: "Bâle", neuchatel: "Neuchâtel", bienne: "Bienne", berne: "Berne", lucerne: "Lucerne",
};
const CANTON_SUFFIX = /(?:\(([A-Z]{2})\)|\s+([A-Z]{2}))\s*$/;

/** Seulement pour les villes suisses : NPA retiré, variantes linguistiques réunies. */
export function normalizeSwissCity(value: string): string {
  let city = value.trim().replace(/^\d{4}\s+|\s+\d{4}$/g, "").trim();
  city = city.replace(CANTON_SUFFIX, (match, parenthesized: string, suffix: string) => {
    const code = parenthesized ?? suffix;
    return normalizeCanton(code) || SWISS_COUNTRY_NAMES.has(normalizePlace(code)) ? "" : match;
  }).trim();
  if (/^(?:biel\s*\/\s*bienne|bienne\s*\/\s*biel)$/i.test(city)) return "Bienne";
  return CITY_NAMES[normalizeCity(city)] ?? city;
}

/** Ville, canton, NPA, pays : les répétitions sont permises, pas les villes distinctes. */
export function parseSwissLocation(location: string | null | undefined): { city: string | null; canton: SwissCanton | null } {
  const cities = new Map<string, string>();
  const cantons = new Set<SwissCanton>();
  let remote = false;
  for (const part of (location ?? "").split(",").map(value => value.trim()).filter(Boolean)) {
    if (SWISS_COUNTRY_NAMES.has(normalizePlace(part)) || /^\d{4}$/.test(part)) continue;
    const suffix = CANTON_SUFFIX.exec(part);
    const code = normalizeCanton(suffix?.[1] ?? suffix?.[2]);
    if (code) cantons.add(code);
    const city = normalizeSwissCity(part);
    const normalized = normalizeCity(city);
    const knownCityCanton = CITIES[normalized];
    const region = normalizeCanton(part);
    if (region) cantons.add(region);
    if (knownCityCanton) cantons.add(knownCityCanton);
    // Un canton seul (Vaud, VD...) n'est pas une destination ; Genève peut être les deux.
    if (region && !knownCityCanton) continue;
    if (/\b(?:remote|teletravail)\b/.test(normalized)) {
      remote = true;
      continue;
    }
    if (!city || city.includes("/") || /\b(?:suisse|switzerland|schweiz|svizzera|toute|divers|et|ou)\b/.test(normalized)) {
      return { city: null, canton: null };
    }
    cities.set(normalized, city);
  }
  const unambiguous = cities.size <= 1 && cantons.size <= 1;
  return {
    city: unambiguous && !remote ? [...cities.values()][0] ?? null : null,
    canton: unambiguous ? [...cantons][0] ?? null : null,
  };
}

/** Région structurée d'abord, puis composants concordants du lieu publié. Usage suisse uniquement. */
export function resolveSwissCanton(region: string | null | undefined, location: string | null | undefined): SwissCanton | null {
  const structured = normalizeCanton(region);
  if (structured) return structured;
  return parseSwissLocation(location).canton;
}
