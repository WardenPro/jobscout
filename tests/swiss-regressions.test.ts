import { afterEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { createRequire } from "node:module";
import { SwissSettings } from "@/components/app/swiss-settings";
import { jobupScraper, jobschScraper } from "@/lib/scrapers/jobcloud";
import { jobroomScraper, adToOffre, type JobAd } from "@/lib/scrapers/jobroom";
import { upsertOffreFromSource, searchOffres } from "@/lib/db/offres";
import type { ProgressEvent, Scraper, ScrapedOffre } from "@/lib/scrapers/base";
import { parseDocument } from "@/lib/scrapers/dom";
import { OffresList } from "@/app/(app)/offres/list";
import OffreDetailPage from "@/app/(app)/offres/[id]/page";
import { saveProfile } from "@/lib/db/queries";
import { ProfileFullSchema } from "@/lib/cv/types";
import { profile } from "./fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), notFound: () => { throw new Error("not found"); } }));
vi.mock("@/app/(app)/offres/[id]/actions", () => ({ ActionsPanel: () => null }));

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup: (element: React.ReactNode) => string;
};
const DESCRIPTION = "Vous participez à la gestion comptable, à la préparation des rapports et au suivi des dossiers administratifs de notre entreprise.";
const offer = (id: string, status: "ok" | "failed" | "partial"): ScrapedOffre => ({
  source_id: id, url: "https://example.org/offre", title: "Comptable", company: "Exemple",
  country: "Suisse", location: null, contract_type: null, salary: null,
  description_html: "", description_text: status === "ok" ? DESCRIPTION : "",
  description_status: status, posted_at: null, is_vie: false, raw_payload: {},
});
const ad = (id: string): JobAd => ({
  id, jobContent: { jobDescriptions: [{ languageIsoCode: "fr", title: "Comptable", description: DESCRIPTION }] },
});

async function drain(scraper: Scraper, events: ProgressEvent[] = []) {
  const offers: ScrapedOffre[] = [];
  for await (const o of scraper.scrape({ countries: ["Suisse"], sectors: ["comptable"] }, e => events.push(e))) offers.push(o);
  return offers;
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("régressions des sources suisses", () => {
  it.each([jobupScraper, jobschScraper, jobroomScraper])("%s : un HTTP 403 remonte sans succès vide", async (scraper) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("blocked", { status: 403 })));
    const events: ProgressEvent[] = [];
    await expect(drain(scraper, events)).rejects.toThrow("HTTP 403");
    expect(events.some(e => e.kind === "done")).toBe(false);
  });

  it.each([jobupScraper, jobschScraper, jobroomScraper])("%s conserve les offres après une erreur sur la deuxième page et poursuit les secteurs", async (scraper) => {
    const events: ProgressEvent[] = [];
    const room = scraper.name === "jobroom";
    const ids = [`pagination-${scraper.name}-1`, `pagination-${scraper.name}-2`];
    const searches: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const search = room ? init?.method === "POST" : !url.includes("/detail/");
      if (!search) {
        if (room) return Response.json(ad(url.split("/").pop()!));
        return new Response(`<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", description: `<p>${DESCRIPTION}</p>` })}</script>`);
      }
      searches.push(url);
      if (searches.length === 2) return new Response("unavailable", { status: 503 });
      const id = ids[searches.length === 1 ? 0 : 1];
      if (room) return Response.json(Array.from({ length: searches.length === 1 ? 50 : 1 }, () => ({ jobAdvertisement: ad(id) })));
      const state = { vacancy: { results: { main: { results: [{ id, title: "Comptable" }], meta: { numPages: searches.length === 1 ? 3 : 1 } } } } };
      return new Response(`<script>__INIT__ = ${JSON.stringify(state)}</script>`);
    }));
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const pending = (async () => {
      const offers: ScrapedOffre[] = [];
      for await (const o of scraper.scrape({ countries: ["Suisse"], sectors: ["comptable", "finance"] }, e => events.push(e))) offers.push(o);
      return offers;
    })();
    await vi.runAllTimersAsync();
    expect((await pending).map(o => o.source_id)).toEqual(ids);
    expect(searches).toHaveLength(3);
    expect(events).toContainEqual(expect.objectContaining({ kind: "error", source: scraper.name, message: expect.stringContaining("page 2") }));
    expect(events).toContainEqual(expect.objectContaining({ kind: "error", message: expect.stringContaining("HTTP 503") }));
    expect(events).toContainEqual({ kind: "done", source: scraper.name, seen: 2, ok: 2, failed: 0 });
  });

  it.each(["failed", "partial"] as const)("JobCloud récupère un doublon %s depuis le site jumeau", async (status) => {
    const id = `retry-jobcloud-${status}`;
    upsertOffreFromSource("jobsch", offer(id, status));
    const state = { vacancy: { results: { main: { results: [{ id, title: "Comptable" }], meta: { numPages: 1 } } } } };
    const detail = `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", description: `<p>${DESCRIPTION}</p>` })}</script>`;
    const fetch = vi.fn(async (url: string) => new Response(url.includes("/detail/") ? detail : `<script>__INIT__ = ${JSON.stringify(state)}</script>`));
    vi.stubGlobal("fetch", fetch);
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const pending = drain(jobupScraper);
    await vi.runAllTimersAsync();
    expect(await pending).toEqual([expect.objectContaining({ source_id: id, description_status: "ok" })]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("Job-Room récupère un doublon raté depuis JobCloud", async () => {
    const id = "retry-jobroom";
    upsertOffreFromSource("jobup", offer(id, "failed"));
    const copy = ad(id);
    copy.externalReference = id;
    copy.jobContent!.externalUrl = `https://www.jobup.ch/fr/emplois/detail/${id}/`;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST"
      ? Response.json([{ jobAdvertisement: copy }]) : Response.json(copy)));
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const pending = drain(jobroomScraper);
    await vi.runAllTimersAsync();
    expect(await pending).toEqual([expect.objectContaining({ source_id: id, description_status: "ok" })]);
  });

  it.each([false, true])("Job-Room distingue un extrait d'une fiche complète (erreur réseau : %s)", async (networkError) => {
    const copy = ad("truncated-search");
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") return Response.json([{ jobAdvertisement: copy }]);
      if (networkError) throw new Error("network unavailable");
      return new Response("", { status: 503 });
    }));
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const pending = drain(jobroomScraper);
    await vi.runAllTimersAsync();
    const [o] = await pending;
    expect(o.description_status).toBe("partial");
    expect(o.scrape_errors).toContain("Description de recherche uniquement");
  });

  it("les contacts structurés sont exclus, ceux du texte restent dans la description", () => {
    const copy = { ...ad("contact"), contact: { firstName: "Exemple", email: "recruteur@example.org" } };
    copy.jobContent!.jobDescriptions![0].description += " Contact : texte@example.org.";
    const o = adToOffre(copy);
    expect(JSON.stringify(o.raw_payload)).not.toContain("recruteur@example.org");
    expect(o.description_text).toContain("texte@example.org");
  });
});

