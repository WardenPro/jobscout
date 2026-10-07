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
