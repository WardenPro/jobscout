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
function add(location: string | null, over: Partial<ScrapedOffre> = {}) {
  return upsertOffreFromSource("jobroom", { source_id: `geo-${++seq}`, url: "https://example.org/offre", title: "Comptable", company: "Exemple", country: "Suisse", location, contract_type: "CDI", salary: null, description_text: "Offre de comptable", description_html: "", description_status: "ok", posted_at: null, is_vie: false, raw_payload: {}, ...over });
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

  it("analyse aussi les exigences après l'extrait de 1 000 caractères et suit le profil actualisé", () => {
    saveProfile(ProfileFullSchema.parse({ ...profile, languages: [{ name: "Allemand", level: "A2" }] }));
    add("Genève", { description_text: "Contexte. ".repeat(150) + " Allemand B2 obligatoire." });
    expect(searchOffres().offers[0].language_assessment.checks[0].status).toBe("gap");
    saveProfile(ProfileFullSchema.parse({ ...profile, languages: [{ name: "Allemand", level: "C1" }] }));
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
