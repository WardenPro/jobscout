import "server-only";
import type { Scraper, ScrapedOffre, ScrapeCriteria, ProgressEvent } from "./base";
import { htmlToText } from "./base";
import { detectVie } from "@/lib/vie";
import { nameToCode } from "@/lib/countries";
import { getDb } from "@/lib/db";
import { resolveSwissCanton } from "@/lib/swiss-geography";
import { sourceFetch } from "./source-fetch";
import {
  parseDocument,
  firstMatchHtml,
  largestTextBlockHtml,
  extractJobPostingLd,
  BROWSER_HEADERS,
  sleep,
} from "./dom";

// jobup.ch (Suisse romande) et jobs.ch (toute la Suisse) : deux sites du groupe
// JobCloud, même application, mêmes identifiants d'offre (UUID).
//
// Structure (vérifiée octobre 2026) :
// - Recherche : /fr/emplois/?term=…&page=N (jobup) ou /fr/offres-emplois/?term=…&page=N
//   (jobs.ch), rendue côté serveur. L'état de la page est sérialisé dans
//   `__INIT__ = {…}` : vacancy.results.main.results (≈ 20 offres par page) et
//   vacancy.results.main.meta.numPages.
// - Détail : {prefix}/detail/{uuid}/ — JSON-LD JobPosting complet (description HTML,
//   employmentType « Durée indéterminée », workHours, baseSalary en CHF, addressCountry « CH »).
// Le robots.txt exclut /api/ : on ne charge que les pages HTML publiques.

type Site = {
  id: string;
  label: string;
  host: string;
  /** Chemin des listes d'offres en français, sans barre finale. */
  prefix: string;
  /** Site jumeau : une offre publiée sur les deux garde le même UUID. */
  sibling: string;
};

type Card = {
  id: string;
  url: string;
  title: string;
  company: string;
  place: string | null;
  /** Taux d'activité, ex. [80, 100]. */
  grades: number[];
};

type InitVacancy = {
  id?: unknown;
  title?: unknown;
  place?: unknown;
  company?: { name?: unknown } | null;
  employmentGrades?: unknown;
};

const DETAIL_SELECTORS = [
  '[data-cy="vacancy-description"]',
  '[itemprop="description"]',
  "article",
];

