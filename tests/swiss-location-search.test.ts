import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { saveProfile } from "@/lib/db/queries";
import { searchOffres, upsertOffreFromSource, type ScrapedOffre } from "@/lib/db/offres";
import { resolveSwissCanton } from "@/lib/swiss-geography";
import { ProfileFullSchema } from "@/lib/cv/types";
import { profile } from "./fixtures";
import { GET } from "@/app/api/offres/search/route";
import { NextRequest } from "next/server";

let seq = 0;
function add(location: string | null, over: Partial<ScrapedOffre> = {}, source = "jobroom") {
  return upsertOffreFromSource(source, { source_id: `geo-${++seq}`, url: "https://example.org/offre", title: "Comptable", company: "Exemple", country: "Suisse", location, contract_type: "CDI", salary: null, description_text: "Offre de comptable", description_html: "", description_status: "ok", posted_at: null, is_vie: false, raw_payload: {}, ...over });
}
beforeEach(() => { getDb().exec("DELETE FROM documents; DELETE FROM offres; DELETE FROM profile"); });

describe("cantons et villes", () => {
  it("privilégie la région structurée et ne devine pas les villes inconnues", () => {
    expect(resolveSwissCanton("VD", "Lieu inconnu")).toBe("VD");
    expect(resolveSwissCanton(null, "Genève (GE)")).toBe("GE");
    expect(resolveSwissCanton(null, "Lausanne")).toBe("VD");
    expect(resolveSwissCanton(null, "Village inconnu")).toBeNull();
  });

  it("distingue Bâle-Ville et Bâle-Campagne et traite les noms français/allemands", () => {
    const city = add("Basel", { canton: "BS" });
    const country = add("Liestal", { canton: "BL" });
    expect(searchOffres({ canton: "BS", city: "Bâle" }).offers.map(o => o.id)).toEqual([city]);
    expect(searchOffres({ canton: "BL" }).offers.map(o => o.id)).toEqual([country]);
    const geneva = add("Genf (GE)");
    expect(searchOffres({ city: "geneve" }).offers.map(o => o.id)).toEqual([geneva]);
  });

  it("Bern retrouve Berne sans inclure Berneck, et Paris ne retrouve pas Parisot", () => {
    const bern = add("Bern, BE, Switzerland");
    const berne = add("Berne");
    add("Berneck (SG)");
    expect(searchOffres({ city: "Bern" }).offers.map(o => o.id).sort()).toEqual([bern, berne].sort());
    const paris = add("75008 Paris, France", { country: "France" });
    add("Parisot, France", { country: "France" });
    expect(searchOffres({ country: "France", city: "Paris" }).offers.map(o => o.id)).toEqual([paris]);
  });

  it("combine canton et ville sans rechercher le lieu dans la description", () => {
    const hit = add("Nyon", { canton: "VD" });
    add("Lausanne", { description_text: "Déplacements à Nyon" });
    add("Nyon", { country: "France" });
    add(null);
    expect(searchOffres({ canton: "VD", city: "NYON" }).offers.map(o => o.id)).toEqual([hit]);
  });

  it("les anciennes offres sans canton utilisent uniquement les lieux reconnus", () => {
    const id = add("Neuchâtel");
    getDb().prepare("UPDATE offres SET canton = NULL WHERE id = ?").run(id);
    expect(searchOffres({ canton: "NE" }).offers.map(o => o.id)).toEqual([id]);
  });

  it.each([
    ["Geneva, Geneva, Switzerland", "GE"], ["Lausanne, Vaud, Suisse", "VD"], ["Genève, CH", "GE"],
    ["1003 Lausanne", "VD"], ["Biel/Bienne", "BE"], ["Basel, Basel-Stadt, Schweiz", "BS"],
  ] as const)("reconnaît le canton dans un lieu composé : %s", (location, canton) => {
    expect(resolveSwissCanton(null, location)).toBe(canton);
    const id = add(location);
    expect(searchOffres({ canton }).offers.map(o => o.id)).toEqual([id]);
  });

  it("ne déduit pas un canton d'un lieu contradictoire ou de plusieurs villes", () => {
    for (const location of ["Genève, Lausanne", "Genève, Vaud, Suisse", "Biel/Lausanne"]) expect(resolveSwissCanton(null, location)).toBeNull();
  });

  it("le filtre canton reste indépendant de la présence sur site", () => {
    const id = add("Télétravail, VD");
    expect(searchOffres({ canton: "VD" }).offers.map(o => o.id)).toEqual([id]);
  });

  it.each(["linkedin", "talent"])("les offres suisses de %s restent accessibles, même sans canton enregistré", source => {
    const first = add("Geneva, Geneva, Switzerland", {}, source);
    const second = add("Genève, CH", {}, source);
    const third = add("Lausanne, Vaud, Suisse", {}, source);
    // Offres anciennes : aucun nouveau scan n'est nécessaire pour bénéficier du correctif.
    getDb().exec("UPDATE offres SET canton = NULL");
    expect(searchOffres({ source, canton: "GE", city: "Genève" }).offers.map(o => o.id).sort()).toEqual([first, second].sort());
    expect(searchOffres({ source, canton: "VD" }).offers.map(o => o.id)).toEqual([third]);
  });

  it("préserve les lieux, pays, contrats et filtres des offres françaises", async () => {
    const paris = add("75008 Paris, Île-de-France, France", { country: "France" }, "francetravail");
    const lyon = add("69003 Lyon, Auvergne-Rhône-Alpes, France", { country: "France" }, "hellowork");
    const alias = add("Geneva, Geneva, Switzerland", { country: "France", canton: "GE" }, "talent");
    add("Geneva, Geneva, Switzerland");
    const france = searchOffres({ country: "France" });
    expect(france.total).toBe(3);
    expect(france.offers.every(o => o.canton === null && o.contract_category === "cdi" && o.score === 0)).toBe(true);
    expect(searchOffres({ country: "France", city: "PARIS", source: "francetravail" }).offers.map(o => o.id)).toEqual([paris]);
    expect(searchOffres({ country: "France", city: "lyon" }).offers.map(o => o.id)).toEqual([lyon]);
    expect(france.offers.find(o => o.id === alias)!.location).toBe("Geneva, Geneva, Switzerland");
    expect(searchOffres({ country: "France", canton: "GE" }).total).toBe(0);
    const response = await GET(new NextRequest("http://localhost/api/offres/search?country=France&city=Paris"));
    expect((await response.json()).offers).toEqual([expect.objectContaining({ id: paris, country: "France", location: "75008 Paris, Île-de-France, France", canton: null })]);
  });

  it("analyse aussi les exigences après l'extrait de 1 000 caractères et suit le profil actualisé", () => {
    saveProfile(ProfileFullSchema.parse({ ...profile, target_countries: ["Suisse"], languages: [{ name: "Allemand", level: "A2" }] }));
    add("Genève", { description_text: "Contexte. ".repeat(150) + " Allemand B2 obligatoire." });
    expect(searchOffres().offers[0].language_assessment.checks[0].status).toBe("gap");
    saveProfile(ProfileFullSchema.parse({ ...profile, target_countries: ["Suisse"], languages: [{ name: "Allemand", level: "C1" }] }));
    expect(searchOffres().offers[0].language_assessment.checks[0].status).toBe("compatible");
    expect(searchOffres().offers[0].description_text).toHaveLength(1000);
  });

  it("l'API applique les filtres et rejette les durées de trajet invalides", async () => {
    const id = add("Lausanne");
    add("Genève");
    const response = await GET(new NextRequest("http://localhost/api/offres/search?canton=VD&city=lausanne"));
    expect((await response.json()).offers.map((o: { id: number }) => o.id)).toEqual([id]);
    expect((await GET(new NextRequest("http://localhost/api/offres/search?origin=Annemasse&maxMinutes=-2"))).status).toBe(400);
    expect((await GET(new NextRequest("http://localhost/api/offres/search?canton=XX"))).status).toBe(400);
  });
});
