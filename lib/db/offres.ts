import "server-only";
import { geoGeneration, haversineKm, resolveOfferLocation, type GeoPrecision } from "@/lib/geo";
import { depOfInsee, roundKm } from "@/lib/distance/format";
import { getDb, asJson, parseJson, getSetting, setSetting } from "./index";
import { syncDuplicates } from "./duplicates";
import { currentSearch } from "./scans";
import type { ScrapedOffre } from "@/lib/scrapers/base";
import type { ScoreResult } from "@/lib/scoring/local";
import type { AiReview } from "@/lib/scoring/review";
import type { FeedbackVerdict, OfferFeedback } from "@/lib/feedback";
import { classifyContract, CONTRACT_ORDER, type ContractCategory } from "@/lib/contracts";
import { resolveSwissCanton, matchesCity, type SwissCanton } from "@/lib/swiss-geography";
import { isSwissOffer } from "@/lib/work-permit";
import { assessLanguages, type LanguageAssessment } from "@/lib/language-requirements";
import { getProfile } from "./queries";
import { cachedCommute, type CommuteEstimate } from "@/lib/commute";
import { countryMatcher, normalizeCountryName } from "@/lib/countries";
import { matchesSearchAreas } from "@/lib/search-areas";
import { fixMojibake, sanitizeScrapedOffre } from "@/lib/offres/clean-text";
import { ensureOffresRepaired } from "./repair-markup";
import { scoreDisplay, scoreScale, type ScoreScale, type ScoreTone } from "@/lib/utils";

export type { ScrapedOffre };

export type OffreRow = {
  id: number;
  source: string;
  source_id: string;
  url: string;
  title: string;
  company: string;
  country: string | null;
  location: string | null;
  canton: SwissCanton | null;
  contract_type: string | null;
  salary: string | null;
  description_html: string;
  description_text: string;
  description_status: "ok" | "failed" | "partial";
  posted_at: string | null;
  scraped_at: string;
  score: number;
  score_breakdown: {
    sector: number;
    skills: number;
    country: number;
    language?: number;
    duration?: number;
    contract?: number;
    /** Taux d'activité (Suisse) : 100 compatible, 0 hors fourchette, null inconnu. */
    workload?: number | null;
    /** Proximité de l'intitulé avec les postes visés (absent des notes antérieures). */
    title?: number;
    /** Adéquation de l'expérience demandée (absent des notes antérieures). */
    seniority?: number;
    /** Lieu par rapport à la zone de recherche (absent si inconnu). */
    location?: number;
    /** Motif d'exclusion : l'offre est hors critères. */
    excluded?: string;
    /** Verdict de la relecture par l'IA, quand elle a eu lieu. */
    ai_verdict?: string;
    /** Ce qui fait monter l'offre, pour la carte de la liste. */
    plus?: string;
    /** Son premier défaut, pour la carte de la liste. */
    minus?: string;
    reason?: string;
  } | null;
  /** Relecture par l'IA (exigences indispensables couvertes ou non), ou null. */
  ai_review: AiReview | null;
  /** Problèmes relevés par le contrôle de qualité (lib/scrapers/quality.ts). */
  quality_issues: string[] | null;
  /** Première collecte (UTC, format SQLite). */
  first_seen_at: string | null;
  /** Constat de retrait par la source (UTC, format SQLite), ou null. */
  closed_at: string | null;
  checked_at: string | null;
  /** Offre qui représente son groupe de doublons, ou null. */
  duplicate_of: number | null;
  is_vie: number;
  raw_payload: string | null;
  scrape_errors: string | null;
};

export type OffreFiltered = OffreRow & {
  has_cv: boolean;
  has_lm: boolean;
  has_msg: boolean;
  contract_category: ContractCategory;
};

/** Autre publication de la même offre, regroupée sous celle de la liste. */
export type OfferVariant = { id: number; source: string; location: string | null; closed: boolean };

export type OffreSummary = Pick<
  OffreFiltered,
  "id" | "source" | "url" | "title" | "company" | "country" | "location" |
  "posted_at" | "score" | "is_vie" | "description_status" | "contract_category" | "canton" |
  "has_cv" | "has_lm" | "first_seen_at" | "closed_at"
> & {
  description_text: string;
  score_reason: string | null;
  /** Ce que la note veut dire pour cette personne (voir scoreDisplay). */
  score_label: string;
  score_tone: ScoreTone;
  /** Raison principale et premier défaut, pour la carte. */
  score_plus: string | null;
  score_minus: string | null;
  /** Avis de l'utilisateur (👍 / 👎), ou null. */
  feedback: OfferFeedback | null;
  /** Problèmes relevés par le contrôle de qualité. */
  quality_issues: string[];
  /** Mêmes offres publiées ailleurs (autres lieux, autres sources). */
  variants: OfferVariant[];
  /** Langue des exigences de l'annonce face au profil. */
  language_assessment: LanguageAssessment;
  /** Estimation de trajet en voiture, quand le filtre frontalier est actif. */
  commute: CommuteEstimate | null;
  /** Distance à vol d'oiseau depuis la ville de référence (km), null si inconnue ou sans ville. */
  distance_km: number | null;
  /** Même commune que la ville de référence (arrondissements de Paris, Lyon, Marseille compris). */
  same_city: boolean;
  /** Lieu connu seulement au département, celui de la ville de référence. */
  same_dept: boolean;
  /** Lieu reconnu (« Saint-Denis (93) », « Bruxelles, Belgique »), ou null. */
  geo_label: string | null;
  geo_precision: GeoPrecision | null;
};