// Ne garde que la partie JSON de « __INIT__ = {…} » : le décodage s'arrête à
// l'accolade fermante correspondante, quel que soit le script qui suit.
export function extractInitState(html: string): Record<string, any> | null {
  const m = /__INIT__\s*=\s*\{/.exec(html);
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  let depth = 0;
  let inString = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function parseSearchPage(html: string, site: Site): { cards: Card[]; numPages: number } {
  const state = extractInitState(html);
  const main = state?.vacancy?.results?.main;
  const results: InitVacancy[] = Array.isArray(main?.results) ? main.results : [];
  const cards: Card[] = [];
  for (const r of results) {
    const id = typeof r.id === "string" ? r.id : "";
    const title = typeof r.title === "string" ? r.title.trim() : "";
    if (!id || !title) continue;
    cards.push({
      id,
      url: `https://${site.host}${site.prefix}/detail/${id}/`,
      title,
      company: typeof r.company?.name === "string" ? r.company.name.trim() : "",
      place: typeof r.place === "string" && r.place.trim() ? r.place.trim() : null,
      grades: Array.isArray(r.employmentGrades)
        ? r.employmentGrades.filter((g): g is number => typeof g === "number")
        : [],
    });
  }
  const numPages = Number(main?.meta?.numPages) || 1;
  return { cards, numPages };
}

/** « 80 – 100 % », « 100 % » — affiché avec le contrat, notion centrale en Suisse. */
export function formatGrades(grades: number[]): string | null {
  if (!grades.length) return null;
  const min = Math.min(...grades);
  const max = Math.max(...grades);
  return min === max ? `${max} %` : `${min} – ${max} %`;
}

async function fetchSearchPage(site: Site, keywords: string, page: number) {
  const params = new URLSearchParams({ term: keywords });
  if (page > 1) params.set("page", String(page));
  const res = await sourceFetch(site.id, `https://${site.host}${site.prefix}/?${params}`, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`${site.label} HTTP ${res.status}`);
  return parseSearchPage(await res.text(), site);
}

async function fetchDetail(site: Site, card: Card): Promise<ScrapedOffre> {
  let descHtml: string | null = null;
  let ld: ReturnType<typeof extractJobPostingLd> = null;
  try {
    const res = await sourceFetch(site.id, card.url, { headers: BROWSER_HEADERS });
    if (res.ok) {
      const doc = parseDocument(await res.text());
      ld = extractJobPostingLd(doc);
      descHtml = ld?.description_html ?? firstMatchHtml(doc, DETAIL_SELECTORS, 200) ?? largestTextBlockHtml(doc, 300);
    }
  } catch {
    // description indisponible — statut failed ci-dessous
  }

  const description_html = descHtml ?? "";
  const description_text = descHtml ? htmlToText(descHtml) : "";
  const ok = description_text.length >= 100;
  const grades = formatGrades(card.grades);
  const contract = [ld?.contract_type, grades].filter(Boolean).join(" · ") || null;
  const title = card.title || ld?.title || `Offre ${site.label}`;
  return {
    source_id: card.id,
    url: card.url,
    title,
    company: card.company || ld?.company || "",
    country: "Suisse",
    location: card.place ?? ld?.locality ?? null,
    canton: resolveSwissCanton(ld?.region, card.place ?? ld?.locality),
    contract_type: contract,
    salary: ld?.salary ?? null,
    description_html,
    description_text,
    description_status: ok ? "ok" : "failed",
    posted_at: ld?.posted_at ? String(ld.posted_at).slice(0, 10) : null,
    is_vie: detectVie({ source: site.id, title, description: description_text, url: card.url }),
    raw_payload: { id: card.id, employmentGrades: card.grades },
    scrape_errors: ok ? undefined : "description introuvable",
  };
}


function knownOnSibling(site: Site, ids: string[]): Set<string> {
  if (!ids.length) return new Set();
  const rows = getDb()
    .prepare(`SELECT source_id FROM offres WHERE source = ? AND description_status = 'ok' AND source_id IN (${ids.map(() => "?").join(",")})`)
    .all(site.sibling, ...ids) as { source_id: string }[];
  return new Set(rows.map((r) => r.source_id));
}

function makeScraper(site: Site): Scraper {
  return {
    name: site.id,
    async *scrape(criteria: ScrapeCriteria, onEvent: (e: ProgressEvent) => void) {
      onEvent({ kind: "start", source: site.id });

      // Offres suisses uniquement : sautée si le profil cible d'autres pays sans la Suisse.
      const wantsSwitzerland =
        !criteria.countries.length || criteria.countries.some((c) => nameToCode(c) === "CH");
      if (!wantsSwitzerland) {
        onEvent({ kind: "list", source: site.id, total: 0 });
        onEvent({ kind: "done", source: site.id, seen: 0, ok: 0, failed: 0 });
        return;
      }

      const max = criteria.maxOffres ?? 50;
      const queries = criteria.sectors.length ? criteria.sectors : [""];
      const seen = new Map<string, Card>();
      let searchSucceeded = false;

      for (const [queryIndex, q] of queries.entries()) {
        for (let page = 1; page <= 3 && seen.size < max; page++) {
          try {
            const { cards, numPages } = await fetchSearchPage(site, q, page);
            searchSucceeded = true;
            if (!cards.length) break;
            for (const c of cards) if (!seen.has(c.id)) seen.set(c.id, c);
            if (page >= numPages) break;
            await sleep(1200);
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            const error = new Error(`${site.label} : recherche impossible (page ${page}) : ${message}`, { cause: e });
            // Ne déclarer la source totalement indisponible qu'après avoir essayé tous les secteurs.
            if (!searchSucceeded && queryIndex === queries.length - 1) throw error;
            // Conserver les offres déjà collectées et poursuivre les autres recherches.
            onEvent({ kind: "error", source: site.id, message: error.message });
            break;
          }
        }
        if (seen.size >= max) break;
      }

      // Une offre déjà enregistrée depuis le site jumeau n'est ni rechargée ni dupliquée.
      const known = knownOnSibling(site, Array.from(seen.keys()));
      const cards = Array.from(seen.values())
        .filter((c) => !known.has(c.id))
        .slice(0, max);
      onEvent({ kind: "list", source: site.id, total: cards.length });

      let ok = 0;
      let failed = 0;
      let consecutiveFails = 0;
      for (let i = 0; i < cards.length; i++) {
        try {
          const offre = await fetchDetail(site, cards[i]);
          yield offre;
          if (offre.description_status === "ok") {
            ok++;
            consecutiveFails = 0;
          } else {
            failed++;
            consecutiveFails++;
          }
          onEvent({
            kind: "offre",
            source: site.id,
            index: i + 1,
            total: cards.length,
            status: offre.description_status === "ok" ? "ok" : "failed",
          });
          if (consecutiveFails >= 10) break; // probable rate-limit / changement de structure
          await sleep(800 + Math.random() * 700);
        } catch {
          failed++;
          consecutiveFails++;
          onEvent({ kind: "offre", source: site.id, index: i + 1, total: cards.length, status: "failed" });
          if (consecutiveFails >= 10) break;
        }
      }
      onEvent({ kind: "done", source: site.id, seen: cards.length, ok, failed });
    },
  };
}

export const JOBUP: Site = { id: "jobup", label: "jobup.ch", host: "www.jobup.ch", prefix: "/fr/emplois", sibling: "jobsch" };
export const JOBSCH: Site = {
  id: "jobsch",
  label: "jobs.ch",
  host: "www.jobs.ch",
  prefix: "/fr/offres-emplois",
  sibling: "jobup",
};

export const jobupScraper = makeScraper(JOBUP);
export const jobschScraper = makeScraper(JOBSCH);
