import "server-only";
import type { ProgressEvent, ScrapedOffre, Scraper } from "./base";
import { htmlToText } from "./base";
import { parseDocument, extractJobPostingLd, firstMatchHtml, sleep } from "./dom";
import { countryMatcher } from "@/lib/countries";
import { resolveSwissCanton } from "@/lib/swiss-geography";
import { detectVie } from "@/lib/vie";
import { indeedSearchUrl } from "@/lib/indeed";
import { sourceFetch } from "./source-fetch";

const SOURCE = "indeedch";
const HOST = "https://ch.indeed.com";
const isSwissCountry = countryMatcher(["Suisse"]);
const BLOCKED = "Indeed Suisse refuse l'accès automatique. Ouvrez la recherche Indeed Suisse depuis la page Offres pour consulter les annonces dans votre navigateur.";

class IndeedAccessError extends Error {}

export type IndeedCard = {
  id: string; url: string; title: string; company: string;
  location: string | null; salary: string | null; contract: string | null;
  snippet: string;
};

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, " ").trim() || null;

/** Les clés des annonces deviennent des URL canoniques, sans lien publicitaire ni suivi. */
function jobKey(anchor: Element): string | null {
  const href = anchor.getAttribute("href");
  let key = anchor.getAttribute("data-jk");
  if (href) {
    try {
      const url = new URL(href, HOST);
      if (url.origin !== HOST || !["/viewjob", "/rc/clk", "/pagead/clk"].includes(url.pathname)) return null;
      key ||= url.searchParams.get("jk");
    } catch { return null; }
  }
  return key && /^[a-f0-9]{16}$/i.test(key) ? key : null;
}

function pageDocument(html: string): Document {
  const doc = parseDocument(html);
  if (/just a moment|access denied|attention required|captcha|verify you|security check|vérifiez que|verifiez que/i.test(doc.title) ||
      doc.querySelector("#challenge-form, #cf-challenge-running, #captcha-form")) {
    throw new IndeedAccessError(BLOCKED);
  }
  return doc;
}

export function parseIndeedSearch(html: string): { cards: IndeedCard[]; hasNext: boolean } {
  const doc = pageDocument(html);
  const seen = new Set<string>();
  const cards: IndeedCard[] = [];
  for (const anchor of Array.from(doc.querySelectorAll("a[data-jk], h2 a[href*='jk='], h3 a[href*='jk=']"))) {
    // Indeed inclut aussi une carte factice masquée dans le HTML de recherche.
    if (anchor.closest("[aria-hidden='true'], [hidden], template")) continue;
    const id = jobKey(anchor);
    if (!id || seen.has(id)) continue;
    const card = anchor.closest(".job_seen_beacon, .cardOutline, .tapItem, [data-testid='slider_item']") ?? anchor.closest("li");
    if (!card) continue;
    const title = anchor.querySelector("span[title]")?.getAttribute("title")?.trim() ||
      anchor.getAttribute("title")?.trim() || text(anchor) || text(card.querySelector("h2, h3"));
    if (!title) continue;
    seen.add(id);
    cards.push({
      id, url: `${HOST}/viewjob?jk=${id}`, title,
      company: text(card.querySelector("[data-testid='company-name'], [data-testid='companyName'], .companyName")) ?? "",
      location: text(card.querySelector("[data-testid='text-location'], .companyLocation")),
      salary: text(card.querySelector("[data-testid='salary-snippet'], .salary-snippet-container, .salary-snippet")),
      contract: text(card.querySelector("[data-testid='job-type'], .jobType")),
      snippet: card.querySelector(".job-snippet, [data-testid='job-snippet']")?.innerHTML ?? "",
    });
  }
  if (!cards.length && !doc.querySelector("#no_results, .no_results, .no-results, [data-testid='no-results']") &&
      !/aucun(?:e)? (?:offre|résultat)|no jobs found|did not match any jobs|keine stellenangebote/i.test(doc.body.textContent ?? "")) {
    throw new Error("Indeed Suisse : résultats non reconnus. La page a changé ou l'accès est restreint ; ouvrez la recherche dans votre navigateur.");
  }
  const hasNext = !!doc.querySelector("a[rel='next'], a[data-testid='pagination-page-next'], a[aria-label='Next Page'], a[aria-label='Page suivante']");
  return { cards, hasNext };
}

async function fetchHtml(url: string): Promise<string> {
  const response = await sourceFetch(SOURCE, url, {
    headers: { "user-agent": "JobScout/3.4 (+https://github.com/WardenPro/jobscout)", accept: "text/html", "accept-language": "fr-CH,fr;q=0.9" },
    signal: AbortSignal.timeout(15000), cache: "no-store", redirect: "error",
  });
  if ([401, 403, 429].includes(response.status)) throw new IndeedAccessError(`${BLOCKED} (HTTP ${response.status})`);
  if (!response.ok) throw new Error(`Indeed Suisse HTTP ${response.status}`);
  const html = await response.text();
  if (html.length > 3_000_000) throw new Error("Indeed Suisse : page trop volumineuse.");
  return html;
}