export type OffersSort = "smart" | "newest" | "oldest" | "score" | "distance";

/** Ville de référence du filtre par distance (lib/distance/home.ts), passée par l'appelant. */
export type DistanceOrigin = { code: string; label: string; lat: number; lng: number };

/** Comptes du menu « Distance », calculés sur les offres qui passent les autres filtres. */
export type DistanceFacets = {
  home: { code: string; label: string } | null;
  /** Offres dans chaque rayon (clé = rayon en km, « 0 » = dans la commune). */
  counts: Record<string, number>;
  /** Offres dont on connaît la distance ; offres EN FRANCE dont on ne la connaît pas (lieu absent, région,
   * télétravail). Les offres à l'étranger sans ville ne sont jamais dans un rayon autour d'une ville française. */
  located: number;
  unlocated: number;
};

/** Facettes de toute la base, calculées une fois par construction du cache. */
type BaseFacets = {
  total: number;
  countries: string[];
  sources: string[];
  contractCounts: Record<ContractCategory, number>;
  hasVie: boolean;
  /** Offres retirées par leur source, masquées sauf demande. */
  closed: number;
};

export type OffersSearch = {
  offers: OffreSummary[];
  total: number;
  pageSize: number;
  facets: BaseFacets & { distance: DistanceFacets };
};

const OFFER_PAGE_SIZE = 24;
/**
 * Offres que la liste montre par défaut : ni doublon d'une autre, ni retirée par
 * sa source. Les compteurs de l'accueil s'en servent pour concorder avec la liste
 * (appeler syncDuplicates() avant).
 */
export const VISIBLE_SQL = "duplicate_of IS NULL AND closed_at IS NULL";

/**
 * VISIBLE_SQL, moins les offres d'une recherche précédente quand la liste les
 * masque : l'accueil compte et suggère alors ce que la liste montre.
 */
export function visibleSql(): string {
  const search = getSetting(CURRENT_SEARCH_ONLY) === "1" ? currentSearch() : null;
  // started_at vient de datetime('now') : on le vérifie avant de l'écrire dans la requête.
  if (!search || !/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(search.since)) return VISIBLE_SQL;
  const since = `'${search.since}'`;
  return `${VISIBLE_SQL} AND (scraped_at >= ${since} OR id IN (SELECT duplicate_of FROM offres WHERE duplicate_of IS NOT NULL AND scraped_at >= ${since}))`;
}
// Même classement pour la liste, l’API paginée et les suggestions de l’accueil.
// Le bonus de fraîcheur reste volontairement léger face au score du profil.
// Départage final par id : sans lui, l’ordre des ex æquo dépend du plan de
// requête et « Afficher davantage » peut répéter ou sauter des offres.
const SMART_ORDER = `score + CASE
  WHEN posted_at IS NULL THEN 0
  WHEN julianday('now') - julianday(posted_at) <= 1 THEN 6
  WHEN julianday('now') - julianday(posted_at) <= 3 THEN 4
  WHEN julianday('now') - julianday(posted_at) <= 7 THEN 2
  ELSE 0
END DESC, score DESC, posted_at DESC, o.id DESC`;
// Ordre de la liste : une offre retirée par sa source, puis une offre jugée
// « pas pour moi », descendent en fin de liste sans disparaître.
const LIST_FROM = "offres o LEFT JOIN offre_feedback f ON f.offre_id = o.id";
const LIST_ORDER = `(o.closed_at IS NOT NULL) ASC, (f.verdict = 'down') ASC, ${SMART_ORDER}`;

