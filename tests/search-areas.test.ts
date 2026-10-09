import { expect, it, vi } from "vitest";
import { matchesSearchAreas, SearchAreaSchema, frenchDepartment, type SearchArea } from "@/lib/search-areas";
import { saveProfile, getProfile } from "@/lib/db/queries";
import { upsertOffreFromSource, searchOffres, suggestedOffres, offresCounts } from "@/lib/db/offres";
import { profile, offre } from "./fixtures";
import { francetravailScraper } from "@/lib/scrapers/francetravail";
import { createIndeedScraper } from "@/lib/scrapers/indeed";
import type { ScrapedOffre } from "@/lib/scrapers/base";
vi.mock("@/lib/scrapers/dom", async original => ({ ...await original<typeof import("@/lib/scrapers/dom")>(), sleep: async () => {} }));
const geneva: SearchArea = { country: "CH", kind: "canton", value: "GE" };
const savoie: SearchArea = { country: "FR", kind: "department", value: "74" };
const ara: SearchArea = { country: "FR", kind: "region", value: "84" };

it("limite la Suisse au canton sélectionné sans confondre Fribourg et France", () => {
  expect(matchesSearchAreas({ country: "Switzerland", location: "Meyrin" }, [geneva])).toBe(true);
  expect(matchesSearchAreas({ country: "CH", location: "Zurich" }, [geneva])).toBe(false);
  expect(matchesSearchAreas({ country: "France", location: "Paris" }, [geneva])).toBe(true);
  expect(matchesSearchAreas({ country: "France", location: "Paris", canton: "FR" }, [{ country: "CH", kind: "canton", value: "FR" }])).toBe(true);
});
it("combine plusieurs villes en union, normalise les accents et conserve les limites de mots", () => {
  const areas: SearchArea[] = [{ country: "CH", kind: "city", value: "Genève" }, { country: "CH", kind: "city", value: "Nyon" }];
  expect(matchesSearchAreas({ country: "Suisse", location: "Genf, GE" }, areas)).toBe(true);
  expect(matchesSearchAreas({ country: "Suisse", location: "Nyon, Vaud" }, areas)).toBe(true);
  expect(matchesSearchAreas({ country: "Suisse", location: "Nyons" }, areas)).toBe(false);
});
it("reconnaît départements et régions à partir des données du lieu, sans analyser la description", () => {
  expect(matchesSearchAreas({ country: "France", location: "74 - Annecy" }, [savoie, ara])).toBe(true);
  expect(matchesSearchAreas({ country: "France", location: "Paris", raw_payload: { department: "75" } }, [ara])).toBe(false);
  expect(matchesSearchAreas({ country: "France", location: "Annecy", raw_payload: { department: "74" } }, [ara])).toBe(true);
  expect(frenchDepartment("Annecy 74000")).toBe("74");
  expect(frenchDepartment("27 rue du Lac, Annecy")).toBeNull();
});
it("exclut par défaut les lieux inconnus, propose de les garder, mais ne garde pas les lieux connus hors zone", () => {
  expect(matchesSearchAreas({ country: "Suisse", location: null }, [geneva])).toBe(false);
  expect(matchesSearchAreas({ country: "Suisse", location: null }, [geneva], true)).toBe(true);
  expect(matchesSearchAreas({ country: "Suisse", location: "Zurich" }, [geneva], true)).toBe(false);
  expect(matchesSearchAreas({ country: "France", location: "Annecy" }, [ara])).toBe(false);
  expect(matchesSearchAreas({ country: "France", location: "Annecy" }, [ara], true)).toBe(true);
});
it("refuse les zones incompatibles et les codes inexistants", () => {
  expect(SearchAreaSchema.safeParse({ country: "FR", kind: "canton", value: "GE" }).success).toBe(false);
  expect(SearchAreaSchema.safeParse({ country: "CH", kind: "region", value: "84" }).success).toBe(false);
  expect(SearchAreaSchema.safeParse({ country: "FR", kind: "department", value: "999" }).success).toBe(false);
});
it("persiste les zones et filtre aussi les anciennes offres, les compteurs et les suggestions", () => {
  saveProfile({ ...profile, target_countries: ["France", "Suisse"], search_areas: [geneva, ara], include_unknown_locations: false });
  expect(getProfile()?.search_areas).toEqual([geneva, ara]);
  const base: ScrapedOffre = { source_id: "geneva", url: "https://example.org/geneva", title: offre.title, company: "Test", country: "Suisse", location: "Genève", contract_type: "CDI", salary: null, description_html: "", description_text: "Test", description_status: "ok", posted_at: null, is_vie: false, raw_payload: {} };
  upsertOffreFromSource("jobup", base);
  upsertOffreFromSource("jobup", { ...base, source_id: "zurich", location: "Zurich" });
  upsertOffreFromSource("francetravail", { ...base, source_id: "annecy", country: "France", location: "Annecy", raw_payload: { department: "74" } });
  upsertOffreFromSource("francetravail", { ...base, source_id: "paris", country: "France", location: "Paris", raw_payload: { department: "75" } });
  expect(searchOffres().offers.map(offer => offer.location).sort()).toEqual(["Annecy", "Genève"]);
  expect(offresCounts().total).toBe(2);
  expect(suggestedOffres(6)).toHaveLength(2);
  saveProfile({ ...profile, target_countries: ["France", "Suisse"], search_areas: [] });
  expect(searchOffres().total).toBe(4);
});
it("France Travail cible le département avant la collecte et garde le code pour le filtre régional", async () => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(url);
    return new Response(url.includes("/detail/") ? `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", description: "Description complète du poste. ".repeat(15) })}</script>` : '<li data-id-offre="X1"><h2>Support IT</h2><p class="subtext">Entreprise - 74 - Annecy</p><p>Description du poste disponible pour les candidats.</p></li>');
  }));
  try {
    const results: ScrapedOffre[] = [];
    for await (const offer of francetravailScraper.scrape({ countries: ["France"], sectors: ["informatique"], search_areas: [savoie], maxOffres: 1 }, () => {})) results.push(offer);
    expect(new URL(calls[0]).searchParams.get("lieux")).toBe("74D");
    expect(results[0].raw_payload.department).toBe("74");
    expect(matchesSearchAreas(results[0], [ara])).toBe(true);
  } finally { vi.unstubAllGlobals(); }
});

it("Indeed envoie le canton dans le lieu de recherche sans requête nationale", async () => {
  const read = vi.fn(async (_url: string) => '<div id="no_results">Aucune offre</div>');
  for await (const offer of createIndeedScraper(read).scrape({ countries: ["Suisse"], sectors: ["IT"], search_areas: [geneva], maxOffres: 1 }, () => {})) void offer;
  expect(read).toHaveBeenCalledTimes(1);
  expect(new URL(read.mock.calls[0][0] as string).searchParams.get("l")).toBe("Genève, Suisse");
});
