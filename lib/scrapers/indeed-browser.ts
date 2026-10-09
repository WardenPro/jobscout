import "server-only";
import type { Page } from "playwright";
import { htmlToText, type ScrapedOffre } from "./base";
import { indeedCardToOffre } from "./indeed";
import { detectVie } from "@/lib/vie";

/** Diagnostic interactif : Chrome installé, visible, sans identité falsifiée.
 * Contexte jetable : aucun profil ni cookie du navigateur personnel n'est utilisé.
 * Le moteur headless de LinkedIn reste inchangé.
 */
export async function openIndeedDiagnosticBrowser() {
  const { chromium } = await import("playwright");
  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: false });
  } catch {
    throw new Error("Impossible de lancer Chrome pour le diagnostic Indeed. Installez Google Chrome et utilisez une session graphique locale.");
  }
  try {
    const context = await browser.newContext({ locale: "fr-CH", viewport: { width: 1366, height: 900 } });
    return { browser, context };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

export type IndeedBrowserStatus = "ok" | "blocked" | "expired" | "timeout" | "navigation_error" | "http_error" | "missing_description" | "incomplete" | "outside_switzerland";
export type IndeedBrowserResult = {
  status: IndeedBrowserStatus;
  message: string;
  httpStatus: number | null;
  elapsedMs: number;
  selector?: string;
  offer?: ScrapedOffre;
};

/** Exécutée dans la page par Playwright : aucune dépendance sur le serveur. */
function inspectPage(wait: boolean) {
  const visible = (el: Element) => !!el.getClientRects().length && getComputedStyle(el).visibility !== "hidden";
  const title = document.title;
  const heading = document.querySelector("h1")?.textContent ?? "";
  const challengeTitle = /just a moment|access denied|attention required|security check|verify (?:you|your)|vérifiez que|captcha/i;
  const challenge = Array.from(document.querySelectorAll("#challenge-form, #cf-challenge-running, #captcha-form, iframe[src*='challenges.cloudflare.com']")).some(visible);
  if (challengeTitle.test(title) || challengeTitle.test(heading) || challenge) return { state: "blocked" as const };
  if (/job (?:has expired|is no longer available)|this job has closed|cette offre.*(?:expir|plus disponible)|annonce.*(?:expir|plus disponible)|stellenangebot.*(?:abgelaufen|nicht mehr)/i.test(document.body?.innerText ?? "")) return { state: "expired" as const };

  let selector: string | undefined;
  let descriptionHtml: string | undefined;
  for (const candidate of ["#jobDescriptionText", "[data-testid='jobDescriptionText']", ".simple-job-description-html"]) {
    const element = Array.from(document.querySelectorAll<HTMLElement>(candidate)).find(el => visible(el) && (el.innerText?.trim().length ?? 0) >= 100);
    if (element) {
      selector = candidate;
      descriptionHtml = element.innerHTML;
      break;
    }
  }
  for (const script of Array.from(document.querySelectorAll("script[type='application/ld+json']"))) {
    if (selector) break;
    try {
      const value = JSON.parse(script.textContent ?? "");
      const postings = Array.isArray(value) ? value : [value, ...(Array.isArray(value?.["@graph"]) ? value["@graph"] : [])];
      if (postings.some(item => (item?.["@type"] === "JobPosting" || (Array.isArray(item?.["@type"]) && item["@type"].includes("JobPosting"))) && typeof item.description === "string" && item.description.replace(/<[^>]*>/g, "").trim().length >= 100)) selector = "JobPosting JSON-LD";
    } catch { /* Une balise JSON-LD invalide ne masque pas les autres. */ }
  }
  if (!selector && wait) return false;
  const text = (selectors: string) => document.querySelector(selectors)?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  return {
    state: selector ? "ready" as const : "waiting" as const,
    selector,
    descriptionHtml,
    title: text("[data-testid='jobsearch-JobInfoHeader-title'], .jobsearch-JobInfoHeader-title, h1"),
    company: text("[data-testid='inlineHeader-companyName'], [data-testid='company-name'], #companyName, .jobsearch-JobInfoHeader-companyName, .jobsearch-CompanyInfoContainer a"),
    location: text("[data-testid='inlineHeader-companyLocation'], [data-testid='job-location'], #jobLocationText, .jobsearch-JobInfoHeader-companyLocation"),
  };
}

/** Une navigation, sans proxy, cookies de compte, retries ni résolution de captcha.
 * Le contexte fourni reste la propriété de l'appelant (comme pour LinkedIn).
 */
export async function probeIndeedDetail(page: Page, input: string, options: { navigationTimeoutMs?: number; contentTimeoutMs?: number } = {}): Promise<IndeedBrowserResult> {
  const url = new URL(input);
  const key = url.searchParams.get("jk");
  if (url.origin !== "https://ch.indeed.com" || url.username || url.password || url.pathname !== "/viewjob" || !key || !/^[a-f0-9]{16}$/i.test(key)) throw new Error("Utilisez une fiche https://ch.indeed.com/viewjob?jk=<clé de 16 caractères hexadécimaux>.");
  const canonical = `https://ch.indeed.com/viewjob?jk=${key}`;
  const started = Date.now();
  let httpStatus: number | null = null;
  const result = (status: IndeedBrowserStatus, message: string): IndeedBrowserResult => ({ status, message, httpStatus, elapsedMs: Date.now() - started });
  try {
    const response = await page.goto(canonical, { waitUntil: "domcontentloaded", timeout: options.navigationTimeoutMs ?? 30_000 });
    httpStatus = response?.status() ?? null;
    if ([401, 403, 429].includes(httpStatus ?? 0)) return result("blocked", "Indeed refuse l'accès au navigateur automatique.");
    if ([404, 410].includes(httpStatus ?? 0)) return result("expired", "Fiche absente ou retirée.");
    if (httpStatus === null || httpStatus >= 400) return result("http_error", "La fiche ne renvoie pas une réponse HTTP exploitable.");
    const finalUrl = new URL(page.url());
    if (finalUrl.origin !== url.origin || finalUrl.pathname !== "/viewjob" || finalUrl.searchParams.get("jk") !== key) return result("navigation_error", "La navigation redirige vers une autre page que la fiche demandée.");
    let state: Awaited<ReturnType<typeof inspectPage>>;
    try {
      const handle = await page.waitForFunction(inspectPage, true, { timeout: options.contentTimeoutMs ?? 15_000 });
      try { state = await handle.jsonValue(); } finally { await handle.dispose(); }
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "TimeoutError") throw error;
      const handle = await page.waitForFunction(inspectPage, false, { timeout: 1000 });
      try { state = await handle.jsonValue(); } finally { await handle.dispose(); }
    }
    if (!state) return result("missing_description", "Description complète absente après l'attente.");
    if (state.state === "blocked") return result("blocked", "Page de protection ou captcha détecté.");
    if (state.state === "expired") return result("expired", "L'annonce indique que le poste n'est plus disponible.");
    if (state.state !== "ready") return result("missing_description", "Aucun bloc de description reconnu : contenu trop court ou structure modifiée.");
    const html = await page.content();
    if (html.length > 3_000_000) return result("incomplete", "Page trop volumineuse pour ce diagnostic.");
    const offer = indeedCardToOffre({ id: key, url: canonical, title: state.title ?? "", company: state.company ?? "", location: state.location || null, salary: null, contract: null, snippet: "" }, html);
    if (!offer) return result("outside_switzerland", "Les données structurées indiquent un poste hors de Suisse.");
    // La description affichée peut être plus riche que l'extrait du JSON-LD.
    // Elle vient du bloc visible sélectionné, jamais d'un conteneur masqué.
    if (state.descriptionHtml) {
      offer.description_html = state.descriptionHtml;
      offer.description_text = htmlToText(state.descriptionHtml);
      offer.description_status = offer.description_text.length >= 100 ? "ok" : "partial";
      offer.is_vie = detectVie({ source: "indeedch", title: offer.title, description: offer.description_text, url: canonical });
    }
    if (offer.description_status !== "ok" || !offer.title || !offer.company) return result("incomplete", "Description ou identité du poste incomplète ; la récupération n'est pas validée.");
    return { ...result("ok", "Fiche complète récupérée dans Chromium."), selector: state.selector, offer };
  } catch (error) {
    return error instanceof Error && error.name === "TimeoutError"
      ? result("timeout", "La navigation ou l'exécution dans la page dépasse le délai.")
      : result("navigation_error", "Échec de chargement ou d'exécution dans le navigateur.");
  }
}