function normalizeSearch(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

// ----------- Cache mémoire de la recherche -----------
// Sans cache, chaque requête relisait les 4 623 lignes, reclassait chaque contrat
// (normalisation des descriptions) et, avec un mot-clé, renormalisait 14 Mo de
// texte : ~250 ms par clic de filtre, ~600 ms par recherche. Les lignes prêtes à
// filtrer restent en mémoire et sont reconstruites dès que la base change.

type CachedOffre = Omit<OffreSummary, "description_text" | "score_reason" | "score_label" | "score_tone" | "score_plus" | "score_minus" | "language_assessment" | "commute" | "distance_km" | "same_city" | "same_dept"> & {
  department: string | null;
  /** Lieu non placé mais en France (ou pays inconnu) : candidat à « Les inclure ». */
  geo_unlocated_fr: boolean;
  geo_lat: number | null;
  geo_lng: number | null;
  /** Code INSEE de la commune française reconnue (comparaison « dans votre ville »). */
  geo_code: string | null;
  /** 1 000 premiers caractères : tout ce que l’aperçu affiche. */
  excerpt: string;
  /** JSON brut, lu seulement pour les offres de la page renvoyée. */
  score_breakdown: string | null;
};

type OffresCache = {
  fingerprint: string;
  byId: Map<number, CachedOffre>;
  /** Ordre SMART_ORDER, relu chaque minute (le bonus de fraîcheur dépend de l’heure). */
  smart: CachedOffre[];
  orderedAt: number;
  /** Titre, entreprise, pays, lieu et description complète, sans accents ; construit à la première recherche. */
  haystacks: Map<number, string> | null;
  facets: BaseFacets;
  /** Échelle relative des notes : offres en ligne et dans les critères, de la recherche en cours. */
  scale: ScoreScale | null;
  /** Offres en ligne d'une recherche précédente (voir currentSearch) ; null s'il n'y en a pas. */
  previous: PreviousSearch | null;
};

const ORDER_TTL_MS = 60_000;
let offresCache: OffresCache | null = null;

type CacheRow = Pick<
  OffreRow,
  "id" | "source" | "url" | "title" | "company" | "country" | "location" |
  "contract_type" | "description_status" | "posted_at" | "score" | "is_vie" | "canton" |
  "first_seen_at" | "closed_at" | "duplicate_of" | "scraped_at"
> & {
  department: string | null; head: string | null; excerpt: string | null; score_breakdown: string | null; has_cv: number; has_lm: number;
  feedback_verdict: FeedbackVerdict | null; feedback_reason: string | null;
  quality_issues: string | null; geo_hint: unknown; geo_dep: string | null;
};

function buildOffresCache(fingerprint: string): OffresCache {
  // La description entière ne remonte pas : 4 000 caractères suffisent à classer le
  // contrat (detectVie en lit 4 000, classifyContract 1 500 ; résultat identique sur
  // les 4 623 offres de référence) et l’aperçu en affiche 1 000.
  const rows = getDb().prepare(`
    SELECT o.id, o.source, o.url, o.title, o.company, o.country, o.location,
      o.contract_type, o.canton, o.description_status, o.posted_at, o.score, o.score_breakdown, o.is_vie,
      o.first_seen_at, o.closed_at, o.duplicate_of, o.scraped_at,
      json_extract(CASE WHEN json_valid(o.raw_payload) THEN o.raw_payload ELSE '{}' END, '$.department') AS department,
      substr(o.description_text, 1, 4000) AS head,
      substr(o.description_text, 1, 1000) AS excerpt,
      EXISTS(SELECT 1 FROM documents WHERE offre_id = o.id AND type = 'cv') AS has_cv,
      EXISTS(SELECT 1 FROM documents WHERE offre_id = o.id AND type = 'lm') AS has_lm,
      -- Indices de lieu propres à la source (lib/geo) : département de l'APEC, télétravail de WTTJ.
      CASE WHEN json_valid(o.raw_payload) THEN CASE o.source
        WHEN 'apec' THEN json_extract(o.raw_payload, '$.lieuTexte')
        WHEN 'wttj' THEN json_extract(o.raw_payload, '$.remote')
      END END AS geo_hint,
      -- France Travail range parfois le département dans le champ entreprise (« 974 »).
      CASE WHEN o.source = 'francetravail' AND (trim(o.company) GLOB '[0-9][0-9]' OR trim(o.company) GLOB '[0-9][0-9][0-9]' OR trim(o.company) IN ('2A', '2B'))
        THEN trim(o.company) END AS geo_dep,
      f.verdict AS feedback_verdict, f.reason AS feedback_reason, o.quality_issues
    FROM ${LIST_FROM}
    ORDER BY ${LIST_ORDER}
  `).all() as CacheRow[];

  // Recherche en cours : une offre en fait partie si elle, ou une autre
  // publication de son groupe, a été revue depuis son premier scan.
  const search = currentSearch();
  const current = new Set<number>();
  for (const row of rows) if (!search || row.scraped_at >= search.since) current.add(row.duplicate_of ?? row.id);
  const previousCount = search ? rows.filter((r) => r.duplicate_of == null && !r.closed_at && !current.has(r.id)).length : 0;
  // Réglage de la liste : n'afficher que la recherche en cours. Rien n'est
  // effacé ; la fiche d'une offre masquée reste accessible par son adresse.
  const hidePrevious = !!search && getSetting(CURRENT_SEARCH_ONLY) === "1";

  const contractCounts = Object.fromEntries(CONTRACT_ORDER.map((contract) => [contract, 0])) as Record<ContractCategory, number>;
  const countries = new Set<string>();
  const sources = new Set<string>();
  const byId = new Map<number, CachedOffre>();
  const smart: CachedOffre[] = [];
  const variants: CacheRow[] = [];
  let open = 0;
  let closed = 0;
  const scores = new Map<number, number>();
  for (const row of rows) {
    // Un doublon n'a pas sa propre ligne : il s'affiche sous l'offre de son groupe.
    if (row.duplicate_of != null) {
      variants.push(row);
      continue;
    }
    if (hidePrevious && !current.has(row.id)) continue;
    const contract_category = classifyContract({ ...row, description_text: row.head ?? "" });
    // Facettes et compteurs décrivent ce que la liste montre par défaut : les offres en ligne.
    if (row.closed_at) closed++;
    else {
      open++;
      if (!parseJson<{ excluded?: string } | null>(row.score_breakdown, null)?.excluded) scores.set(row.id, row.score ?? 0);
      contractCounts[contract_category]++;
      const country = normalizeCountryName(row.country);
      if (country) countries.add(country);
      sources.add(row.source);
    }
    const geo = resolveOfferLocation({
      source: row.source, location: row.location, country: row.country,
      // Indice textuel seulement (une valeur JSON d'un autre type ne doit rien casser).
      hint: row.geo_dep ?? (typeof row.geo_hint === "string" ? row.geo_hint : null),
      head: row.source === "talent" ? (row.head ?? "").slice(0, 400) : null,
    });
    const countryKey = normalizeSearch((row.country ?? "").trim());
    const offer: CachedOffre = {
      id: row.id, source: row.source, url: row.url, title: row.title,
      company: row.company, country: row.country, location: row.location,
      canton: isSwissOffer(row.country) ? resolveSwissCanton(row.canton, row.location) : null,
      department: row.department,
      posted_at: row.posted_at, score: row.score, is_vie: row.is_vie,
      description_status: row.description_status, contract_category,
      has_cv: !!row.has_cv, has_lm: !!row.has_lm,
      first_seen_at: row.first_seen_at, closed_at: row.closed_at, variants: [],
      feedback: row.feedback_verdict ? { verdict: row.feedback_verdict, reason: row.feedback_reason } : null,
      quality_issues: parseJson<string[]>(row.quality_issues, []),
      // substr() compte des caractères, slice() des unités UTF-16 (émojis) : on
      // recoupe pour rendre exactement l’extrait d’avant.
      excerpt: (row.excerpt ?? "").slice(0, 1000), score_breakdown: row.score_breakdown,
      geo_lat: geo.lat, geo_lng: geo.lng, geo_code: geo.lat !== null ? geo.code ?? null : null,
      geo_label: geo.label, geo_precision: geo.precision,
      geo_unlocated_fr: geo.lat === null && (geo.country ? geo.country === "FR" : countryKey === "" || countryKey === "france"),
    };
    byId.set(offer.id, offer);
    smart.push(offer);
  }
  for (const v of variants) {
    const rep = byId.get(v.duplicate_of!);
    if (!rep) continue;
    rep.variants.push({ id: v.id, source: v.source, location: v.location, closed: !!v.closed_at });
    if (!rep.closed_at && !v.closed_at) sources.add(v.source);
  }
  // L'échelle se calcule sur la recherche en cours : sous un profil Acheteur,
  // les 1 392 offres commerciales d'une recherche précédente, mal notées pour
  // lui, faisaient passer une offre à 31/100, 188ᵉ, pour « Haut de votre liste »
  // (19 octobre 2026). Toute la liste tant que la recherche en compte moins de 10.
  const currentScores = [...scores].filter(([id]) => current.has(id)).map(([, score]) => score);
  const scale = scoreScale(currentScores.length >= 10 ? currentScores : [...scores.values()]);
  return {
    fingerprint, byId, smart, orderedAt: Date.now(), haystacks: null, scale,
    previous: search && previousCount ? { count: previousCount, since: search.since, hidden: hidePrevious } : null,
    facets: {
      total: open,
      countries: [...countries].sort((a, b) => a.localeCompare(b, "fr")),
      sources: [...sources].sort(),
      contractCounts,
      hasVie: contractCounts.vie > 0,
      closed,
    },
  };
}

/** Échelle relative des notes de la liste (voir scoreDisplay) ; null sous 10 offres. */
export function getScoreScale(): ScoreScale | null {
  return getOffresCache().scale;
}

const CURRENT_SEARCH_ONLY = "offres:current_search_only";

/** Offres en ligne d'une recherche précédente, et si la liste les masque. */
export type PreviousSearch = { count: number; since: string; hidden: boolean };

export function previousSearchOffres(): PreviousSearch | null {
  return getOffresCache().previous;
}

/** N'afficher dans la liste que les offres de la recherche en cours, ou tout afficher. */
export function setCurrentSearchOnly(enabled: boolean): void {
  setSetting(CURRENT_SEARCH_ONLY, enabled ? "1" : "0");
}

type DisplayBreakdown = { reason?: string; ai_verdict?: string; excluded?: string; plus?: string; minus?: string; location?: number };

/** Libellé, couleur, raison et défaut d'une note, à partir de sa décomposition enregistrée. */
function displayOf(score: number | null, breakdown: string | null, scale: ScoreScale | null) {
  const bd = parseJson<DisplayBreakdown | null>(breakdown, null);
  const d = scoreDisplay(score ?? 0, { scale, verdict: bd?.ai_verdict, excluded: !!bd?.excluded, outOfZone: bd?.location === 20 });
  return {
    score_reason: bd?.reason ?? null,
    score_label: d.label,
    score_tone: d.tone,
    score_plus: bd?.plus ?? null,
    score_minus: bd?.minus ?? null,
  };
}

/**
 * Empreinte de la base, lue à chaque appel : data_version (écritures d'autres
 * connexions), total_changes (écritures de cette connexion) et génération de la
 * base géographique (positions recalculées après un rechargement).
 */
function dbFingerprint(): string {
  const db = getDb();
  const version = (db.prepare("PRAGMA data_version").get() as { data_version: number }).data_version;
  const changes = (db.prepare("SELECT total_changes() AS n").get() as { n: number }).n;
  return `${version}:${changes}:${geoGeneration()}`;
}

function getOffresCache(): OffresCache {
  // Réparations uniques des offres déjà en base (entités HTML, puis balisage en
  // clair), avant toute lecture : un serveur déjà lancé les fait à la première
  // requête. L'empreinte suffirait à reconstruire le cache après leurs UPDATE ; on le vide
  // aussi explicitement.
  if (ensureOffresRepaired() > 0) offresCache = null;
  syncDuplicates();
  const fingerprint = dbFingerprint();
  if (!offresCache || offresCache.fingerprint !== fingerprint) {
    offresCache = buildOffresCache(fingerprint);
  } else if (Date.now() - offresCache.orderedAt > ORDER_TTL_MS) {
    // Seul l’ordre bouge avec l’heure : on relit les identifiants triés, pas les lignes.
    const cache = offresCache;
    const ids = getDb().prepare(`SELECT o.id FROM ${LIST_FROM} ORDER BY ${LIST_ORDER}`).all() as { id: number }[];
    cache.smart = ids.map(({ id }) => cache.byId.get(id)).filter((offer): offer is CachedOffre => !!offer);
    cache.orderedAt = Date.now();
  }
  return offresCache;
}

function getHaystacks(cache: OffresCache): Map<number, string> {
  if (cache.haystacks) return cache.haystacks;
  const rows = getDb().prepare(
    "SELECT id, duplicate_of, title, company, country, location, description_text FROM offres"
  ).all() as Pick<OffreRow, "id" | "duplicate_of" | "title" | "company" | "country" | "location" | "description_text">[];
  const haystacks = new Map<number, string>();
  for (const row of rows) {
    // Un doublon prête son lieu et son texte à l'offre de son groupe : chercher
    // « Lyon » trouve le groupe même si l'offre affichée est à Rouen.
    const key = row.duplicate_of ?? row.id;
    const text = normalizeSearch([row.title, row.company, row.country, row.location, row.description_text].filter(Boolean).join(" "));
    haystacks.set(key, haystacks.has(key) ? `${haystacks.get(key)} ${text}` : text);
  }
  cache.haystacks = haystacks;
  return haystacks;
}

/** Comparaison binaire, comme ORDER BY sur du texte en SQLite (pas de collation locale). */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Seuil de score lu dans une URL (?score=70, ?minScore=60) : entier de 1 à 100, sinon aucun filtre. */
export function parseMinScore(raw: string | null | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : 0;
}

/** Facettes d'un sous-ensemble (zones du profil) : mêmes règles que le cache. */
function searchFacets(rows: CachedOffre[]): BaseFacets {
  const contractCounts = Object.fromEntries(CONTRACT_ORDER.map((contract) => [contract, 0])) as Record<ContractCategory, number>;
  const countries = new Set<string>();
  const sources = new Set<string>();
  let open = 0;
  let closed = 0;
  for (const row of rows) {
    if (row.closed_at) {
      closed++;
      continue;
    }
    open++;
    contractCounts[row.contract_category]++;
    const country = normalizeCountryName(row.country);
    if (country) countries.add(country);
    sources.add(row.source);
  }
  return { total: open, countries: [...countries].sort((a, b) => a.localeCompare(b, "fr")), sources: [...sources].sort(), contractCounts, hasVie: contractCounts.vie > 0, closed };
}

/** Rayons du menu « Distance » (km) ; 0 = dans la commune. Même liste que lib/distance/format.ts. */
const DISTANCE_BUCKETS = [0, 5, 10, 20, 30, 50, 100, 200] as const;

/** Arrondissements de Paris, Lyon et Marseille → commune entière. */
function cityCodeOf(code: string | null | undefined): string | null {
  if (!code) return null;
  if (/^751\d\d$/.test(code)) return "75056";
  if (/^6938\d$/.test(code)) return "69123";
  if (/^132\d\d$/.test(code)) return "13055";
  return code;
}

/** Filtrage côté serveur : seules les cartes de la page courante sont envoyées au navigateur. */
export function searchOffres(opts: {
  query?: string;
  source?: string;
  country?: string;
  canton?: SwissCanton;
  city?: string;
  commute?: { origin: string; maxMinutes: number; includeUnknown: boolean };
  contracts?: ContractCategory[];
  /** Score minimal (true = 60, seuil de la puce « Score 60+ »). */
  minScore?: boolean | number;
  /** Raccourci de ?vie=1 : même règle que la puce contrat « V.I.E » (contract_category). */
  vieOnly?: boolean;
  /** Montrer aussi les offres retirées par leur source (en fin de liste). */
  includeClosed?: boolean;
  sortBy?: OffersSort;
  /** Ville de référence (lib/distance/home.ts) : sans elle, ni distance, ni rayon, ni tri par distance. */
  home?: DistanceOrigin | null;
  /** Rayon en km (0 = dans la commune) ; absent = toutes distances. */
  radiusKm?: number | null;
  /** Avec un rayon : garder aussi les offres dont la distance est inconnue. */
  includeUnlocated?: boolean;
  page?: number;
} = {}): OffersSearch {
  const cache = getOffresCache();
  const profile = getProfile();
  const targetCountries = profile?.target_countries ?? [];
  const inProfile = countryMatcher(targetCountries);
  const inCountry = countryMatcher(opts.country ? [opts.country] : []);
  const scoped = cache.smart.filter((row) => inProfile(row.country) && matchesSearchAreas(row, profile?.search_areas, profile?.include_unknown_locations));
  const query = normalizeSearch((opts.query ?? "").trim());
  const haystacks = query ? getHaystacks(cache) : null;
  const contracts = new Set(opts.contracts ?? []);
  const minScore = opts.minScore === true ? 60 : typeof opts.minScore === "number" ? opts.minScore : 0;
  const commutes = new Map<number, CommuteEstimate | null>();
  const filtered = scoped.filter((row) => {
    if (row.closed_at && !opts.includeClosed) return false;
    if (haystacks && !(haystacks.get(row.id) ?? "").includes(query)) return false;
    if (opts.source && row.source !== opts.source && !row.variants.some((v) => v.source === opts.source)) return false;
    if (!inCountry(row.country)) return false;
    if (opts.canton && row.canton !== opts.canton) return false;
    if (!matchesCity(row.location, opts.city ?? "")) return false;
    // Le filtre frontalier ne change pas la visibilité des offres des autres pays.
    if (opts.commute && isSwissOffer(row.country)) {
      const estimate = cachedCommute(opts.commute.origin, row.location);
      commutes.set(row.id, estimate);
      if (estimate ? estimate.minutes > opts.commute.maxMinutes : !opts.commute.includeUnknown) return false;
    }
    if (contracts.size && !contracts.has(row.contract_category)) return false;
    if (minScore > 0 && (row.score ?? 0) < minScore) return false;
    if (opts.vieOnly && row.contract_category !== "vie") return false;
    return true;
  });

  // Distance : calculée à la volée depuis la ville de référence, à chaque requête
  // (positions des offres prêtes dans le cache), jamais enregistrée ni intégrée au score.
  const home = opts.home ?? null;
  const homeCity = home ? cityCodeOf(home.code) : null;
  const distances = new Map<number, number | null>();
  const sameCity = new Set<number>();
  const sameDept = new Set<number>();
  const homeDept = home ? depOfInsee(home.code) : null;
  let unlocatedFr = 0;
  const counts: Record<string, number> = Object.fromEntries(DISTANCE_BUCKETS.map((radius) => [String(radius), 0]));
  let located = 0;
  if (home) {
    for (const row of filtered) {
      if (row.geo_lat === null || row.geo_lng === null) {
        distances.set(row.id, null);
        if (row.geo_unlocated_fr) unlocatedFr++;
        continue;
      }
      const km = haversineKm(home, { lat: row.geo_lat, lng: row.geo_lng });
      distances.set(row.id, km);
      located++;
      const same = !!homeCity && cityCodeOf(row.geo_code) === homeCity;
      if (same) sameCity.add(row.id);
      else if (row.geo_precision === "departement" && row.geo_code === homeDept) sameDept.add(row.id);
      for (const radius of DISTANCE_BUCKETS) {
        if (same || (radius > 0 && roundKm(km) <= radius)) counts[String(radius)]++;
      }
    }
  }
  const radius = home && typeof opts.radiusKm === "number" && opts.radiusKm >= 0 ? opts.radiusKm : null;
  const inRadius = radius === null ? filtered : filtered.filter((row) => {
    const km = distances.get(row.id);
    if (km === null || km === undefined) return !!opts.includeUnlocated && row.geo_unlocated_fr;
    return sameCity.has(row.id) || (radius > 0 && roundKm(km) <= radius);
  });

  // Tris stables : les ex æquo gardent l’ordre intelligent, lui-même départagé par id.
  // Une offre retirée reste en fin de liste quel que soit le tri, un 👎 quel que soit le tri par score.
  const closed = (o: CachedOffre) => Number(!!o.closed_at);
  const down = (o: CachedOffre) => Number(o.feedback?.verdict === "down");
  if (opts.sortBy === "distance" && home) {
    inRadius.sort((a, b) => {
      if (closed(a) !== closed(b)) return closed(a) - closed(b);
      const sa = sameCity.has(a.id);
      const sb = sameCity.has(b.id);
      if (sa || sb) return Number(sb) - Number(sa);
      const da = distances.get(a.id) ?? null;
      const db = distances.get(b.id) ?? null;
      if (da === null || db === null) return Number(da === null) - Number(db === null);
      return da - db;
    });
  }
  if (opts.sortBy === "score") inRadius.sort((a, b) => closed(a) - closed(b) || down(a) - down(b) || (b.score ?? 0) - (a.score ?? 0));
  if (opts.sortBy === "newest") inRadius.sort((a, b) => closed(a) - closed(b) || compareText(b.posted_at ?? "", a.posted_at ?? ""));
  if (opts.sortBy === "oldest") {
    // Dates inconnues en fin de liste, comme en 3.4.10.
    inRadius.sort((a, b) => {
      if (closed(a) !== closed(b)) return closed(a) - closed(b);
      if (!a.posted_at || !b.posted_at) return Number(!a.posted_at) - Number(!b.posted_at);
      return compareText(a.posted_at, b.posted_at);
    });
  }
  const page = Math.max(1, Math.min(10000, Math.trunc(opts.page ?? 1) || 1));
  const visible = inRadius.slice((page - 1) * OFFER_PAGE_SIZE, page * OFFER_PAGE_SIZE);
  const profileLanguages = profile?.languages ?? null;
  const fullDescription = getDb().prepare("SELECT description_text FROM offres WHERE id = ?");
  return {
    offers: visible.map((row) => ({
      id: row.id, source: row.source, url: row.url, title: row.title,
      company: row.company, country: row.country, location: row.location,
      canton: row.canton,
      language_assessment: assessLanguages((fullDescription.get(row.id) as { description_text: string }).description_text, profileLanguages),
      commute: commutes.get(row.id) ?? null,
      posted_at: row.posted_at, score: row.score, is_vie: row.is_vie,
      description_status: row.description_status,
      description_text: row.excerpt,
      ...displayOf(row.score, row.score_breakdown, cache.scale),
      contract_category: row.contract_category,
      has_cv: row.has_cv, has_lm: row.has_lm,
      first_seen_at: row.first_seen_at, closed_at: row.closed_at,
      variants: row.variants,
      feedback: row.feedback,
      quality_issues: row.quality_issues,
      distance_km: distances.get(row.id) ?? null,
      same_city: sameCity.has(row.id),
      same_dept: sameDept.has(row.id),
      geo_label: row.geo_label, geo_precision: row.geo_precision,
    })),
    total: inRadius.length,
    pageSize: OFFER_PAGE_SIZE,
    facets: {
      ...(targetCountries.length || profile?.search_areas?.length ? searchFacets(scoped) : cache.facets),
      distance: {
        home: home ? { code: home.code, label: home.label } : null,
        counts, located, unlocated: home ? unlocatedFr : 0,
      },
    },
  };
}

/** Les six premières suggestions suffisent au tableau de bord. */
export function suggestedOffres(
  limit: number,
  untracked = false
): (Pick<OffreRow, "id" | "title" | "company" | "country" | "location" | "posted_at" | "score"> & Pick<OffreSummary, "score_label" | "score_tone">)[] {
  const profile = getProfile();
  const inProfile = countryMatcher(profile?.target_countries ?? []);
  const tracked = new Set(untracked ? (getDb().prepare("SELECT offre_id FROM candidatures WHERE offre_id IS NOT NULL").all() as { offre_id: number }[]).map((row) => row.offre_id) : []);
  const scale = getScoreScale();
  return getOffresCache().smart
    .filter((row) =>
      !row.closed_at &&
      row.feedback?.verdict !== "down" &&
      inProfile(row.country) &&
      matchesSearchAreas(row, profile?.search_areas, profile?.include_unknown_locations) &&
      !tracked.has(row.id)
    )
    .slice(0, Math.max(1, Math.min(20, Math.trunc(limit))))
    .map((row) => {
      const { score_label, score_tone } = displayOf(row.score, row.score_breakdown, scale);
      return { id: row.id, title: row.title, company: row.company, country: row.country, location: row.location, posted_at: row.posted_at, score: row.score, score_label, score_tone };
    });
}

// Filet de sécurité anti-mojibake : fixMojibake est exporté depuis lib/offres/clean-text.ts.
export { fixMojibake };

export function upsertOffreFromSource(source: string, o: ScrapedOffre): number {
  // Réparations des offres déjà en base AVANT la première écriture du nouveau code
  // (un scan lancé avant toute page ouverte) : sinon elles repasseraient sur des textes déjà
  // nettoyés par le filet, et le décodage n'est pas idempotent.
  ensureOffresRepaired();
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO offres (source, source_id, url, title, company, country, location, canton, contract_type, salary,
      description_html, description_text, description_status, posted_at, is_vie, raw_payload, scrape_errors, quality_issues,
      first_seen_at, checked_at)
    VALUES (@source, @source_id, @url, @title, @company, @country, @location, @canton, @contract_type, @salary,
      @description_html, @description_text, @description_status, @posted_at, @is_vie, @raw_payload, @scrape_errors, @quality_issues,
      datetime('now'), datetime('now'))
    ON CONFLICT(source, source_id) DO UPDATE SET
      url = excluded.url,
      title = excluded.title,
      company = excluded.company,
      country = excluded.country,
      location = excluded.location,
      canton = excluded.canton,
      contract_type = excluded.contract_type,
      salary = excluded.salary,
      description_html = excluded.description_html,
      description_text = excluded.description_text,
      description_status = excluded.description_status,
      posted_at = excluded.posted_at,
      is_vie = excluded.is_vie,
      raw_payload = excluded.raw_payload,
      scrape_errors = excluded.scrape_errors,
      quality_issues = excluded.quality_issues,
      scraped_at = datetime('now'),
      -- La source vient de la renvoyer : elle est en ligne.
      closed_at = NULL,
      checked_at = datetime('now')
  `);
  // Un seul passage du filet par offre scrapée : le décodage d'entités n'est pas
  // idempotent (« &amp;lt; » → « &lt; » → « < »).
  const c = sanitizeScrapedOffre(o, source);
  stmt.run({
    source,
    source_id: c.source_id,
    url: c.url,
    title: c.title,
    company: c.company,
    country: c.country,
    location: c.location,
    canton: isSwissOffer(c.country) ? resolveSwissCanton(o.canton, c.location) : null,
    contract_type: c.contract_type,
    salary: c.salary,
    description_html: c.description_html,
    description_text: c.description_text,
    description_status: o.description_status,
    posted_at: o.posted_at,
    is_vie: o.is_vie ? 1 : 0,
    raw_payload: asJson(o.raw_payload),
    scrape_errors: o.scrape_errors ?? null,
    quality_issues: o.quality_issues?.length ? asJson(o.quality_issues) : null,
  });
  const row = db
    .prepare("SELECT id FROM offres WHERE source = ? AND source_id = ?")
    .get(source, o.source_id) as { id: number } | undefined;
  return row?.id ?? 0;
}

/** Une note et son détail, quelle que soit la version de la note qui l'a produite. */
export type StoredScore = Pick<ScoreResult, "score" | "reason"> & { breakdown: object };

export function setOffreScore(id: number, score: StoredScore) {
  getDb()
    .prepare("UPDATE offres SET score = ?, score_breakdown = ? WHERE id = ?")
    .run(score.score, asJson({ ...score.breakdown, reason: score.reason }), id);
}

export function setOffreReview(id: number, review: AiReview) {
  getDb().prepare("UPDATE offres SET ai_review = ? WHERE id = ?").run(asJson(review), id);
}

export function listOffres(opts?: {
  targetCountries?: string[];
  country?: string;
  source?: string;
  vieOnly?: boolean;
  minScore?: number;
}): OffreFiltered[] {
  ensureOffresRepaired();
  const db = getDb();
  const conds: string[] = [];
  const params: any[] = [];
  const inCountry = countryMatcher(opts?.country ? [opts.country] : []);
  const inTargets = countryMatcher(opts?.targetCountries ?? []);
  if (opts?.source) {
    conds.push("source = ?");
    params.push(opts.source);
  }
  if (opts?.vieOnly) conds.push("is_vie = 1");
  if (opts?.minScore != null) {
    conds.push("score >= ?");
    params.push(opts.minScore);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT o.*,
        EXISTS(SELECT 1 FROM documents WHERE offre_id = o.id AND type = 'cv') AS has_cv,
        EXISTS(SELECT 1 FROM documents WHERE offre_id = o.id AND type = 'lm') AS has_lm,
        EXISTS(SELECT 1 FROM documents WHERE offre_id = o.id AND type = 'msg') AS has_msg
       FROM offres o
       ${where}
       ORDER BY ${SMART_ORDER}`
    )
    .all(...params) as any[];

  return rows.filter((r) => inTargets(r.country) && inCountry(r.country)).map((r) => ({
    ...r,
    score_breakdown: parseJson(r.score_breakdown, null),
    ai_review: parseJson(r.ai_review, null),
    quality_issues: parseJson(r.quality_issues, null),
    has_cv: !!r.has_cv,
    has_lm: !!r.has_lm,
    has_msg: !!r.has_msg,
    contract_category: classifyContract({
      contract_type: r.contract_type,
      title: r.title,
      description_text: r.description_text,
      is_vie: r.is_vie,
      source: r.source,
      url: r.url,
    }),
  }));
}

