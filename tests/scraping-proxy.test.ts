import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getSetting, setSetting } from "@/lib/db";
import { clearScrapingProxyKey, getScrapingProxyConfig, PROXY_SETTING_KEYS, publicScrapingProxyConfig, saveScrapingProxySettings } from "@/lib/scrapers/proxy-config";
import { sourceFetch, verifyBrightData, withProxyScope } from "@/lib/scrapers/source-fetch";
import { GET, POST } from "@/app/api/settings/scraping-proxy/route";

const KEY = "fake-brightdata-key";
const URL = "https://www.jobup.ch/fr/emplois/?term=informatique";
const ENDPOINT = "https://api.brightdata.com/request";
const settings = { mode: "fallback", zone: "jobup", sources: ["jobup"], maxRequests: 2 };
const unlocked = (status = 200, body = "<title>Offres</title><p>Une annonce</p>") => new Response(JSON.stringify({ status_code: status, headers: { "set-cookie": "secret=cookie" }, body }), { status: 200 });
beforeEach(() => {
  setSetting(PROXY_SETTING_KEYS.config, ""); setSetting(PROXY_SETTING_KEYS.key, "");
  vi.stubEnv("BRIGHTDATA_API_KEY", ""); vi.stubEnv("BRIGHTDATA_ZONE", "");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function scope(work: () => Promise<void>) {
  const scraper = withProxyScope({ name: "jobup", async *scrape() { await work(); } });
  for await (const _ of scraper.scrape({ sectors: [], countries: [] }, () => {})) void _;
}
const post = (body: unknown) => POST(new NextRequest("http://localhost:3000/api/settings/scraping-proxy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("paramètres Bright Data", () => {
  it("reste désactivé par défaut même avec une clé d'environnement", () => {
    vi.stubEnv("BRIGHTDATA_API_KEY", KEY); vi.stubEnv("BRIGHTDATA_ZONE", "jobup");
    expect(publicScrapingProxyConfig()).toMatchObject({ mode: "off", zone: "jobup", sources: [], hasKey: true, keySource: "env" });
    expect(JSON.stringify(publicScrapingProxyConfig())).not.toContain(KEY);
  });
  it("enregistre sans appel réseau et conserve la clé quand elle est omise", () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    saveScrapingProxySettings(settings, KEY);
    saveScrapingProxySettings({ ...settings, maxRequests: 3 });
    expect(getScrapingProxyConfig().apiKey).toBe(KEY);
    expect(publicScrapingProxyConfig()).toMatchObject({ maxRequests: 3, keySource: "settings" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    { ...settings, zone: "jobup\nAuthorization: secret" }, { ...settings, maxRequests: 101 },
    { ...settings, sources: ["linkedin"] }, { ...settings, sources: ["__proto__"] },
    { ...settings, mode: "invalid" },
  ])("refuse des paramètres incompatibles", config => {
    expect(() => saveScrapingProxySettings(config, KEY)).toThrow();
    expect(getSetting(PROXY_SETTING_KEYS.key)).toBe("");
  });
  it("refuse l'activation sans clé et sans source", () => {
    expect(() => saveScrapingProxySettings(settings)).toThrow(/clé/);
    expect(() => saveScrapingProxySettings({ ...settings, sources: [] }, KEY)).toThrow(/source/);
  });
  it("une configuration corrompue se replie sur un relais désactivé", () => {
    setSetting(PROXY_SETTING_KEYS.config, '{"mode":"always"}');
    expect(getScrapingProxyConfig().mode).toBe("off");
  });
  it("supprimer la clé enregistrée désactive le relais même si une clé d'environnement subsiste", () => {
    vi.stubEnv("BRIGHTDATA_API_KEY", "env-key");
    saveScrapingProxySettings(settings, KEY); clearScrapingProxyKey();
    expect(publicScrapingProxyConfig()).toMatchObject({ mode: "off", keySource: "env", hasKey: true });
  });
  it("l'API ne renvoie jamais la clé et signale les paramètres invalides", async () => {
    const response = await post({ ...settings, apiKey: KEY });
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain(KEY);
    expect(await (await GET()).text()).not.toContain(KEY);
    expect((await post({ ...settings, apiKey: 42 })).status).toBe(400);
    expect((await post({ ...settings, maxRequests: -1 })).status).toBe(400);
    expect((await post({ action: "inconnu" })).status).toBe(400);
  });
});

describe("transport des pages publiques", () => {
  it("sans activation ou pour une source non sélectionnée, conserve exactement l'accès direct", async () => {
    const fetch = vi.fn(async () => new Response("direct")); vi.stubGlobal("fetch", fetch);
    const init = { headers: { "user-agent": "JobScout" } };
    await sourceFetch("jobup", URL, init);
    expect(fetch).toHaveBeenLastCalledWith(URL, init);
    saveScrapingProxySettings(settings, KEY);
    await sourceFetch("jobsch", "https://www.jobs.ch/fr/offres-emplois/", init);
    expect(fetch).toHaveBeenLastCalledWith("https://www.jobs.ch/fr/offres-emplois/", init);
  });
  it("un accès direct sain ne consomme aucun appel Bright Data", async () => {
    saveScrapingProxySettings(settings, KEY);
    const fetch = vi.fn(async (_url: string) => new Response("<title>Offres</title>")); vi.stubGlobal("fetch", fetch);
    await scope(async () => { await sourceFetch("jobup", URL); await sourceFetch("jobup", URL); });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.every(([url]) => url !== ENDPOINT)).toBe(true);
  });
  it.each([403, 429])("HTTP %s : un seul accès direct puis relais pour les pages suivantes", async status => {
    saveScrapingProxySettings(settings, KEY);
    const fetch = vi.fn(async (url: string) => url === ENDPOINT ? unlocked() : new Response("refus", { status }));
    vi.stubGlobal("fetch", fetch);
    await scope(async () => { expect((await sourceFetch("jobup", URL)).status).toBe(200); await sourceFetch("jobup", URL); });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([URL, ENDPOINT, ENDPOINT]);
  });
  it("une page de challenge en HTTP 200 déclenche le relais", async () => {
    saveScrapingProxySettings(settings, KEY);
    const fetch = vi.fn(async (url: string) => url === ENDPOINT ? unlocked() : new Response('<title>Security Check - Indeed.com</title>'));
    vi.stubGlobal("fetch", fetch);
    await scope(async () => { expect(await (await sourceFetch("jobup", URL)).text()).toContain("Une annonce"); });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("un HTTP 401 du site n'est pas réessayé par proxy", async () => {
    saveScrapingProxySettings(settings, KEY);
    const fetch = vi.fn(async () => new Response("authentification", { status: 401 })); vi.stubGlobal("fetch", fetch);
    expect((await sourceFetch("jobup", URL)).status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("mode toujours : payload REST exact, clé envoyée uniquement à Bright Data, aucun en-tête du site relayé", async () => {
    saveScrapingProxySettings({ ...settings, mode: "always" }, KEY);
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => unlocked()); vi.stubGlobal("fetch", fetch);
    const result = await sourceFetch("jobup", URL, { headers: { "user-agent": "Browser", "x-custom": "must-not-send" } });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(JSON.parse(init!.body as string)).toEqual({ zone: "jobup", url: URL, format: "json" });
    expect(init!.headers).toEqual({ authorization: `Bearer ${KEY}`, "content-type": "application/json" });
    expect(result.headers.has("set-cookie")).toBe(false);
  });
  it.each([
    ["https://www.jobup.ch.evil.example/fr/emplois/", {}], ["http://www.jobup.ch/fr/emplois/", {}],
    ["https://www.jobup.ch/api/private", {}], ["https://secret@www.jobup.ch/fr/emplois/", {}],
    [URL, { method: "POST", body: "private" }], [URL, { headers: { authorization: "private" } }],
    [URL, { headers: { cookie: "private" } }],
  ] as [string, RequestInit][])("ne transmet pas une requête privée ou un hôte hors périmètre", async (url, init) => {
    saveScrapingProxySettings({ ...settings, mode: "always" }, KEY);
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(sourceFetch("jobup", url, init)).rejects.toThrow(/pages publiques/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("le plafond est partagé entre les pages et se réinitialise au scan suivant", async () => {
    saveScrapingProxySettings({ ...settings, mode: "always", maxRequests: 1 }, KEY);
    const fetch = vi.fn(async () => unlocked()); vi.stubGlobal("fetch", fetch);
    await scope(async () => {
      await sourceFetch("jobup", URL);
      await expect(sourceFetch("jobup", URL)).rejects.toThrow(/plafond de 1/);
      await expect(sourceFetch("jobup", URL)).rejects.toThrow(/plafond de 1/);
    });
    await scope(async () => { await sourceFetch("jobup", URL); });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("deux scans concurrents ont des plafonds indépendants", async () => {
    saveScrapingProxySettings({ ...settings, mode: "always", maxRequests: 1 }, KEY);
    const fetch = vi.fn(async () => unlocked()); vi.stubGlobal("fetch", fetch);
    await Promise.all([scope(async () => { await sourceFetch("jobup", URL); }), scope(async () => { await sourceFetch("jobup", URL); })]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("conserve le plafond entre deux next() du générateur", async () => {
    saveScrapingProxySettings({ ...settings, mode: "always", maxRequests: 1 }, KEY);
    const fetch = vi.fn(async () => unlocked()); vi.stubGlobal("fetch", fetch);
    const scraper = withProxyScope({ name: "jobup", async *scrape() {
      await sourceFetch("jobup", URL);
      yield {} as import("@/lib/scrapers/base").ScrapedOffre;
      await sourceFetch("jobup", URL);
    } });
    const iterator = scraper.scrape({ sectors: [], countries: [] }, () => {});
    expect((await iterator.next()).done).toBe(false);
    await expect(iterator.next()).rejects.toThrow(/plafond de 1/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([401, 402, 403, 429, 503])("une erreur du relais HTTP %s stoppe les appels et ne divulgue pas son corps", async status => {
    saveScrapingProxySettings({ ...settings, mode: "always" }, KEY);
    const fetch = vi.fn(async () => new Response(`secret ${KEY}`, { status })); vi.stubGlobal("fetch", fetch);
    await scope(async () => {
      await expect(sourceFetch("jobup", URL)).rejects.toThrow(`HTTP ${status}`);
      await expect(sourceFetch("jobup", URL)).rejects.not.toThrow(KEY);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("une réponse JSON invalide et une exception de transport sont expurgées", async () => {
    saveScrapingProxySettings({ ...settings, mode: "always" }, KEY);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`not-json ${KEY}`)));
    await expect(sourceFetch("jobup", URL)).rejects.toThrow(/réponse invalide/);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error(`fetch ${KEY}`); }));
    await expect(sourceFetch("jobup", URL)).rejects.not.toThrow(KEY);
  });
  it("respecte un refus final du site et arrête les appels suivants", async () => {
    saveScrapingProxySettings({ ...settings, mode: "always" }, KEY);
    const fetch = vi.fn(async () => unlocked(403, "refus")); vi.stubGlobal("fetch", fetch);
    await scope(async () => {
      expect((await sourceFetch("jobup", URL)).status).toBe(403);
      await expect(sourceFetch("jobup", URL)).rejects.toThrow(/refuse encore/);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("un ip_forbidden dans la réponse enveloppée explique le blocage et cesse les appels", async () => {
    saveScrapingProxySettings({ ...settings, mode: "always" }, KEY);
    const fetch = vi.fn(async () => new Response(JSON.stringify({ status_code: 407, body: "", headers: { "x-brd-error": `Auth Failed (code: ip_forbidden) ${KEY}` } })));
    vi.stubGlobal("fetch", fetch);
    await scope(async () => {
      await expect(sourceFetch("jobup", URL)).rejects.toThrow(/IP de ce PC/);
      await expect(sourceFetch("jobup", URL)).rejects.not.toThrow(KEY);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("un 502 enveloppé du service explique l'élément manquant et cesse les appels suivants", async () => {
    saveScrapingProxySettings({ ...settings, mode: "always" }, KEY);
    const fetch = vi.fn(async () => new Response(JSON.stringify({ status_code: 502, body: "", headers: {
      "X-Brd-Error-Code": "expect_element", "X-Brd-Error": `waiting for selector \"${KEY}\" failed: timeout 60000ms exceeded`,
    } })));
    vi.stubGlobal("fetch", fetch);
    await scope(async () => {
      await expect(sourceFetch("jobup", URL)).rejects.toThrow(/HTTP 502.*élément attendu.*absent/);
      await expect(sourceFetch("jobup", URL)).rejects.not.toThrow(KEY);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("un 502 du site sans erreur Bright Data permet de charger l'offre suivante", async () => {
    saveScrapingProxySettings({ ...settings, mode: "always" }, KEY);
    const fetch = vi.fn().mockResolvedValueOnce(unlocked(502, "Site momentanément indisponible")).mockResolvedValueOnce(unlocked());
    vi.stubGlobal("fetch", fetch);
    await scope(async () => {
      expect((await sourceFetch("jobup", URL)).status).toBe(502);
      expect((await sourceFetch("jobup", URL)).status).toBe(200);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each(["reject_block", "resolve_failed_akamai_interstitial"])("explique la protection non résolue (%s) et cesse les appels", async code => {
    saveScrapingProxySettings({ ...settings, mode: "always" }, KEY);
    const fetch = vi.fn(async () => new Response(JSON.stringify({ status_code: 502, body: "", headers: { "x-brd-error-code": code } })));
    vi.stubGlobal("fetch", fetch);
    await scope(async () => {
      await expect(sourceFetch("jobup", URL)).rejects.toThrow(/page de protection.*pas pu résoudre/);
      await expect(sourceFetch("jobup", URL)).rejects.toThrow(/page de protection/);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("ne recopie pas une erreur distante inconnue et cesse les appels", async () => {
    saveScrapingProxySettings({ ...settings, mode: "always" }, KEY);
    const fetch = vi.fn(async () => new Response(JSON.stringify({ status_code: 503, body: KEY, headers: { "x-brd-error-code": KEY, "x-brd-error": KEY } })));
    vi.stubGlobal("fetch", fetch);
    await scope(async () => {
      await expect(sourceFetch("jobup", URL)).rejects.toThrow(/HTTP 503/);
      await expect(sourceFetch("jobup", URL)).rejects.not.toThrow(KEY);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("ne traite pas une page CAPTCHA du relais en HTTP 200 comme une annonce", async () => {
    saveScrapingProxySettings({ ...settings, mode: "always" }, KEY);
    const fetch = vi.fn(async () => unlocked(200, '<title>Just a moment...</title>')); vi.stubGlobal("fetch", fetch);
    await scope(async () => {
      await expect(sourceFetch("jobup", URL)).rejects.toThrow(/vérification/);
      await expect(sourceFetch("jobup", URL)).rejects.toThrow(/vérification/);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("vérifier effectue exactement un appel sur la cible fixe et ne modifie pas les réglages", async () => {
    vi.stubEnv("BRIGHTDATA_API_KEY", KEY); vi.stubEnv("BRIGHTDATA_ZONE", "jobup");
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => unlocked(200, "welcome")); vi.stubGlobal("fetch", fetch);
    await verifyBrightData();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).url).toBe("https://geo.brdtest.com/welcome.txt");
    expect(getScrapingProxyConfig().mode).toBe("off");
  });
});
