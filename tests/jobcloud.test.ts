import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyContract } from "@/lib/contracts";
import {
  extractInitState,
  formatGrades,
  jobupScraper,
  JOBUP,
  parseSearchPage,
} from "@/lib/scrapers/jobcloud";
import type { ProgressEvent, ScrapedOffre } from "@/lib/scrapers/base";
import { upsertOffreFromSource } from "@/lib/db/offres";

/**
 * jobup.ch / jobs.ch (JobCloud) : lecture de l'état « __INIT__ » des pages de
 * recherche et du JSON-LD des fiches. Pages fictives calquées sur la structure
 * relevée en octobre 2026 ; aucun appel réseau (fetch simulé).
 */

const UUID = "44136364-3acb-47ac-910e-0e0a464e9220";

function searchHtml(results: unknown[], numPages = 1): string {
  const state = {
    auth: { notLoggedInUser: null },
    vacancy: { results: { main: { results, meta: { numPages, totalHits: results.length } } } },
  };
  // Le script qui suit contient des accolades : l'extraction doit s'arrêter à la fin de l'objet.
  return `<html><head><script>window.__INIT__ = ${JSON.stringify(state)};window.x = function () { return {}; };</script></head><body></body></html>`;
}

const DETAIL_HTML = `<html><head><script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "JobPosting",
  title: "Ingénieur en automation H/F",
  description:
    "<p><strong>Les missions :</strong></p><ul><li>Analyser les besoins du client et proposer des solutions techniques adaptées.</li><li>Programmer les automates de sécurité.</li></ul>",
  datePosted: "2026-09-28T11:35:31+02:00",
  hiringOrganization: { "@type": "Organization", name: "Actual Switzerland" },
  employmentType: "Durée indéterminée",
  jobLocation: { "@type": "Place", address: { addressRegion: "Jura", addressCountry: "CH" } },
  baseSalary: {
    "@type": "MonetaryAmount",
    currency: "CHF",
    value: { "@type": "QuantitativeValue", minValue: 77672.2, maxValue: 117672.2, unitText: "YEAR" },
  },
})}</script></head><body></body></html>`;

describe("jobcloud — page de recherche", () => {
  it("lit les offres et le nombre de pages dans __INIT__", () => {
    const html = searchHtml(
      [
        {
          id: UUID,
          title: "Ingénieur en automation H/F",
          place: "Jura",
          company: { name: "Actual Switzerland" },
          employmentGrades: [80, 100],
        },
        { id: "", title: "sans identifiant" },
      ],
      13
    );
    const { cards, numPages } = parseSearchPage(html, JOBUP);
    expect(numPages).toBe(13);
    expect(cards).toEqual([
      {
        id: UUID,
        url: `https://www.jobup.ch/fr/emplois/detail/${UUID}/`,
        title: "Ingénieur en automation H/F",
        company: "Actual Switzerland",
        place: "Jura",
        grades: [80, 100],
      },
    ]);
  });

  it("page sans état : aucune offre, sans erreur", () => {
    expect(extractInitState("<html></html>")).toBeNull();
    expect(parseSearchPage("<html></html>", JOBUP).cards).toEqual([]);
  });

  it("taux d'activité", () => {
    expect(formatGrades([80, 100])).toBe("80 – 100 %");
    expect(formatGrades([100, 100])).toBe("100 %");
    expect(formatGrades([])).toBeNull();
  });
});

describe("jobcloud — scan", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function run(countries: string[]) {
    const fetchMock = vi.fn(async (url: string) => {
      const html = url.includes("/detail/")
        ? DETAIL_HTML
        : searchHtml([{ id: UUID, title: "Ingénieur en automation H/F", place: "Jura", company: { name: "Actual Switzerland" }, employmentGrades: [100, 100] }]);
      return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const events: ProgressEvent[] = [];
    const offres: ScrapedOffre[] = [];
    const gen = jobupScraper.scrape({ sectors: ["automation"], countries }, (e) => events.push(e));
    const drain = (async () => {
      for await (const o of gen) offres.push(o);
    })();
    while (!events.some((e) => e.kind === "done")) await vi.advanceTimersByTimeAsync(2000);
    await drain;
    vi.useRealTimers();
    return { offres, events, fetchMock };
  }

  it("profil ciblant la Suisse : offre complète depuis le JSON-LD", async () => {
    const { offres, fetchMock } = await run(["Suisse", "France"]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://www.jobup.ch/fr/emplois/?term=automation");
    expect(offres).toHaveLength(1);
    const o = offres[0];
    expect(o.country).toBe("Suisse");
    expect(o.location).toBe("Jura");
    expect(o.company).toBe("Actual Switzerland");
    expect(o.contract_type).toBe("Durée indéterminée · 100 %");
    expect(o.salary?.replace(/\s/g, " ")).toBe("77 672 – 117 672 CHF / an");
    expect(o.posted_at).toBe("2026-09-28");
    expect(o.description_status).toBe("ok");
  });

  it("offre déjà enregistrée depuis jobs.ch (même UUID) : ni rechargée ni dupliquée", async () => {
    upsertOffreFromSource("jobsch", {
      source_id: UUID,
      url: `https://www.jobs.ch/fr/offres-emplois/detail/${UUID}/`,
      title: "Ingénieur en automation H/F",
      company: "Actual Switzerland",
      country: "Suisse",
      location: "Jura",
      contract_type: null,
      salary: null,
      description_html: "",
      description_text: "",
      description_status: "ok",
      posted_at: null,
      is_vie: false,
      raw_payload: {},
    });
    const { offres, fetchMock } = await run(["Suisse"]);
    expect(offres).toEqual([]);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/detail/"))).toBe(false);
  });

  it("profil sans la Suisse : source sautée, aucune requête", async () => {
    const { offres, fetchMock } = await run(["France"]);
    expect(offres).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("classifyContract — vocabulaire suisse", () => {
  const c = (contract_type: string, description_text = "") =>
    classifyContract({ contract_type, title: "Ingénieur", description_text });

  it("JobCloud : durée indéterminée / déterminée", () => {
    expect(c("Durée indéterminée · 80 – 100 %")).toBe("cdi");
    expect(c("Durée déterminée · 100 %")).toBe("cdd");
  });

  it("allemand", () => {
    expect(c("Festanstellung")).toBe("cdi");
    expect(c("Unbefristet")).toBe("cdi");
    expect(c("Befristet")).toBe("cdd");
    expect(c("Praktikum")).toBe("stage");
    expect(c("Lehrstelle")).toBe("alternance");
  });

  it("« capacité d'apprentissage » (qualité demandée) n'en fait pas une alternance", () => {
    expect(c("Durée déterminée · 100 %", "Bonne capacité d'apprentissage et d'autonomie.")).toBe("cdd");
    expect(c("", "Contrat d'apprentissage de 3 ans.")).toBe("alternance");
  });

  it("« abgeschlossene Lehre » (prérequis) n'en fait pas une alternance", () => {
    expect(c("Festanstellung", "Sie verfügen über eine abgeschlossene Lehre als Elektroinstallateur.")).toBe("cdi");
  });
});