it("les sélecteurs affichent les taux importés 75 et 95, avec leurs labels", () => {
  const html = renderToStaticMarkup(React.createElement(SwissSettings, {
    workPermit: null, workloadRange: [75, 95], onChange: () => {},
  }));
  const doc = parseDocument(html);
  const selects = Array.from(doc.querySelectorAll("select"));
  expect(selects.map(s => s.value)).toEqual(["75", "95"]);
  expect(selects.every(s => !!doc.querySelector(`label[for="${s.id}"]`))).toBe(true);
});

it("un extrait Job-Room reste visible et signalé comme incomplet dans la liste et la fiche", async () => {
  const id = upsertOffreFromSource("jobroom", {
    ...offer("partial-display", "partial"), description_text: DESCRIPTION, description_html: `<p>${DESCRIPTION}</p>`,
  });
  const result = searchOffres({ query: "Comptable", source: "jobroom" });
  const list = renderToStaticMarkup(React.createElement(OffresList, { initialResult: result }));
  expect(list).toContain("Annonce partielle");
  expect(list).toContain("Description incomplète");
  expect(list).toContain(DESCRIPTION);
  const detail = renderToStaticMarkup(await OffreDetailPage({ params: Promise.resolve({ id: String(id) }) }));
  expect(detail).toContain("Description incomplète");
  expect(detail).toContain(DESCRIPTION);
  expect(detail).not.toContain("Description indisponible");
});

it("les filtres proposent tous les cantons et le calcul voiture exige l'accord de l'utilisateur", () => {
  const html = renderToStaticMarkup(React.createElement(OffresList, { initialResult: searchOffres() }));
  const doc = parseDocument(html);
  const canton = doc.querySelector('select[aria-label="Filtrer par canton suisse"]') as HTMLSelectElement;
  expect(canton.options).toHaveLength(27);
  expect(Array.from(canton.options).map(option => option.textContent).join(" ")).toContain("Bâle-Campagne");
  const panel = Array.from(doc.querySelectorAll("details")).find(node => node.textContent?.includes("Trajet maximal en voiture"))!;
  const checkboxes = Array.from(panel.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
  expect(checkboxes.map(input => input.checked)).toEqual([false, true]);
  expect(panel.querySelector("button")!.disabled).toBe(true);
  expect(panel.textContent).toContain("hors trafic");
});

it("l'aperçu et la fiche distinguent une obligation non couverte d'un simple atout", async () => {
  saveProfile(ProfileFullSchema.parse({ ...profile, languages: [{ name: "Allemand", level: "A2" }] }));
  const description = "Allemand B2 obligatoire. Anglais un atout.";
  const id = upsertOffreFromSource("jobroom", { ...offer("language-display", "ok"), location: "Genève", description_text: description, description_html: `<p>${description}</p>` });
  const result = searchOffres({ query: "Allemand B2 obligatoire" });
  for (const html of [renderToStaticMarkup(React.createElement(OffresList, { initialResult: result })),
    renderToStaticMarkup(await OffreDetailPage({ params: Promise.resolve({ id: String(id) }) }))]) {
    const section = parseDocument(html).querySelector('section[aria-label="Langues demandées"]')!;
    expect(section.textContent).toContain("Langue du texte : indéterminée");
    expect(section.textContent).toContain("Écart avec les langues déclarées");
    expect(section.textContent).toContain("Allemand : A2");
    expect(section.textContent).toContain("Souhaité / atout");
    expect(section.textContent).toContain("Atout non couvert");
  }
});
