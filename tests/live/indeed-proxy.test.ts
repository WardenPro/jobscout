/** Test réel, explicitement opt-in : au maximum deux appels Bright Data. */
import { afterEach, expect, it, vi } from "vitest";
import { getEnabledScrapers } from "@/lib/scrapers/registry";
import { saveScrapingProxySettings } from "@/lib/scrapers/proxy-config";
import type { ScrapedOffre } from "@/lib/scrapers/base";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

afterEach(() => vi.unstubAllGlobals());
it("Indeed : récupère une recherche et une fiche réelles via Bright Data", async () => {
  process.loadEnvFile(".env.local");
  if (!process.env.BRIGHTDATA_API_KEY || !process.env.BRIGHTDATA_ZONE) throw new Error("Configurez BRIGHTDATA_API_KEY et BRIGHTDATA_ZONE dans .env.local.");
  // Base temporaire du fichier de test ; aucun changement du profil utilisateur.
  saveScrapingProxySettings({ mode: "always", zone: process.env.BRIGHTDATA_ZONE, sources: ["indeedch"], maxRequests: 2 });
  const realFetch = globalThis.fetch;
  let proxyCalls = 0;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const proxied = url === "https://api.brightdata.com/request";
    if (proxied) { proxyCalls++; console.info(`[test réel Indeed] appel Bright Data ${proxyCalls}/2`); }
    const result = await realFetch(url, init);
    if (proxied) {
      const data = await result.clone().json().catch(() => null);
      const status = data?.status_code ?? data?.status;
      console.info(`[test réel Indeed] relais HTTP ${result.status} ; cible HTTP ${typeof status === "number" ? status : "inconnu"}`);
      if (typeof data?.body === "string") fs.writeFileSync(path.join(os.tmpdir(), `jobscout-indeed-live-${proxyCalls}.html`), data.body);
    }
    return result;
  });
  const offres: ScrapedOffre[] = [];
  try {
    const scraper = getEnabledScrapers(["indeedch"])[0];
    for await (const offre of scraper.scrape({ sectors: ["informatique"], countries: ["Suisse"], maxOffres: 1 }, () => {})) offres.push(offre);
    expect(proxyCalls).toBeGreaterThan(0);
    expect(proxyCalls).toBeLessThanOrEqual(2);
    expect(offres).toHaveLength(1);
    expect(offres[0].description_status, offres[0].scrape_errors).toBe("ok");
    expect(offres[0].description_text.length).toBeGreaterThanOrEqual(100);
  } finally {
    fs.writeFileSync(path.join(os.tmpdir(), "jobscout-indeed-live-result.json"), JSON.stringify(offres.map(o => ({ url: o.url, status: o.description_status, error: o.scrape_errors, length: o.description_text.length }))));
    console.info(`[test réel Indeed] ${proxyCalls} appel(s) Bright Data ; ${offres.filter(o => o.description_status === "ok").length} offre complète.`);
  }
}, 390_000);
