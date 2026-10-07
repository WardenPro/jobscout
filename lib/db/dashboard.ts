import "server-only";
import { getDb } from "./index";
import { detectVie } from "@/lib/vie";
import { getProfile } from "./queries";
import { countryMatcher } from "@/lib/countries";

// Requêtes propres à l'accueil. Les chiffres affichés doivent concorder avec la page
// vers laquelle chaque carte renvoie : on réutilise donc les mêmes règles que la liste.

const RECENT_DAYS = 7;

export type DashboardFigure = { total: number; recent: number };

// « Récente » = publiée depuis RECENT_DAYS jours ou moins, calculé par SQLite pour les deux cartes.
const RECENT_SQL = `(posted_at IS NOT NULL AND julianday('now') - julianday(posted_at) <= ${RECENT_DAYS})`;

/**
 * V.I.E : même détection que la catégorie de contrat « vie » de la liste des offres
 * (`classifyContract` commence par `detectVie`), pas l'ancienne colonne `is_vie`,
 * pour que le chiffre de la carte corresponde à /offres?vie=1.
 * `detectVie` ne lit que les 4 000 premiers caractères de la description.
 */
export function vieFigure(): DashboardFigure {
  const rows = getDb()
    .prepare(`SELECT country, source, url, title, substr(description_text, 1, 4000) AS description, ${RECENT_SQL} AS recent FROM offres`)
    .all() as { country: string | null; source: string; url: string | null; title: string | null; description: string | null; recent: number }[];
  const inProfile = countryMatcher(getProfile()?.target_countries ?? []);
  let total = 0;
  let recent = 0;
  for (const row of rows) {
    if (!inProfile(row.country) || !detectVie(row)) continue;
    total++;
    if (row.recent) recent++;
  }
  return { total, recent };
}

/** Offres dont le score atteint `threshold` (70 par défaut). */
export function highScoreFigure(threshold = 70): DashboardFigure {
  const inProfile = countryMatcher(getProfile()?.target_countries ?? []);
  const rows = getDb()
    .prepare(
      `SELECT country, ${RECENT_SQL} AS recent
       FROM offres WHERE score >= ?`
    )
    .all(threshold) as { country: string | null; recent: number }[];
  const scoped = rows.filter(row => inProfile(row.country));
  return { total: scoped.length, recent: scoped.filter(row => row.recent).length };
}

/** Nombre d'offres qui ne sont pas encore dans le suivi des candidatures. */
export function untrackedOffresCount(): number {
  const inProfile = countryMatcher(getProfile()?.target_countries ?? []);
  return (getDb().prepare("SELECT country FROM offres o WHERE NOT EXISTS(SELECT 1 FROM candidatures c WHERE c.offre_id = o.id)").all() as { country: string | null }[])
    .filter(row => inProfile(row.country)).length;
}
