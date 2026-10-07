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

/** Région structurée d'abord, code explicite ensuite, ville reconnue en dernier recours. */
export function resolveSwissCanton(region: string | null | undefined, location: string | null | undefined): SwissCanton | null {
  const structured = normalizeCanton(region);
  if (structured) return structured;
  const text = location ?? "";
  const code = /(?:\(|,|\s)([A-Z]{2})(?:\)|\s*$)/.exec(text)?.[1];
  if (code && normalizeCanton(code)) return normalizeCanton(code);
  const normalized = normalizePlace(text).replace(/^\d{4}\s+/, "");
  return normalizeCanton(normalized) ?? CITIES[normalized] ?? null;
}
