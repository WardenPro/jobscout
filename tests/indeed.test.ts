import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { indeedSearchUrl } from "@/lib/indeed";
import { indeedScraper, parseIndeedSearch, indeedCardToOffre, type IndeedCard } from "@/lib/scrapers/indeed";
import type { ProgressEvent, ScrapedOffre } from "@/lib/scrapers/base";
import { SOURCE_IDS, DEFAULT_SOURCE_IDS, SOURCES_META } from "@/lib/sources-meta";
import { VALID_SOURCES } from "@/lib/scrapers/registry";
import { IndeedSearch } from "@/components/app/indeed-search";
import { saveScrapingProxySettings, PROXY_SETTING_KEYS } from "@/lib/scrapers/proxy-config";
import { withProxyScope } from "@/lib/scrapers/source-fetch";
import { setSetting } from "@/lib/db";

vi.mock("@/lib/scrapers/dom", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/scrapers/dom")>()), sleep: async () => {},
}));
afterEach(() => {
  vi.unstubAllGlobals();
  setSetting(PROXY_SETTING_KEYS.config, "");
  setSetting(PROXY_SETTING_KEYS.key, "");
});

const ID = "a123456789abcdef";
const ID2 = "b123456789abcdef";
const description = "Administration de serveurs Windows et Linux, configuration du réseau, supervision des services et documentation des procédures. ".repeat(2);
const card: IndeedCard = { id: ID, url: `https://ch.indeed.com/viewjob?jk=${ID}`, title: "Ingénieur systèmes", company: "Exemple SA", location: "Lausanne, VD", salary: "80 000 CHF", contract: "CDI · 80–100 %", snippet: "<p>Administration systèmes…</p>" };
const search = (ids = [ID], next = false) => `<!doctype html><title>Emplois | Indeed</title><ul>${ids.map(id => `
  <li><div class="job_seen_beacon">
    <h2><a data-jk="${id}" href="/rc/clk?jk=${id}&utm_source=test"><span title="Ingénieur systèmes">Ingénieur systèmes</span></a></h2>
    <span data-testid="company-name">Exemple SA</span><div data-testid="text-location">Lausanne, VD</div>
    <span class="salary-snippet-container">80 000 CHF</span><span data-testid="job-type">CDI · 80–100 %</span>
    <div class="job-snippet"><p>Administration systèmes…</p></div>
  </div></li>`).join("")}</ul>${next ? '<a data-testid="pagination-page-next" href="/jobs?start=10">Suivant</a>' : ""}`;
const detail = (country = "CH") => `<title>Ingénieur systèmes | Indeed</title><script type="application/ld+json">${JSON.stringify({
  "@type": "JobPosting", title: "Ingénieur systèmes Microsoft", hiringOrganization: { name: "Exemple SA" },
  description: `<p>${description}</p>`, jobLocation: { address: { addressLocality: "Lausanne", addressRegion: "Vaud", addressCountry: country } },
  employmentType: "FULL_TIME", datePosted: "2026-10-08", baseSalary: { currency: "CHF", value: { value: 80000, unitText: "YEAR" } },
})}</script>`;
const response = (html: string, status = 200) => new Response(html, { status, headers: { "content-type": "text/html" } });
async function drain(countries = ["Suisse"], sectors = ["informatique"], maxOffres = 50) {
  const events: ProgressEvent[] = [];
  const offres: ScrapedOffre[] = [];
  for await (const offre of indeedScraper.scrape({ countries, sectors, maxOffres }, e => events.push(e))) offres.push(offre);
  return { offres, events };
}

