import "server-only";
import { getDb, asJson, parseJson } from "./index";
import type { ScrapedOffre } from "@/lib/scrapers/base";
import type { ScoreResult } from "@/lib/ai/score-offre";
import { classifyContract, CONTRACT_ORDER, type ContractCategory } from "@/lib/contracts";

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
    reason?: string;
  } | null;
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

export type OffreSummary = Pick<
  OffreFiltered,
  "id" | "source" | "url" | "title" | "company" | "country" | "location" |
  "posted_at" | "score" | "is_vie" | "description_status" | "contract_category" |
  "has_cv" | "has_lm"
> & {
  description_text: string;
  score_reason: string | null;
};

export type OffersSearch = {
  offers: OffreSummary[];
  total: number;
  pageSize: number;
  facets: {
    total: number;
    countries: string[];
    sources: string[];
    contractCounts: Record<ContractCategory, number>;
    hasVie: boolean;
  };
};

const OFFER_PAGE_SIZE = 24;
// Même classement pour la liste, l’API paginée et les suggestions de l’accueil.
// Le bonus de fraîcheur reste volontairement léger face au score du profil.
const SMART_ORDER = `score + CASE
  WHEN posted_at IS NULL THEN 0
  WHEN julianday('now') - julianday(posted_at) <= 1 THEN 6
  WHEN julianday('now') - julianday(posted_at) <= 3 THEN 4
  WHEN julianday('now') - julianday(posted_at) <= 7 THEN 2
  ELSE 0
END DESC, score DESC, posted_at DESC`;

