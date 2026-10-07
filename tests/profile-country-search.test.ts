import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { saveProfile } from "@/lib/db/queries";
import { searchOffres, suggestedOffres, offresCounts, listOffres, setOffreScore, upsertOffreFromSource } from "@/lib/db/offres";
import { highScoreFigure, untrackedOffresCount, vieFigure } from "@/lib/db/dashboard";
import { ProfileFullSchema } from "@/lib/cv/types";
import { normalizeCountryName } from "@/lib/countries";
import { GET } from "@/app/api/offres/search/route";
import { GET as allOffers } from "@/app/api/offres/route";
import { POST as commute } from "@/app/api/offres/commute/route";
import { profile } from "./fixtures";

let ids: number[];
beforeEach(() => {
  getDb().exec("DELETE FROM documents; DELETE FROM candidatures; DELETE FROM offres; DELETE FROM profile");
  ids = ["France", "Suisse", "CH", "Switzerland", "Belgique", null].map((country, index) => {
    const id = upsertOffreFromSource(index === 0 ? "francetravail" : "jobroom", {
      source_id: `country-${index}`, url: "https://example.org/offre", title: index === 2 ? "Poste V.I.E" : `Poste ${index}`, company: "Exemple",
      country, location: "Genève", contract_type: "CDI", salary: null, description_text: "Comptabilité.", description_html: "", description_status: "ok",
      posted_at: new Date().toISOString().slice(0, 10), is_vie: index === 2, raw_payload: {},
    });
    setOffreScore(id, { score: index === 0 ? 100 : 90, breakdown: { sector: 0, skills: 0, country: 0 }, reason: "Test" });
    return id;
  });
});
afterEach(() => vi.unstubAllGlobals());
function target(countries: string[]) { saveProfile(ProfileFullSchema.parse({ ...profile, target_countries: countries })); }

describe("pays ciblés du profil", () => {
  it.each([
    { countries: ["France"], indexes: [0], labels: ["France"] },
    { countries: ["Suisse"], indexes: [1, 2, 3], labels: ["Suisse"] },
    { countries: ["France", "Suisse"], indexes: [0, 1, 2, 3], labels: ["France", "Suisse"] },
    { countries: ["Belgique"], indexes: [4], labels: ["Belgique"] },
  ])("résultats, villes et facettes limités à $countries", ({ countries, indexes, labels }) => {
    target(countries);
    const result = searchOffres({ city: "Genève" });
    expect(result.offers.map(o => o.id).sort()).toEqual(indexes.map(i => ids[i]).sort());
    expect(result.total).toBe(indexes.length);
    expect(result.facets.total).toBe(indexes.length);
    expect(result.facets.countries).toEqual(labels);
    expect(Object.values(result.facets.contractCounts).reduce((sum, count) => sum + count, 0)).toBe(indexes.length);
    expect(result.offers.every(o => countries.includes(normalizeCountryName(o.country)!))).toBe(true);
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM offres").get()).toMatchObject({ n: 6 });
  });

  it("aucun profil ou aucun pays ciblé conserve la recherche dans tous les pays", () => {
    expect(searchOffres().total).toBe(6);
    target([]);
    expect(searchOffres().total).toBe(6);
  });

  it("un changement de profil prend effet sans scan ni redémarrage", () => {
    target(["France"]);
    expect(searchOffres().offers.map(o => o.id)).toEqual([ids[0]]);
    target(["Suisse"]);
    expect(searchOffres().offers.map(o => o.id).sort()).toEqual(ids.slice(1, 4).sort());
    target(["France", "Suisse"]);
    expect(searchOffres().total).toBe(4);
  });

  it.each([
    { country: "Suisse", excluded: "France", alias: "CH", count: 3 },
    { country: "France", excluded: "Suisse", alias: "FR", count: 1 },
  ])("l'API et le filtre de pays ne peuvent pas élargir le périmètre $country", async ({ country, excluded, alias, count }) => {
    target([country]);
    expect(searchOffres({ country: excluded }).total).toBe(0);
    expect(searchOffres({ country: alias }).total).toBe(count);
    const result = await GET(new NextRequest(`http://localhost/api/offres/search?country=${excluded}&city=Genève`));
    expect((await result.json()).total).toBe(0);
    const legacy = await allOffers(new NextRequest(`http://localhost/api/offres?country=${excluded}`));
    expect((await legacy.json()).offres).toEqual([]);
  });

  it("les suggestions et les compteurs de l'accueil suivent aussi le profil", () => {
    target(["Suisse"]);
    expect(suggestedOffres(6).map(o => o.id).sort()).toEqual(ids.slice(1, 4).sort());
    expect(offresCounts()).toEqual({ total: 3, today: 3, vie: 1 });
    expect(highScoreFigure()).toEqual({ total: 3, recent: 3 });
    expect(vieFigure()).toEqual({ total: 1, recent: 1 });
    expect(untrackedOffresCount()).toBe(3);
    getDb().prepare("INSERT INTO candidatures (offre_id) VALUES (?)").run(ids[1]);
    expect(untrackedOffresCount()).toBe(2);
    expect(suggestedOffres(6, true).map(o => o.id).sort()).toEqual(ids.slice(2, 4).sort());
    // La lecture complète destinée au re-scoring et les candidatures historiques restent disponibles.
    expect(listOffres()).toHaveLength(6);
  });

  it("un profil France garde ses offres avec un filtre trajet, sans calculer les anciennes offres suisses", async () => {
    target(["France"]);
    expect(searchOffres({ commute: { origin: "Annemasse", maxMinutes: 30, includeUnknown: false } }).offers.map(o => o.id)).toEqual([ids[0]]);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await commute(new NextRequest("http://localhost/api/offres/commute", { method: "POST", body: JSON.stringify({ origin: "Annemasse", consent: true }) }));
    expect(await response.json()).toEqual({ calculated: 0, remaining: 0, unknown: [] });
    expect(fetch).not.toHaveBeenCalled();
  });
});