describe("Indeed Suisse — recherche et intégration", () => {
  it("encode les paramètres et conserve l'origine suisse", () => {
    const url = new URL(indeedSearchUrl("C++ & sécurité", "Genève", 10));
    expect(url.origin).toBe("https://ch.indeed.com");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: "C++ & sécurité", l: "Genève", hl: "fr", start: "10" });
    expect(new URL(indeedSearchUrl("", "")).searchParams.get("l")).toBe("Suisse");
  });
  it("la source est opt-in, suisse, sans téléchargement, et le registre correspond aux métadonnées", () => {
    expect(SOURCES_META.find(s => s.id === "indeedch")).toMatchObject({ scope: "ch", optIn: true });
    expect(DEFAULT_SOURCE_IDS).not.toContain("indeedch");
    expect([...VALID_SOURCES].sort()).toEqual([...SOURCE_IDS].sort());
  });
  it("le lien manuel n'exige aucune requête serveur ni activation du scan", () => {
    const html = renderToStaticMarkup(createElement(IndeedSearch, { sectors: ["informatique"] }));
    expect(html).toContain("ch.indeed.com/jobs?");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });
  it("lit les cartes, retire le suivi et déduplique les clés", () => {
    const result = parseIndeedSearch(search([ID, ID], true));
    expect(result.cards).toEqual([card]);
    expect(result.hasNext).toBe(true);
  });
  it("ignore les cartes factices masquées et lit les titres h3 sans attribut title", () => {
    const hidden = search([ID]).replace('class="job_seen_beacon"', 'class="job_seen_beacon" aria-hidden="true"');
    const visible = search([ID2]).replaceAll("h2", "h3").replace('title="Ingénieur systèmes"', "");
    expect(parseIndeedSearch(hidden + visible).cards.map(c => ({ id: c.id, title: c.title }))).toEqual([{ id: ID2, title: "Ingénieur systèmes" }]);
  });
  it("ignore les liens externes et les clés invalides", () => {
    const html = search().replace(`/rc/clk?jk=${ID}&utm_source=test`, "https://evil.example/viewjob?jk=" + ID);
    expect(() => parseIndeedSearch(html)).toThrow(/non reconnus/);
    expect(() => parseIndeedSearch(search(["invalid-id"]))).toThrow(/non reconnus/);
  });
  it("distingue une recherche vide d'une structure inconnue ou d'un CAPTCHA", () => {
    expect(parseIndeedSearch('<div id="no_results">Aucune offre</div>').cards).toEqual([]);
    expect(() => parseIndeedSearch('<title>Indeed</title><div>Structure nouvelle</div>')).toThrow(/non reconnus/);
    expect(() => parseIndeedSearch('<title>Just a moment...</title>')).toThrow(/refuse/);
  });
  it("extrait la description structurée, le canton, le contrat et le salaire", () => {
    const offre = indeedCardToOffre(card, detail())!;
    expect(offre).toMatchObject({ source_id: ID, country: "Suisse", canton: "VD", location: "Lausanne", title: "Ingénieur systèmes Microsoft", description_status: "ok", contract_type: "FULL_TIME", posted_at: "2026-10-08", salary: "80 000 CHF / an" });
    expect(offre.description_text).toContain("Windows et Linux");
    expect(indeedCardToOffre(card, detail("FR"))).toBeNull();
  });
  it("utilise la description visible et garde un extrait incomplet au statut partial", () => {
    expect(indeedCardToOffre(card, `<div id="jobDescriptionText">${description}</div>`)?.description_status).toBe("ok");
    expect(indeedCardToOffre(card, undefined, "HTTP 403")).toMatchObject({ description_status: "partial", scrape_errors: "HTTP 403" });
    expect(indeedCardToOffre({ ...card, snippet: "" })?.description_status).toBe("failed");
  });
  it.each([{ countries: ["France"] }, { countries: ["Belgique", "France"] }])("ne contacte jamais Indeed hors du périmètre suisse ($countries)", async ({ countries }) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const { offres, events } = await drain(countries);
    expect(fetch).not.toHaveBeenCalled();
    expect(offres).toEqual([]);
    expect(events.at(-1)).toMatchObject({ kind: "done", seen: 0 });
  });
  it.each(["Suisse", "Switzerland", "CH"])("accepte le pays %s et récupère une offre complète", async country => {
    const fetch = vi.fn(async (url: string) => response(url.includes("viewjob") ? detail() : search()));
    vi.stubGlobal("fetch", fetch);
    const { offres, events } = await drain([country]);
    expect(offres).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(events.at(-1)).toMatchObject({ kind: "done", ok: 1, failed: 0 });
  });
  it.each([403, 429, 401])("arrête les appels dès le HTTP %s sans réessayer les secteurs", async status => {
    const fetch = vi.fn(async () => response("Accès refusé", status)); vi.stubGlobal("fetch", fetch);
    await expect(drain(["Suisse"], ["informatique", "comptabilité"])).rejects.toThrow(`HTTP ${status}`);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("poursuit un autre secteur après une panne 503 sans annoncer un succès vide", async () => {
    const fetch = vi.fn(async (url: string) => response(url.includes("viewjob") ? detail() : new URL(url).searchParams.get("q") === "panne" ? "indisponible" : search(), url.includes("q=panne") ? 503 : 200));
    vi.stubGlobal("fetch", fetch);
    const result = await drain(["Suisse"], ["panne", "informatique"]);
    expect(result.offres).toHaveLength(1);
    expect(result.events.some(e => e.kind === "error" && e.message.includes("503"))).toBe(true);
  });
  it("conserve les cartes après un blocage en pagination sans poursuivre les appels", async () => {
    const fetch = vi.fn(async (url: string) => response(url.includes("start=10") ? "refus" : search([ID], true), url.includes("start=10") ? 403 : 200));
    vi.stubGlobal("fetch", fetch);
    const { offres, events } = await drain();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(offres[0].description_status).toBe("partial");
    expect(events.some(e => e.kind === "error")).toBe(true);
  });
  it("arrête les détails après un refus et conserve les extraits des autres offres", async () => {
    const fetch = vi.fn(async (url: string) => response(url.includes("viewjob") ? "refus" : search([ID, ID2]), url.includes("viewjob") ? 403 : 200));
    vi.stubGlobal("fetch", fetch);
    const { offres } = await drain();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(offres.map(o => o.description_status)).toEqual(["partial", "partial"]);
  });

  it("arrête aussi les appels sur une page Security Check servie en HTTP 200", async () => {
    const fetch = vi.fn(async () => response('<title>Security Check - Indeed.com</title><form id="challenge-form"></form>'));
    vi.stubGlobal("fetch", fetch);
    await expect(drain(["Suisse"], ["informatique", "comptabilité"])).rejects.toThrow(/refuse/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("signale une panne totale au lieu de présenter zéro résultat comme un succès", async () => {
    const fetch = vi.fn(async () => response("Indisponible", 503));
    vi.stubGlobal("fetch", fetch);
    await expect(drain(["Suisse"], ["informatique", "comptabilité"])).rejects.toThrow(/503/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("une liste de pays vide garde la Suisse dans le périmètre", async () => {
    const fetch = vi.fn(async (_url: string) => response('<div id="no_results">Aucune offre</div>'));
    vi.stubGlobal("fetch", fetch);
    expect((await drain([], [])).offres).toEqual([]);
    expect(new URL(fetch.mock.calls[0][0] as string).searchParams.get("l")).toBe("Suisse");
  });

  it("ne contacte pas le site lorsque la limite est zéro", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await drain(["Suisse"], ["informatique"], 0)).offres).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("borne la pagination à trois pages même si une suite est proposée", async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.includes("viewjob")) return response(detail());
      const index = Number(new URL(url).searchParams.get("start") ?? 0) / 10;
      return response(search([(index + 1).toString(16).padStart(16, "0")], true));
    });
    vi.stubGlobal("fetch", fetch);
    expect((await drain()).offres).toHaveLength(3);
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(fetch.mock.calls.filter(([url]) => !url.includes("viewjob")).map(([url]) => new URL(url).searchParams.get("start"))).toEqual([null, "10", "20"]);
  });

  it("ne dépasse pas cinquante offres même si une limite supérieure est demandée", async () => {
    const ids = Array.from({ length: 60 }, (_, i) => (i + 1).toString(16).padStart(16, "0"));
    const fetch = vi.fn(async (url: string) => response(url.includes("viewjob") ? detail() : search(ids)));
    vi.stubGlobal("fetch", fetch);
    expect((await drain(["Suisse"], ["informatique"], 500)).offres).toHaveLength(50);
    expect(fetch).toHaveBeenCalledTimes(51);
  });
  it("borne le nombre d'offres et arrête une pagination qui se répète", async () => {
    const fetch = vi.fn(async (url: string) => response(url.includes("viewjob") ? detail() : search([ID, ID2], true)));
    vi.stubGlobal("fetch", fetch);
    expect((await drain(["Suisse"], ["informatique"], 1)).offres).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockClear();
    expect((await drain()).offres).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(4); // deux pages identiques + deux détails
  });
});

describe("Indeed Suisse avec Bright Data", () => {
  async function proxied(maxOffres = 1, maxRequests = 2) {
    saveScrapingProxySettings({ mode: "fallback", zone: "jobup", sources: ["indeedch"], maxRequests }, "fake-brightdata-key");
    const offres: ScrapedOffre[] = [];
    const events: ProgressEvent[] = [];
    for await (const offre of withProxyScope(indeedScraper).scrape({ countries: ["Suisse"], sectors: ["informatique", "comptabilité"], maxOffres }, e => events.push(e))) offres.push(offre);
    return { offres, events };
  }
  it("récupère recherche et fiche après le 403 direct, avec deux appels au relais", async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url !== "https://api.brightdata.com/request") return response("refus", 403);
      const request = JSON.parse(init!.body as string);
      expect(request.zone).toBe("jobup");
      return response(JSON.stringify({ status_code: 200, body: request.url.includes("viewjob") ? detail() : search() }));
    });
    vi.stubGlobal("fetch", fetch);
    expect((await proxied()).offres[0]).toMatchObject({ source_id: ID, description_status: "ok", canton: "VD" });
    expect(fetch.mock.calls.map(([url]) => url.includes("api.brightdata.com"))).toEqual([false, true, true]);
  });
  it("garde les extraits incomplets quand le plafond ne permet pas les fiches", async () => {
    const fetch = vi.fn(async (url: string) => url.includes("api.brightdata.com") ? response(JSON.stringify({ status_code: 200, body: search([ID, ID2]) })) : response("refus", 403));
    vi.stubGlobal("fetch", fetch);
    const { offres, events } = await proxied(2, 1);
    expect(offres.map(o => o.description_status)).toEqual(["partial", "partial"]);
    expect(events.some(e => e.kind === "error" && e.message.includes("plafond de 1"))).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("une erreur de clé du relais n'entraîne aucun autre appel réseau", async () => {
    const fetch = vi.fn(async (url: string) => response("refus", url.includes("api.brightdata.com") ? 401 : 403));
    vi.stubGlobal("fetch", fetch);
    await expect(proxied()).rejects.toThrow(/Bright Data HTTP 401/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
