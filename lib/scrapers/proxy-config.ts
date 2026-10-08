import "server-only";
import { z } from "zod";
import { getSetting, setSetting, transaction } from "@/lib/db";
import { DEFAULT_SCRAPING_PROXY, SCRAPING_PROXY_TARGETS, type PublicScrapingProxyConfig, type ScrapingProxySettings } from "@/lib/scraping-proxy";

export const PROXY_SETTING_KEYS = { config: "scraping:brightdata", key: "scraping:brightdata_key" } as const;

export const ProxySettingsSchema = z.object({
  mode: z.enum(["off", "fallback", "always"]),
  zone: z.string().trim().max(128).regex(/^[a-zA-Z0-9_-]*$/, "Nom de zone invalide."),
  sources: z.array(z.string().refine(id => Object.hasOwn(SCRAPING_PROXY_TARGETS, id), "Source incompatible avec Web Unlocker.")).max(20).transform(ids => [...new Set(ids)]),
  maxRequests: z.number().int().min(1).max(100),
});

export function getScrapingProxyConfig(): ScrapingProxySettings & { apiKey: string; keySource: PublicScrapingProxyConfig["keySource"] } {
  let settings = { ...DEFAULT_SCRAPING_PROXY, zone: process.env.BRIGHTDATA_ZONE?.trim() || "" };
  try {
    const stored = getSetting(PROXY_SETTING_KEYS.config);
    if (stored) {
      const parsed = ProxySettingsSchema.safeParse(JSON.parse(stored));
      if (parsed.success) settings = parsed.data;
    }
  } catch { /* Une configuration corrompue n'active jamais un service facturé. */ }
  const storedKey = getSetting(PROXY_SETTING_KEYS.key)?.trim();
  const envKey = process.env.BRIGHTDATA_API_KEY?.trim();
  return { ...settings, apiKey: storedKey || envKey || "", keySource: storedKey ? "settings" : envKey ? "env" : null };
}

export function publicScrapingProxyConfig(): PublicScrapingProxyConfig {
  const { apiKey, ...config } = getScrapingProxyConfig();
  return { ...config, hasKey: !!apiKey };
}

export function saveScrapingProxySettings(raw: unknown, key?: string): void {
  const config = ProxySettingsSchema.parse(raw);
  const apiKey = key?.trim() || getScrapingProxyConfig().apiKey;
  if (key !== undefined && (!key.trim() || key.length > 512 || /\s/.test(key.trim()))) {
    throw new Error("Clé API Bright Data invalide.");
  }
  if (config.mode !== "off" && (!apiKey || !config.zone || !config.sources.length)) {
    throw new Error("Renseignez une clé API, une zone et au moins une source avant d'activer Bright Data.");
  }
  transaction(() => {
    setSetting(PROXY_SETTING_KEYS.config, JSON.stringify(config));
    if (key !== undefined) setSetting(PROXY_SETTING_KEYS.key, key.trim());
  });
}

export function clearScrapingProxyKey(): void {
  transaction(() => {
    setSetting(PROXY_SETTING_KEYS.key, "");
    const config = getScrapingProxyConfig();
    setSetting(PROXY_SETTING_KEYS.config, JSON.stringify({ mode: "off", zone: config.zone, sources: config.sources, maxRequests: config.maxRequests }));
  });
}