export function getOffre(id: number): OffreFiltered | null {
  ensureOffresRepaired();
  const db = getDb();
  const r = db
    .prepare(
      `SELECT o.*,
        EXISTS(SELECT 1 FROM documents WHERE offre_id = o.id AND type = 'cv') AS has_cv,
        EXISTS(SELECT 1 FROM documents WHERE offre_id = o.id AND type = 'lm') AS has_lm,
        EXISTS(SELECT 1 FROM documents WHERE offre_id = o.id AND type = 'msg') AS has_msg
       FROM offres o WHERE id = ?`
    )
    .get(id) as any;
  if (!r) return null;
  return {
    ...r,
    score_breakdown: parseJson(r.score_breakdown, null),
    ai_review: parseJson(r.ai_review, null),
    quality_issues: parseJson(r.quality_issues, null),
    has_cv: !!r.has_cv,
    has_lm: !!r.has_lm,
    has_msg: !!r.has_msg,
    contract_category: classifyContract({
      contract_type: r.contract_type,
      title: r.title,
      description_text: r.description_text,
      is_vie: r.is_vie,
      source: r.source,
      url: r.url,
    }),
  };
}

export function offresCounts() {
  syncDuplicates();
  const db = getDb();
  const profile = getProfile();
  const inProfile = countryMatcher(profile?.target_countries ?? []);
  const rows = (db.prepare(`SELECT country, location, canton, json_extract(CASE WHEN json_valid(raw_payload) THEN raw_payload ELSE '{}' END, '$.department') AS department, is_vie, date(posted_at) = date('now') AS today FROM offres WHERE ${visibleSql()}`).all() as { country: string | null; location: string | null; canton: string | null; department: string | null; is_vie: number; today: number | null }[])
    .filter((row) => inProfile(row.country) && matchesSearchAreas(row, profile?.search_areas, profile?.include_unknown_locations));
  const total = rows.length;
  const today = rows.filter((row) => row.today).length;
  // Colonne is_vie figée au scan : pour un chiffre qui corresponde à /offres?vie=1,
  // lire searchOffres().facets.contractCounts.vie (page /offres) ou vieFigure() (accueil).
  const vie = rows.filter((row) => row.is_vie).length;
  return { total, today, vie };
}
