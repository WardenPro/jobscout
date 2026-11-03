import type { SearchArea as GeoSearchArea } from "@/lib/geo/fr";
import type { SearchArea as ProfileSearchArea } from "@/lib/search-areas";
import { decodeHtmlEntities, decodeHtmlEntitiesDeep } from "@/lib/text/entities";
import "server-only";
import type { Browser, BrowserContext } from "playwright";
import {
  applyBrowsersPath,
  isEngineInstalled,
  ENGINE_MISSING_MESSAGE,
} from "./browser-engine";

export type ScrapedOffre = {
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
  is_vie: boolean;
  canton?: string | null;
  raw_payload: Record<string, unknown>;
  scrape_errors?: string;
  /** Rempli par le contrôle de qualité du scan, pas par les collecteurs. */
  quality_issues?: string[];
};

export type ScrapeCriteria = {
  /** Requêtes envoyées aux sources : les postes visés (voir lib/scan/search-plan.ts). */
  queries?: string[];
  /** Secteurs du profil : Civiweb s'en sert comme filtre ; les autres sources cherchent `queries`. */
  sectors: string[];
  countries: string[];
  /** Zone de recherche en France ; null = tout le pays. Appliquée par les sources qui la vérifient. */
  area?: GeoSearchArea | null;
  /** Zones du profil (France et Suisse) : filtre géographique du fork suisse. */
  search_areas?: ProfileSearchArea[];
  include_unknown_locations?: boolean;
  maxOffres?: number;
};

export type ProgressEvent =
  | { kind: "error"; source: string; message: string }
  | { kind: "start"; source: string }
  | { kind: "list"; source: string; total: number }
  | { kind: "offre"; source: string; index: number; total: number; status: "ok" | "failed" }
  | { kind: "done"; source: string; seen: number; ok: number; failed: number };

export interface Scraper {
  name: string;
  scrape(criteria: ScrapeCriteria, onEvent: (e: ProgressEvent) => void): AsyncGenerator<ScrapedOffre>;
}

let _browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.isConnected()) return _browser;
  // Le moteur est optionnel (téléchargé à la demande) : on pointe le registre
  // Playwright sur les données utilisateur AVANT le premier require, puis on
  // échoue avec un message actionnable s'il n'est pas encore là.
  applyBrowsersPath();
  if (!isEngineInstalled()) throw new Error(ENGINE_MISSING_MESSAGE);
  const { chromium } = await import("playwright");
  try {
    _browser = await chromium.launch({ headless: true });
  } catch (e) {
    // Moteur d'une autre version de Playwright : même remède qu'un moteur absent.
    if (e instanceof Error && /Executable doesn't exist/i.test(e.message)) throw new Error(ENGINE_MISSING_MESSAGE);
    throw e;
  }
  return _browser;
}

export async function newContext(): Promise<BrowserContext> {
  const browser = await getBrowser();
  return browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    viewport: { width: 1366, height: 900 },
    locale: "fr-FR",
  });
}

/**
 * Délai d'une requête vers un site d'offres. Sans lui, un site qui garde la
 * connexion ouverte sans répondre faisait attendre chaque requête jusqu'à
 * 5 minutes : des recherches de test du 19 octobre 2026 sont restées bloquées
 * une heure sur France Travail, HelloWork ou Welcome to the Jungle.
 */
export const SOURCE_TIMEOUT_MS = 20_000;

/** fetch vers un site d'offres, abandonné après SOURCE_TIMEOUT_MS (lecture du corps comprise). */
export function sourceFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(SOURCE_TIMEOUT_MS) });
}

export function htmlToText(html: string): string {
  const stripped = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  // Entités décodées APRÈS le retrait des balises (un « &lt;div&gt; » du texte reste du
  // texte) : l'ancienne chaîne de .replace ne connaissait que six entités
  // (« &eacute; », « &rsquo; », « &#43; » restaient en clair) et décodait
  // « &amp;lt; » deux fois. L'espace insécable en entité devient une espace simple.
  // Une référence numérique encore échappée (« &amp;#xa0; ») vient d'un champ
  // doublement encodé : on la décode en profondeur. « &amp;lt; » reste une
  // comparaison citée, pas une balise.
  const decode = /&amp;#/.test(stripped) ? decodeHtmlEntitiesDeep : decodeHtmlEntities;
  return decode(stripped, { nbspToSpace: true })
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
