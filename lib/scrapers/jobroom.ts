import "server-only";
import type { Scraper, ScrapedOffre, ScrapeCriteria, ProgressEvent } from "./base";
import { htmlToText } from "./base";
import { detectVie } from "@/lib/vie";
import { nameToCode } from "@/lib/countries";
import { getDb } from "@/lib/db";
import { BROWSER_HEADERS, sleep } from "./dom";
import { formatGrades } from "./jobcloud";

const SOURCE = "jobroom";
const BASE = "https://www.job-room.ch";

// Job-Room (travail.swiss, SECO) : le service public suisse de l'emploi.
//
// Structure (vérifiée octobre 2026) : application Angular qui interroge, sans
// compte, la même API que JobScout :
// - Recherche : POST /jobadservice/api/jobAdvertisements/_search?page=N&size=…&sort=date_desc&_ng=ZnI=
//   (`_ng` = « fr » en base64), corps { keywords, onlineSince, cantonCodes… }.
//   Total dans l'en-tête X-Total-Count. Descriptions tronquées et surlignées (<em>).
// - Détail : GET /jobadservice/api/jobAdvertisements/{id} — description complète, en Markdown.
// - Page publique : /job-search/{id}.
// La plupart des annonces sont reprises d'autres sites (externalUrl : jobup.ch, jobs.ch,
// jobscout24.ch, sites d'employeurs et de cantons) ; celles de jobup.ch / jobs.ch gardent
// leur UUID dans externalReference, ce qui permet d'éviter les doublons.

const PAGE_SIZE = 50;
const JOBCLOUD_HOSTS: Record<string, string> = { "www.jobup.ch": "jobup", "www.jobs.ch": "jobsch" };

type JobDescription = { languageIsoCode?: string | null; title?: string | null; description?: string | null };

export type JobAd = {
  id: string;
  externalReference?: string | null;
  stellennummerEgov?: string | null;
  sourceSystem?: string | null;
  publication?: { startDate?: string | null } | null;
  jobContent?: {
    externalUrl?: string | null;
    jobDescriptions?: JobDescription[] | null;
    company?: { name?: string | null } | null;
    employment?: {
      permanent?: boolean | null;
      shortEmployment?: boolean | null;
      workloadPercentageMin?: string | number | null;
      workloadPercentageMax?: string | number | null;
    } | null;
    location?: { city?: string | null; cantonCode?: string | null } | null;
  } | null;
};

const stripEm = (s: string) => s.replace(/<\/?em>/g, "");

