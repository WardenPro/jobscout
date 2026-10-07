import { afterEach, describe, expect, it, vi } from "vitest";
import { adToOffre, jobroomScraper, markdownToHtml, type JobAd } from "@/lib/scrapers/jobroom";
import { upsertOffreFromSource } from "@/lib/db/offres";
import type { ProgressEvent, ScrapedOffre } from "@/lib/scrapers/base";

/**
 * Job-Room (SECO) : annonces JSON de l'API publique du site, description en
 * Markdown. Annonces fictives calquées sur celles relevées en octobre 2026 ;
 * aucun appel réseau (fetch simulé).
 */

const LONG = "Vous assurez de manière autonome la gestion comptable et administrative de l'entreprise, du bouclement à la TVA.";

function ad(over: Partial<JobAd> = {}, description = `## Votre mission ##\n\n${LONG}\n\n*  Comptabilité générale\n*  Salaires`): JobAd {
  return {
    id: "df879127-a517-4d52-9777-5cbbe8714f51",
    stellennummerEgov: "242802603",
    sourceSystem: "JOBROOM",
    publication: { startDate: "2026-10-07" },
    jobContent: {
      externalUrl: null,
      jobDescriptions: [
        { languageIsoCode: "de", title: "Buchhalterin", description: "Deutsch" },
        { languageIsoCode: "fr", title: "Responsable <em>comptable</em>", description },
      ],
      company: { name: "Carrosserie de Boudry SA" },
      employment: { permanent: true, workloadPercentageMin: "60", workloadPercentageMax: "80" },
      location: { city: "Boudry", cantonCode: "NE" },
    },
    ...over,
  };
}

describe("Job-Room — conversion d'une annonce", () => {
  it("champs, description française, contrat et taux d'activité", () => {
    const o = adToOffre(ad());
    expect(o).toMatchObject({
      source_id: "df879127-a517-4d52-9777-5cbbe8714f51",
      url: "https://www.job-room.ch/job-search/df879127-a517-4d52-9777-5cbbe8714f51",
      title: "Responsable comptable",
      company: "Carrosserie de Boudry SA",
      country: "Suisse",
      location: "Boudry",
      contract_type: "Durée indéterminée · 60 – 80 %",
      posted_at: "2026-10-07",
      description_status: "ok",
    });
    expect(o.description_html).toContain("<h3>Votre mission</h3>");
    expect(o.description_html).toContain("<li>Comptabilité générale</li>");
    // Aucun contact nominatif conservé.
    expect(JSON.stringify(o.raw_payload)).not.toMatch(/mail|phone|firstName/i);
  });

  it("Markdown d'une annonce reprise : en-tête technique et échappements retirés", () => {
    const html = markdownToHtml(
      "--- base: meta-keywords: meta-viewport: width=device-width, title: Aide-comptable --- Aide\\\\-comptable\n===============\n\n\\*\\*Regen Lab SA\\*\\* recrute."
    );
    expect(html).toBe("<h3>Aide-comptable</h3>\n<p><strong>Regen Lab SA</strong> recrute.</p>");
  });

  it("annonce aplatie sur une ligne et logo en image : titre séparé, image retirée", () => {
    expect(markdownToHtml("Ref 1 \\| Date\n\n![Albedis]( )\n\nComptable ========== Nous recrutons (try \\& hire).")).toBe(
      "<p>Ref 1 | Date</p>\n<p>Comptable</p>\n<p>Nous recrutons (try &amp; hire).</p>"
    );
  });

  it("le HTML de l'annonce est échappé", () => {
    expect(markdownToHtml("<script>alert(1)</script> texte")).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt; texte</p>");
  });
});

describe("Job-Room — scan", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function run(countries: string[], ads: JobAd[]) {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return Response.json(ads.map((a) => ({ jobAdvertisement: a })));
      const id = url.split("/").pop();
      const found = ads.find((a) => a.id === id);
      return found ? Response.json(found) : new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const events: ProgressEvent[] = [];
    const offres: ScrapedOffre[] = [];
    const drain = (async () => {
      for await (const o of jobroomScraper.scrape({ sectors: ["comptable"], countries }, (e) => events.push(e))) offres.push(o);
    })();
    while (!events.some((e) => e.kind === "done")) await vi.advanceTimersByTimeAsync(2000);
    await drain;
    vi.useRealTimers();
    return { offres, fetchMock };
  }

  it("recherche par mot-clé puis détail de chaque annonce", async () => {
    const { offres, fetchMock } = await run(["Suisse"], [ad()]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/jobadservice/api/jobAdvertisements/_search?page=0");
    expect(JSON.parse(String(init.body)).keywords).toEqual(["comptable"]);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://www.job-room.ch/jobadservice/api/jobAdvertisements/df879127-a517-4d52-9777-5cbbe8714f51"
    );
    expect(offres.map((o) => o.title)).toEqual(["Responsable comptable"]);
  });

  it("annonce reprise de jobup.ch déjà enregistrée : écartée", async () => {
    const uuid = "b6af1e12-fc27-4783-bf97-94d53c0630f3";
    upsertOffreFromSource("jobup", {
      source_id: uuid,
      url: `https://www.jobup.ch/fr/emplois/detail/${uuid}/`,
      title: "Aide-comptable",
      company: "Regen Lab SA",
      country: "Suisse",
      location: "Monthey",
      contract_type: null,
      salary: null,
      description_html: "",
      description_text: "",
      description_status: "ok",
      posted_at: null,
      is_vie: false,
      raw_payload: {},
    });
    const copy = ad({ id: "9d505818-f64a-4fd9-8b82-711b67488d68", externalReference: uuid, sourceSystem: "API" });
    copy.jobContent = { ...copy.jobContent, externalUrl: `https://www.jobup.ch/fr/emplois/detail/${uuid}/?utm_source=job-room.ch` };
    const { offres } = await run(["Suisse"], [copy, ad()]);
    expect(offres.map((o) => o.source_id)).toEqual(["df879127-a517-4d52-9777-5cbbe8714f51"]);
  });

  it("profil sans la Suisse : source sautée, aucune requête", async () => {
    const { offres, fetchMock } = await run(["France"], [ad()]);
    expect(offres).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
