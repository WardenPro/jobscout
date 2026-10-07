import { afterEach, describe, expect, it, vi } from "vitest";
import { wttjScraper } from "@/lib/scrapers/wttj";
import { francetravailScraper } from "@/lib/scrapers/francetravail";
import type { ProgressEvent, ScrapedOffre, Scraper } from "@/lib/scrapers/base";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function scan(scraper: Scraper, events: ProgressEvent[]) {
  const offers: ScrapedOffre[] = [];
  for await (const offer of scraper.scrape({ countries: ["France"], sectors: ["comptable", "finance"] }, event => events.push(event))) offers.push(offer);
  return offers;
}

describe("poursuite des secteurs des sources françaises", () => {
  it("WTTJ récupère les offres du second secteur après un HTTP 503", async () => {
    const events: ProgressEvent[] = [];
    let searches = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (++searches === 1) return new Response("unavailable", { status: 503 });
      return Response.json({ results: [{ nbPages: 1, hits: [{
        objectID: "second-sector", slug: "comptable", name: "Comptable", organization: { slug: "exemple", name: "Exemple" },
        offices: [{ country: "France", country_code: "FR", city: "Paris" }],
        summary: "Vous participez à la gestion comptable, à la préparation des rapports et au suivi des dossiers administratifs de notre entreprise.",
      }] }] });
    }));
    expect((await scan(wttjScraper, events)).map(o => o.source_id)).toEqual(["second-sector"]);
    expect(searches).toBe(2);
    expect(events).toContainEqual(expect.objectContaining({ kind: "error", message: expect.stringContaining("HTTP 503") }));
    expect(events).toContainEqual({ kind: "done", source: "wttj", seen: 1, ok: 1, failed: 0 });
  });

  it("WTTJ essaie tous les secteurs avant de signaler une panne totale", async () => {
    const fetch = vi.fn(async () => new Response("blocked", { status: 403 }));
    vi.stubGlobal("fetch", fetch);
    const events: ProgressEvent[] = [];
    await expect(scan(wttjScraper, events)).rejects.toThrow("HTTP 403");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(events.some(e => e.kind === "done")).toBe(false);
  });

  it("France Travail API poursuit le second secteur après une erreur réseau", async () => {
    vi.stubEnv("FT_CLIENT_ID", "test-client");
    vi.stubEnv("FT_CLIENT_SECRET", "test-secret");
    const events: ProgressEvent[] = [];
    const searches: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (raw: string) => {
      const url = new URL(raw);
      if (!url.pathname.includes("/offres/search")) return Response.json({ access_token: "test-token", expires_in: 1500 });
      searches.push(url.searchParams.get("motsCles")!);
      if (searches.length === 1) throw new Error("network unavailable");
      return Response.json({ resultats: [{ id: "ft-second-sector", intitule: "Comptable", description: "Gestion comptable et financière.", lieuTravail: { libelle: "75 - Paris" } }] });
    }));
    expect((await scan(francetravailScraper, events)).map(o => o.source_id)).toEqual(["ft-second-sector"]);
    expect(searches).toEqual(["comptable", "finance"]);
    expect(events).toContainEqual(expect.objectContaining({ kind: "error", message: expect.stringContaining("network unavailable") }));
    expect(events).toContainEqual({ kind: "done", source: "francetravail", seen: 1, ok: 1, failed: 0 });
  });
});