function pickDescription(ad: JobAd): JobDescription {
  const all = ad.jobContent?.jobDescriptions ?? [];
  return all.find((d) => d.languageIsoCode === "fr") ?? all.find((d) => d.languageIsoCode === "en") ?? all[0] ?? {};
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Markdown des annonces → HTML simple (titres, listes, paragraphes, gras).
 * Les annonces reprises d'autres sites commencent souvent par un en-tête
 * technique (« --- base: … meta-viewport: … --- ») et doublent les échappements.
 */
export function markdownToHtml(md: string): string {
  const text = stripEm(md)
    .replace(/^\s*---\s*(?:base|meta|title)[\s\S]*?---/, "")
    .replace(/\\+([\\`*_{}[\]()#+\-.!|>~&])/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\r\n?/g, "\n")
    // Annonces de jobup.ch aplaties sur une ligne : « Titre ===== Texte » → paragraphe.
    .replace(/[ \t]+(?:={3,}|-{3,})[ \t]+/g, "\n\n")
    .replace(/\u00a0/g, " ");
  const inline = (s: string) =>
    escapeHtml(s.trim())
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*+/g, "");

  const out: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list.length) out.push(`<ul>${list.map((l) => `<li>${inline(l)}</li>`).join("")}</ul>`);
    list = [];
  };
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const next = (lines[i + 1] ?? "").trim();
    if (!line) {
      flushPara();
      flushList();
    } else if (/^(=+|-{3,})$/.test(next) && !/^[-*•]\s/.test(line)) {
      // Titre souligné (« Titre\n===== »)
      flushPara();
      flushList();
      out.push(`<h3>${inline(line)}</h3>`);
      i++;
    } else if (/^#{1,6}\s/.test(line)) {
      flushPara();
      flushList();
      out.push(`<h3>${inline(line.replace(/^#+\s*|\s*#+$/g, ""))}</h3>`);
    } else if (/^([-*•·]|\d+[.)])\s+/.test(line)) {
      flushPara();
      const item = line.replace(/^([-*•·]|\d+[.)])\s+/, "");
      if (item) list.push(item);
    } else if (/^(=+|-{3,})$/.test(line)) {
      // séparateur isolé
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return out.join("\n");
}

function contractLabel(ad: JobAd): string | null {
  const e = ad.jobContent?.employment;
  const kind = e?.permanent === true ? "Durée indéterminée" : e?.permanent === false ? "Durée déterminée" : null;
  const grades = [e?.workloadPercentageMin, e?.workloadPercentageMax]
    .map((g) => Number(g))
    .filter((g) => Number.isFinite(g) && g > 0);
  return [kind, formatGrades(grades)].filter(Boolean).join(" · ") || null;
}

export function adToOffre(ad: JobAd): ScrapedOffre {
  const d = pickDescription(ad);
  const description_html = d.description ? markdownToHtml(d.description) : "";
  const description_text = description_html ? htmlToText(description_html) : "";
  const ok = description_text.length >= 100;
  const title = stripEm(d.title ?? "").trim() || "Offre Job-Room";
  const url = `${BASE}/job-search/${ad.id}`;
  return {
    source_id: ad.id,
    url,
    title,
    company: ad.jobContent?.company?.name?.trim() ?? "",
    country: "Suisse",
    location: ad.jobContent?.location?.city?.trim() || null,
    contract_type: contractLabel(ad),
    salary: null,
    description_html,
    description_text,
    description_status: ok ? "ok" : "failed",
    posted_at: ad.publication?.startDate ? String(ad.publication.startDate).slice(0, 10) : null,
    is_vie: detectVie({ source: SOURCE, title, description: description_text, url }),
    // Champs structurés de contact exclus ; la description peut contenir des coordonnées.
    raw_payload: {
      id: ad.id,
      stellennummerEgov: ad.stellennummerEgov ?? null,
      sourceSystem: ad.sourceSystem ?? null,
      externalUrl: ad.jobContent?.externalUrl ?? null,
    },
    scrape_errors: ok ? undefined : "description introuvable",
  };
}

async function search(keywords: string, page: number): Promise<JobAd[]> {
  const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE), sort: "date_desc", _ng: "ZnI=" });
  const res = await fetch(`${BASE}/jobadservice/api/jobAdvertisements/_search?${params}`, {
    method: "POST",
    headers: { ...BROWSER_HEADERS, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      workloadPercentageMin: 10,
      workloadPercentageMax: 100,
      permanent: null,
      companyName: null,
      onlineSince: 60,
      displayRestricted: false,
      professionCodes: [],
      keywords: keywords ? [keywords] : [],
      communalCodes: [],
      cantonCodes: [],
    }),
  });
  if (!res.ok) throw new Error(`Job-Room HTTP ${res.status}`);
  const body = (await res.json()) as { jobAdvertisement?: JobAd }[];
  return Array.isArray(body) ? body.map((r) => r.jobAdvertisement).filter((a): a is JobAd => !!a?.id) : [];
}

async function fetchDetail(id: string): Promise<JobAd | null> {
  const res = await fetch(`${BASE}/jobadservice/api/jobAdvertisements/${id}`, {
    headers: { ...BROWSER_HEADERS, accept: "application/json" },
  });
  return res.ok ? ((await res.json()) as JobAd) : null;
}

/** Annonces reprises de jobup.ch / jobs.ch et déjà enregistrées depuis ces sources. */
function alreadyFromJobCloud(ads: JobAd[]): Set<string> {
  const db = getDb();
  const stmt = db.prepare("SELECT 1 FROM offres WHERE source = ? AND source_id = ? AND description_status = 'ok'");
  const known = new Set<string>();
  for (const ad of ads) {
    let host = "";
    try {
      host = new URL(ad.jobContent?.externalUrl ?? "").host;
    } catch {
      continue;
    }
    const source = JOBCLOUD_HOSTS[host];
    if (source && ad.externalReference && stmt.get(source, ad.externalReference)) known.add(ad.id);
  }
  return known;
}

export const jobroomScraper: Scraper = {
  name: SOURCE,
  async *scrape(criteria: ScrapeCriteria, onEvent: (e: ProgressEvent) => void) {
    onEvent({ kind: "start", source: SOURCE });

    const wantsSwitzerland =
      !criteria.countries.length || criteria.countries.some((c) => nameToCode(c) === "CH");
    if (!wantsSwitzerland) {
      onEvent({ kind: "list", source: SOURCE, total: 0 });
      onEvent({ kind: "done", source: SOURCE, seen: 0, ok: 0, failed: 0 });
      return;
    }

    const max = criteria.maxOffres ?? 80;
    const queries = criteria.sectors.length ? criteria.sectors : [""];
    const seen = new Map<string, JobAd>();

    for (const q of queries) {
      for (let page = 0; page < 3 && seen.size < max; page++) {
        try {
          const ads = await search(q, page);
          for (const a of ads) if (!seen.has(a.id)) seen.set(a.id, a);
          if (ads.length < PAGE_SIZE) break;
          await sleep(1200);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          const error = new Error(`Job-Room : recherche impossible (page ${page + 1}) : ${message}`, { cause: e });
          if (!seen.size) throw error;
          // Conserver les offres déjà collectées et poursuivre les autres recherches.
          onEvent({ kind: "error", source: SOURCE, message: error.message });
          break;
        }
      }
      if (seen.size >= max) break;
    }

    const known = alreadyFromJobCloud(Array.from(seen.values()));
    const ads = Array.from(seen.values())
      .filter((a) => !known.has(a.id))
      .slice(0, max);
    onEvent({ kind: "list", source: SOURCE, total: ads.length });

    let ok = 0;
    let failed = 0;
    let consecutiveFails = 0;
    for (let i = 0; i < ads.length; i++) {
      let ad = ads[i];
      let detailError: string | null = null;
      try {
        const detail = await fetchDetail(ad.id);
        if (detail) ad = detail;
        else detailError = "fiche détaillée indisponible";
      } catch (e) {
        detailError = e instanceof Error ? e.message : String(e);
      }
      const offre = adToOffre(ad);
      if (detailError) {
        offre.description_status = offre.description_text ? "partial" : "failed";
        offre.scrape_errors = `Description de recherche uniquement : ${detailError}`;
      }
      yield offre;
      if (offre.description_status === "ok") {
        ok++;
        consecutiveFails = 0;
      } else {
        failed++;
        consecutiveFails++;
      }
      onEvent({ kind: "offre", source: SOURCE, index: i + 1, total: ads.length, status: offre.description_status === "ok" ? "ok" : "failed" });
      if (consecutiveFails >= 10) break;
      await sleep(600 + Math.random() * 500);
    }
    onEvent({ kind: "done", source: SOURCE, seen: ads.length, ok, failed });
  },
};