function normalizeSearch(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

type SearchRow = Pick<
  OffreRow,
  "id" | "source" | "url" | "title" | "company" | "country" | "location" |
  "contract_type" | "description_text" | "description_status" | "posted_at" |
  "score" | "is_vie"
> & { score_breakdown: string | null; has_cv: number; has_lm: number; contract_category: ContractCategory };

/** Filtrage côté serveur : seules les cartes de la page courante sont envoyées au navigateur. */
export function searchOffres(opts: {
  query?: string;
  source?: string;
  country?: string;
  contracts?: ContractCategory[];
  minScore?: boolean;
  vieOnly?: boolean;
  sortBy?: "smart" | "newest" | "score";
  page?: number;
} = {}): OffersSearch {
  const rows = getDb().prepare(`
    SELECT o.id, o.source, o.url, o.title, o.company, o.country, o.location,
      o.contract_type, o.description_text, o.description_status, o.posted_at,
      o.score, o.score_breakdown, o.is_vie,
      EXISTS(SELECT 1 FROM documents WHERE offre_id = o.id AND type = 'cv') AS has_cv,
      EXISTS(SELECT 1 FROM documents WHERE offre_id = o.id AND type = 'lm') AS has_lm
    FROM offres o ORDER BY ${SMART_ORDER}
  `).all() as SearchRow[];

  const contractCounts = Object.fromEntries(CONTRACT_ORDER.map((contract) => [contract, 0])) as Record<ContractCategory, number>;
  const countries = new Set<string>();
  const sources = new Set<string>();
  let hasVie = false;
  for (const row of rows) {
    row.contract_category = classifyContract(row);
    contractCounts[row.contract_category]++;
    if (row.country) countries.add(row.country);
    sources.add(row.source);
    if (row.is_vie) hasVie = true;
  }

  const query = normalizeSearch((opts.query ?? "").trim());
  const contracts = new Set(opts.contracts ?? []);
  const filtered = rows.filter((row) => {
    if (query && !normalizeSearch([row.title, row.company, row.country, row.location, row.description_text].filter(Boolean).join(" ")).includes(query)) return false;
    if (opts.source && row.source !== opts.source) return false;
    if (opts.country && row.country !== opts.country) return false;
    if (contracts.size && !contracts.has(row.contract_category)) return false;
    if (opts.minScore && (row.score ?? 0) < 60) return false;
    if (opts.vieOnly && !row.is_vie) return false;
    return true;
  });

  if (opts.sortBy === "score") filtered.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  if (opts.sortBy === "newest") filtered.sort((a, b) => (b.posted_at ?? "").localeCompare(a.posted_at ?? ""));
  const page = Math.max(1, Math.min(10000, Math.trunc(opts.page ?? 1) || 1));
  const visible = filtered.slice((page - 1) * OFFER_PAGE_SIZE, page * OFFER_PAGE_SIZE);
  return {
    offers: visible.map((row) => ({
      id: row.id, source: row.source, url: row.url, title: row.title,
      company: row.company, country: row.country, location: row.location,
      posted_at: row.posted_at, score: row.score, is_vie: row.is_vie,
      description_status: row.description_status,
      description_text: row.description_text.slice(0, 1000),
      score_reason: parseJson<{ reason?: string } | null>(row.score_breakdown, null)?.reason ?? null,
      contract_category: row.contract_category,
      has_cv: !!row.has_cv, has_lm: !!row.has_lm,
    })),
    total: filtered.length,
    pageSize: OFFER_PAGE_SIZE,
    facets: {
      total: rows.length,
      countries: [...countries].sort((a, b) => a.localeCompare(b, "fr")),
      sources: [...sources].sort(), contractCounts, hasVie,
    },
  };
}

/** Les six premières suggestions suffisent au tableau de bord. */
export function suggestedOffres(limit: number, untracked = false): Pick<OffreRow, "id" | "title" | "company" | "country" | "location" | "posted_at" | "score">[] {
  return getDb().prepare(`
    SELECT o.id, o.title, o.company, o.country, o.location, o.posted_at, o.score
    FROM offres o
    ${untracked ? "WHERE NOT EXISTS(SELECT 1 FROM candidatures c WHERE c.offre_id = o.id)" : ""}
    ORDER BY ${SMART_ORDER} LIMIT ?
  `).all(Math.max(1, Math.min(20, Math.trunc(limit)))) as Pick<OffreRow, "id" | "title" | "company" | "country" | "location" | "posted_at" | "score">[];
}

// Filet de sécurité anti-mojibake : répare l'UTF-8 double-décodé (é→Ã©, ’→â€™…)
// quelle que soit la source. Signatures fiables uniquement — "Ã" suivi d'un
// caractère de continuation n'existe pas en français légitime.
const MOJIBAKE_RE = /Ã[©¨§ª«»¢€‚„¯´¹]|â€™|â€“|â€œ|â€|Ã‰|Ã€|Ã‡|Ã”|Ã‚|Â[«»°€œ]/;

export function fixMojibake(s: string | null): string | null {
  if (!s || !MOJIBAKE_RE.test(s)) return s;
  try {
    const repaired = Buffer.from(s, "latin1").toString("utf8");
    // On n'accepte la réparation que si elle n'introduit pas de caractère de
    // remplacement (perte) et qu'elle réduit bien les signatures mojibake.
    if (!repaired.includes("�") && !MOJIBAKE_RE.test(repaired)) return repaired;
  } catch {}
  return s;
}

export function upsertOffreFromSource(source: string, o: ScrapedOffre): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO offres (source, source_id, url, title, company, country, location, contract_type, salary,
      description_html, description_text, description_status, posted_at, is_vie, raw_payload, scrape_errors)
    VALUES (@source, @source_id, @url, @title, @company, @country, @location, @contract_type, @salary,
      @description_html, @description_text, @description_status, @posted_at, @is_vie, @raw_payload, @scrape_errors)
    ON CONFLICT(source, source_id) DO UPDATE SET
      url = excluded.url,
      title = excluded.title,
      company = excluded.company,
      country = excluded.country,
      location = excluded.location,
      contract_type = excluded.contract_type,
      salary = excluded.salary,
      description_html = excluded.description_html,
      description_text = excluded.description_text,
      description_status = excluded.description_status,
      posted_at = excluded.posted_at,
      is_vie = excluded.is_vie,
      raw_payload = excluded.raw_payload,
      scrape_errors = excluded.scrape_errors,
      scraped_at = datetime('now')
  `);
  stmt.run({
    source,
    source_id: o.source_id,
    url: o.url,
    title: fixMojibake(o.title) ?? o.title,
    company: fixMojibake(o.company) ?? o.company,
    country: fixMojibake(o.country),
    location: fixMojibake(o.location),
    contract_type: fixMojibake(o.contract_type),
    salary: fixMojibake(o.salary),
    description_html: fixMojibake(o.description_html) ?? o.description_html,
    description_text: fixMojibake(o.description_text) ?? o.description_text,
    description_status: o.description_status,
    posted_at: o.posted_at,
    is_vie: o.is_vie ? 1 : 0,
    raw_payload: asJson(o.raw_payload),
    scrape_errors: o.scrape_errors ?? null,
  });
  const row = db
    .prepare("SELECT id FROM offres WHERE source = ? AND source_id = ?")
    .get(source, o.source_id) as { id: number } | undefined;
  return row?.id ?? 0;
}

export function setOffreScore(id: number, score: ScoreResult) {
  getDb()
    .prepare("UPDATE offres SET score = ?, score_breakdown = ? WHERE id = ?")
    .run(score.score, asJson({ ...score.breakdown, reason: score.reason }), id);
}

export function listOffres(opts?: {
  country?: string;
  source?: string;
  vieOnly?: boolean;
  minScore?: number;
}): OffreFiltered[] {
  const db = getDb();
  const conds: string[] = [];
  const params: any[] = [];
  if (opts?.country) {
    conds.push("country = ?");
    params.push(opts.country);
  }
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

  return rows.map((r) => ({
    ...r,
    score_breakdown: parseJson(r.score_breakdown, null),
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
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) as c FROM offres").get() as { c: number }).c;
  const today = (
    db.prepare("SELECT COUNT(*) as c FROM offres WHERE date(posted_at) = date('now')").get() as {
      c: number;
    }
  ).c;
  const vie = (db.prepare("SELECT COUNT(*) as c FROM offres WHERE is_vie = 1").get() as { c: number }).c;
  return { total, today, vie };
}
