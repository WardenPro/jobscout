import type { ProfileFull } from "@/lib/cv/types";
import { DEPARTEMENTS, REGIONS, parseSearchArea, type SearchArea } from "@/lib/geo/fr";
import { frenchTitle, rewriteTitle } from "./query-rewrite";

/**
 * Ce qu'un scan cherche, déduit du profil. Partagé entre le serveur (le scan)
 * et l'interface (l'aperçu « Le prochain scan cherchera… » de la page Profil).
 *
 * Les requêtes sont les POSTES VISÉS. Avant, chaque source cherchait les cases
 * « secteur » (« tech », « services »…) : toutes les offres trouvées
 * contenaient ces mots, sans rapport avec le métier recherché. Les secteurs ne
 * servent plus de requête que lorsque le profil n'a ni poste visé ni
 * expérience ; ils restent des mots-clés pour la note.
 *
 * Chaque intitulé est réécrit avant d'être envoyé (voir query-rewrite.ts), et
 * un intitulé anglais reçoit sa traduction quand la France fait partie des
 * pays visés : « Mechanical Design Engineer » ne trouvait qu'une offre sur
 * France Travail pour un métier courant à Toulouse.
 */

/** Au-delà, un scan s'allonge sans élargir beaucoup la recherche. */
export const MAX_QUERIES = 4;

const TRAINEE = /stag|intern|altern|apprenti|apprentice|trainee/i;

export type SearchPlan = {
  queries: string[];
  /** D'où viennent les requêtes, pour l'expliquer à l'utilisateur. */
  origin: "postes_vises" | "experiences" | "secteurs" | "aucune";
  /** Zone de recherche en France ; null = tout le pays. */
  area: SearchArea | null;
};

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values.map((x) => x.trim()).filter(Boolean)) {
    const key = v.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}

type PlanProfile = Pick<ProfileFull, "target_titles" | "experiences" | "sectors" | "search_area"> & {
  target_countries?: string[] | null;
  search_areas?: { country: "FR" | "CH"; kind: "city" | "canton" | "region" | "department"; value: string }[];
  job_suggestions?: { title: string }[];
};

/**
 * Zone France du fork : `search_area` (ancien réglage) ou la première zone
 * française département/région de `search_areas`. Les zones ville restent
 * couvertes par le filtre géographique, pas par le paramètre de la source.
 */
export function profileFranceArea(profile: Pick<PlanProfile, "search_area" | "search_areas">): SearchArea | null {
  const legacy = parseSearchArea(profile.search_area);
  if (legacy) return legacy;
  const area = (profile.search_areas ?? []).find(
    (a) => a.country === "FR" && (a.kind === "department" || a.kind === "region")
  );
  if (!area) return null;
  if (area.kind === "department") {
    const found = DEPARTEMENTS.find((d) => d.code === area.value);
    return found ? { kind: "departement", code: found.code, name: found.name } : null;
  }
  const found = REGIONS.find((r) => r.code === area.value);
  return found ? { kind: "region", code: found.code, name: found.name } : null;
}

export function buildSearchPlan(profile: PlanProfile): SearchPlan {
  const area = profileFranceArea(profile);
  const france = !profile.target_countries?.length || profile.target_countries.some((c) => c.trim().toLowerCase() === "france");
  const savedTitles = unique(profile.target_titles ?? []);
  const suggestedTitles = unique((profile.job_suggestions ?? []).map((s) => s.title));
  const titles = savedTitles.length ? savedTitles : suggestedTitles;
  if (titles.length) return { queries: toQueries(titles, france).slice(0, MAX_QUERIES), origin: "postes_vises", area };
  // Sans poste visé : les intitulés des expériences récentes, hors stages et alternances.
  const past = unique(profile.experiences.map((e) => e.title).filter((t) => t && !TRAINEE.test(t))).slice(0, 2);
  if (past.length) return { queries: toQueries(past, france).slice(0, MAX_QUERIES), origin: "experiences", area };
  const sectors = unique(profile.sectors ?? []);
  if (sectors.length) return { queries: sectors.slice(0, MAX_QUERIES), origin: "secteurs", area };
  return { queries: [], origin: "aucune", area };
}

/** Intitulés réécrits, chacun suivi de sa traduction française s'il est anglais. */
function toQueries(titles: string[], france: boolean): string[] {
  return unique(
    titles.flatMap((title) => {
      const rewritten = rewriteTitle(title);
      const french = france ? frenchTitle(rewritten[0]) : null;
      return french ? [...rewritten, french] : rewritten;
    })
  );
}

/**
 * Part de chaque requête dans le quota d'une source : sans elle, la première
 * requête remplissait tout le quota et les postes suivants n'étaient jamais
 * cherchés.
 */
export function quotaPerQuery(max: number, queryCount: number): number {
  return Math.max(1, Math.ceil(max / Math.max(1, queryCount)));
}