export function indeedCardToOffre(card: IndeedCard, html?: string, error?: string): ScrapedOffre | null {
  const doc = html ? pageDocument(html) : null;
  const ld = doc ? extractJobPostingLd(doc) : null;
  if (ld?.country && !isSwissCountry(ld.country)) return null;
  const description = ld?.description_html || (doc ? firstMatchHtml(doc, ["#jobDescriptionText", "[data-testid='jobDescriptionText']", ".simple-job-description-html"], 100) : null);
  const description_html = description || card.snippet;
  const description_text = htmlToText(description_html);
  const location = ld?.locality || card.location;
  const title = ld?.title || card.title;
  const complete = !!description && description_text.length >= 100;
  return {
    source_id: card.id, url: card.url, title, company: ld?.company || card.company,
    country: "Suisse", location, canton: resolveSwissCanton(ld?.region, location),
    contract_type: ld?.contract_type || card.contract, salary: ld?.salary || card.salary,
    description_html, description_text,
    description_status: complete ? "ok" : description_text ? "partial" : "failed",
    posted_at: ld?.posted_at ? String(ld.posted_at).slice(0, 10) : null,
    is_vie: detectVie({ source: SOURCE, title, description: description_text, url: card.url }),
    raw_payload: { jobKey: card.id, ...(ld?.region ? { region: ld.region } : {}) },
    ...(!complete ? { scrape_errors: error || "Description complète indisponible sur Indeed Suisse." } : {}),
  };
}

export const indeedScraper: Scraper = {
  name: SOURCE,
  async *scrape(criteria, onEvent: (e: ProgressEvent) => void) {
    onEvent({ kind: "start", source: SOURCE });
    const inScope = !criteria.countries.length || criteria.countries.some(isSwissCountry);
    if (!inScope) {
      onEvent({ kind: "list", source: SOURCE, total: 0 });
      onEvent({ kind: "done", source: SOURCE, seen: 0, ok: 0, failed: 0 });
      return;
    }
    const max = Math.max(0, Math.min(50, criteria.maxOffres ?? 50));
    const queries = [...new Set(criteria.sectors.length ? criteria.sectors : [""])];
    const found = new Map<string, IndeedCard>();
    let succeeded = false;
    let blocked: string | null = null;
    let lastError: Error | null = null;
    search: for (const query of queries) {
      for (let page = 0; page < 3 && found.size < max; page++) {
        try {
          const { cards, hasNext } = parseIndeedSearch(await fetchHtml(indeedSearchUrl(query, "Suisse", page * 10)));
          succeeded = true;
          let added = 0;
          for (const card of cards) {
            if (!found.has(card.id) && found.size < max) { found.set(card.id, card); added++; }
          }
          if (!hasNext || !added || found.size >= max) break;
          await sleep(1200);
        } catch (e) {
          lastError = e instanceof Error ? e : new Error(String(e));
          if (e instanceof IndeedAccessError) {
            blocked = e.message;
            if (!succeeded) throw e;
            onEvent({ kind: "error", source: SOURCE, message: e.message });
            break search;
          }
          onEvent({ kind: "error", source: SOURCE, message: `Recherche « ${query} », page ${page + 1} : ${lastError.message}` });
          break;
        }
      }
      if (found.size >= max) break;
      await sleep(1200);
    }
    if (max > 0 && !succeeded) throw lastError ?? new Error("Indeed Suisse : recherche indisponible.");
    const cards = [...found.values()];
    onEvent({ kind: "list", source: SOURCE, total: cards.length });
    let ok = 0;
    let failed = 0;
    for (const [index, card] of cards.entries()) {
      let offre: ScrapedOffre | null;
      try {
        offre = blocked ? indeedCardToOffre(card, undefined, blocked) : indeedCardToOffre(card, await fetchHtml(card.url));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (e instanceof IndeedAccessError) {
          blocked = message;
          onEvent({ kind: "error", source: SOURCE, message });
        }
        offre = indeedCardToOffre(card, undefined, message);
      }
      if (offre) yield offre;
      const status = offre?.description_status === "ok" ? "ok" : "failed";
      if (status === "ok") ok++; else failed++;
      onEvent({ kind: "offre", source: SOURCE, index: index + 1, total: cards.length, status });
      if (!blocked && index < cards.length - 1) await sleep(900);
    }
    onEvent({ kind: "done", source: SOURCE, seen: cards.length, ok, failed });
  },
};
