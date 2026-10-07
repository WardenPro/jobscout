import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cachedCommute, calculateCommutes, commuteCity } from "@/lib/commute";
import { getDb } from "@/lib/db";
import { searchOffres, upsertOffreFromSource } from "@/lib/db/offres";
import { POST } from "@/app/api/offres/commute/route";
import { NextRequest } from "next/server";

function geo(name: string, countrycode: string, coordinates: number[]) {
  return { properties: { name, countrycode, osm_value: "city" }, geometry: { coordinates } };
}
function mockServices() {
  const fetch = vi.fn(async (raw: URL) => {
    const url = new URL(raw);
    if (url.hostname === "photon.komoot.io") {
      const origin = url.searchParams.get("q")?.includes("Annemasse");
      return Response.json({ features: [origin ? geo("Annemasse", "FR", [6.235, 46.194]) : geo("Genève", "CH", [6.143, 46.204])] });
    }
    return Response.json({ code: "Ok", routes: [{ duration: 1201, distance: 9500 }] });
  });
  vi.stubGlobal("fetch", fetch);
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  return fetch;
}
beforeEach(() => { getDb().exec("DELETE FROM commute_routes; DELETE FROM commute_geocodes; DELETE FROM commute_failures; DELETE FROM documents; DELETE FROM offres"); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("trajets en voiture volontaires", () => {
  it("calcule un itinéraire routier, arrondit vers le haut et réutilise le cache", async () => {
    const fetch = mockServices();
    const pending = calculateCommutes("Annemasse", ["Genève", "Genève"]);
    await vi.runAllTimersAsync();
    expect(await pending).toEqual({ calculated: 1, remaining: 0, unknown: [] });
    expect(cachedCommute("ANNEMASSE", "Genève")).toMatchObject({ minutes: 21, distanceKm: 9.5 });
    expect(fetch.mock.calls.at(-1)![0].pathname).toContain("/route/v1/driving/6.235,46.194;6.143,46.204");
    expect(await calculateCommutes("Annemasse", ["Genève"])).toEqual({ calculated: 0, remaining: 0, unknown: [] });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("ne choisit pas arbitrairement une commune ambiguë", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ features: [geo("Annemasse", "FR", [6.1, 46]), geo("Annemasse", "FR", [6.2, 46])] })));
    await expect(calculateCommutes("Annemasse", ["Genève"])).rejects.toThrow("ambigu");
    expect(cachedCommute("Annemasse", "Genève")).toBeNull();
  });

  it("écarte les lieux multiples et retire le canton d'une ville précise", () => {
    for (const location of ["Genève / Lausanne", "Genève, Lausanne", "Télétravail", "Télétravail, VD", "Suisse"]) expect(commuteCity(location)).toBeNull();
    expect(commuteCity("Genève GE")).toBe("Genève");
    expect(commuteCity("Genève (GE), Suisse")).toBe("Genève");
  });

  it.each([
    ["1003 Lausanne", "Lausanne"], ["Biel/Bienne", "Bienne"], ["Bienne/Biel", "Bienne"],
    ["Geneva, Geneva, Switzerland", "Genève"], ["Lausanne, Vaud, Suisse", "Lausanne"], ["Genève, CH", "Genève"],
    ["Genève CH", "Genève"], ["Vaud, Lausanne, CH", "Lausanne"],
  ])("extrait une destination unique dans %s", (location, city) => {
    expect(commuteCity(location)).toBe(city);
  });

  it("ignore le NPA de destination, reconnaît Biel/Bienne et unifie les caches", async () => {
    const fetch = mockServices();
    fetch.mockImplementation(async (raw: URL) => {
      const url = new URL(raw);
      if (url.hostname !== "photon.komoot.io") return Response.json({ code: "Ok", routes: [{ duration: 1200, distance: 9500 }] });
      const town = url.searchParams.get("q")!.replace(/ (France|Suisse)$/, "");
      const feature = town === "Annemasse" ? geo(town, "FR", [6.2, 46]) : geo(town === "Bienne" ? "Biel/Bienne" : town, "CH", [6.1, 46]);
      return Response.json({ features: [{ ...feature, properties: { ...feature.properties, postcode: town === "Lausanne" ? "1000" : "1950" } }] });
    });
    const pending = calculateCommutes("Annemasse", ["1003 Lausanne", "Biel/Bienne", "1950 Sion", "Sion"]);
    await vi.runAllTimersAsync();
    expect(await pending).toEqual({ calculated: 3, remaining: 0, unknown: [] });
    expect(fetch).toHaveBeenCalledTimes(7);
    expect(cachedCommute("Annemasse", "Sion")).toEqual(cachedCommute("Annemasse", "1950 Sion"));
    expect(cachedCommute("Annemasse", "Biel")).toEqual(cachedCommute("Annemasse", "Biel/Bienne"));
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM commute_routes").get()).toMatchObject({ n: 3 });
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM commute_geocodes WHERE place_key LIKE 'CH:%'").get()).toMatchObject({ n: 3 });
    expect((await calculateCommutes("Annemasse", ["Lausanne, Vaud, Suisse", "Bienne", "Sion"])).calculated).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(7);
  });

  it("le départ français garde la vérification du code postal pour départager les homonymes", async () => {
    const fetch = mockServices();
    fetch.mockImplementation(async (raw: URL) => {
      const url = new URL(raw);
      if (url.hostname !== "photon.komoot.io") return Response.json({ code: "Ok", routes: [{ duration: 1200, distance: 9500 }] });
      const features = url.searchParams.get("q")?.includes("Annemasse")
        ? [
          { ...geo("Annemasse", "FR", [6.2, 46]), properties: { ...geo("Annemasse", "FR", []).properties, postcode: "74100" } },
          { ...geo("Annemasse", "FR", [6.3, 46]), properties: { ...geo("Annemasse", "FR", []).properties, postcode: "99999" } },
        ] : [geo("Lausanne", "CH", [6.1, 46])];
      return Response.json({ features });
    });
    const pending = calculateCommutes("74100 Annemasse", ["1003 Lausanne"]);
    await vi.runAllTimersAsync();
    expect((await pending).calculated).toBe(1);
    expect(fetch.mock.calls.at(-1)![0].pathname).toContain("/driving/6.2,46;6.1,46");
    await expect(calculateCommutes("00000 Annemasse", ["Lausanne"])).rejects.toThrow("introuvable ou ambigu");
  });

  it("l'API de trajet ne calcule pas les offres françaises, même avec un lieu ressemblant à la Suisse", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const location of ["75008 Paris, Île-de-France, France", "Lausanne, Vaud, Suisse"]) upsertOffreFromSource("francetravail", {
      source_id: location, url: "https://example.org/offre", title: "Comptable", company: "", country: "France", location,
      contract_type: "CDI", salary: null, description_text: "", description_html: "", description_status: "ok", posted_at: null, is_vie: false, raw_payload: {},
    });
    const response = await POST(new NextRequest("http://localhost/api/offres/commute", { method: "POST", body: JSON.stringify({ origin: "Annemasse", consent: true }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ calculated: 0, remaining: 0, unknown: [] });
    expect(fetch).not.toHaveBeenCalled();
    expect(searchOffres({ country: "France" }).total).toBe(2);
  });

  it("refuse une destination homonyme située dans un autre pays", async () => {
    mockServices().mockImplementation(async (raw: URL) => Response.json({ features: [new URL(raw).searchParams.get("q")?.includes("Annemasse")
      ? geo("Annemasse", "FR", [6.2, 46]) : geo("Genève", "US", [-85, 41])] }));
    const pending = calculateCommutes("Annemasse", ["Genève"]);
    await vi.runAllTimersAsync();
    expect((await pending).unknown).toHaveLength(1);
    expect(cachedCommute("Annemasse", "Genève")).toBeNull();
  });

  it("poursuit les lots suivants malgré les villes introuvables et retente après expiration", async () => {
    const fetch = mockServices();
    fetch.mockImplementation(async (raw: URL) => {
      const url = new URL(raw);
      if (url.hostname !== "photon.komoot.io") return Response.json({ code: "Ok", routes: [{ duration: 1200, distance: 9500 }] });
      const city = url.searchParams.get("q")!.replace(/ (France|Suisse)$/, "");
      return Response.json({ features: city === "Annemasse" ? [geo(city, "FR", [6.2, 46])]
        : city === "Ville12" ? [geo(city, "CH", [6.1, 46])] : [] });
    });
    const locations = Array.from({ length: 13 }, (_, i) => `Ville${i}`);
    const first = calculateCommutes("Annemasse", locations);
    await vi.runAllTimersAsync();
    expect(await first).toMatchObject({ calculated: 0, remaining: 1, unknown: expect.any(Array) });
    const second = calculateCommutes("Annemasse", locations);
    await vi.runAllTimersAsync();
    expect(await second).toMatchObject({ calculated: 1, remaining: 0 });
    expect(fetch).toHaveBeenCalledTimes(15);
    getDb().exec("UPDATE commute_failures SET updated_at = '2000-01-01T00:00:00.000Z'");
    const retry = calculateCommutes("Annemasse", ["Ville0"]);
    await vi.runAllTimersAsync();
    await retry;
    expect(fetch).toHaveBeenCalledTimes(16);
  });

  it("une panne de routage laisse une durée inconnue, jamais une durée inventée", async () => {
    const fetch = mockServices();
    fetch.mockImplementation(async (raw: URL) => new URL(raw).hostname === "photon.komoot.io"
      ? Response.json({ features: [new URL(raw).searchParams.get("q")?.includes("Annemasse") ? geo("Annemasse", "FR", [6.2, 46]) : geo("Genève", "CH", [6.1, 46])] })
      : new Response("", { status: 503 }));
    const pending = calculateCommutes("Annemasse", ["Genève"]);
    await vi.runAllTimersAsync();
    expect((await pending).unknown[0].reason).toContain("HTTP 503");
    expect(cachedCommute("Annemasse", "Genève")).toBeNull();
  });

  it("filtre avec le cache, sans appel réseau, et conserve les trajets inconnus sur demande", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const city of ["Genève", "Lausanne", "Lieu inconnu"]) upsertOffreFromSource("jobroom", {
      source_id: city, url: "https://example.org/offre", title: city, company: "", country: "Suisse", location: city,
      contract_type: "CDI", salary: null, description_text: "", description_html: "", description_status: "ok", posted_at: null, is_vie: false, raw_payload: {},
    });
    const insert = getDb().prepare("INSERT INTO commute_routes VALUES (?, ?, ?, ?, ?)");
    insert.run("annemasse", "geneve", 20, 10, new Date().toISOString());
    insert.run("annemasse", "lausanne", 70, 70, new Date().toISOString());
    const filter = { origin: "Annemasse", maxMinutes: 45, includeUnknown: false };
    expect(searchOffres({ commute: filter }).offers.map(o => o.title)).toEqual(["Genève"]);
    expect(searchOffres({ commute: { ...filter, includeUnknown: true } }).total).toBe(2);
    expect(fetch).not.toHaveBeenCalled();
    getDb().exec("UPDATE commute_routes SET updated_at = '2000-01-01T00:00:00.000Z'");
    expect(searchOffres({ commute: filter }).total).toBe(0);
  });

  it("le calcul nécessite un accord explicite et un départ valide", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const body of [{ origin: "Annemasse" }, { origin: "", consent: true }]) {
      const response = await POST(new NextRequest("http://localhost/api/offres/commute", { method: "POST", body: JSON.stringify(body) }));
      expect(response.status).toBe(400);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
