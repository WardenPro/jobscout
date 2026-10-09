import { expect, it, vi } from "vitest";
import { indeedScraper } from "@/lib/scrapers/indeed";
import type { ScrapedOffre } from "@/lib/scrapers/base";

const mocks = vi.hoisted(() => ({ closeContext: vi.fn(), closeBrowser: vi.fn(), goto: vi.fn(), probe: vi.fn() }));
vi.mock("@/lib/scrapers/dom", async original => ({ ...await original<typeof import("@/lib/scrapers/dom")>(), sleep: async () => {} }));
vi.mock("@/lib/scrapers/indeed-browser", () => ({
  openIndeedDiagnosticBrowser: async () => ({
    browser: { close: mocks.closeBrowser },
    context: { close: mocks.closeContext, newPage: async () => ({
      goto: mocks.goto, waitForFunction: async () => {},
      content: async () => `<title>Indeed</title>${["a123456789abcdef", "b123456789abcdef"].map(id => `<div class="job_seen_beacon"><h2><a data-jk="${id}" href="/viewjob?jk=${id}">Support IT</a></h2><span class="companyName">Entreprise</span><div class="companyLocation">Genève</div><div class="job-snippet">Extrait du poste</div></div>`).join("")}`,
    }) },
  }),
  probeIndeedDetail: mocks.probe,
}));

it("recherche dans Chrome sans fetch, conserve les cartes après un refus et ferme le navigateur", async () => {
  mocks.goto.mockResolvedValue({ ok: () => true, status: () => 200 });
  mocks.probe.mockResolvedValue({ status: "blocked", httpStatus: 401, message: "Accès refusé" });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  try {
    const offers: ScrapedOffre[] = [];
    for await (const offer of indeedScraper.scrape({ countries: ["Suisse"], sectors: ["informatique"], maxOffres: 2 }, () => {})) offers.push(offer);
    expect(offers).toHaveLength(2);
    expect(offers.map(offer => offer.description_status)).toEqual(["partial", "partial"]);
    expect(mocks.goto).toHaveBeenCalledTimes(1);
    expect(mocks.probe).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.closeContext).toHaveBeenCalledTimes(1);
    expect(mocks.closeBrowser).toHaveBeenCalledTimes(1);
  } finally { vi.unstubAllGlobals(); }
});
