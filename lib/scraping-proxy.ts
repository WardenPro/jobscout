/** Métadonnées publiques ; aucune clé de proxy dans ce module client/serveur. */
export type ScrapingProxyMode = "off" | "fallback" | "always";
export type ScrapingProxySettings = {
  mode: ScrapingProxyMode;
  zone: string;
  sources: string[];
  maxRequests: number;
};

export const DEFAULT_SCRAPING_PROXY: ScrapingProxySettings = {
  mode: "off", zone: "", sources: [], maxRequests: 20,
};

/** Seulement les pages publiques HTTP : les API authentifiées et Chromium restent directs. */
export const SCRAPING_PROXY_TARGETS: Record<string, { hosts: string[]; paths: RegExp }> = {
  jobup: { hosts: ["www.jobup.ch"], paths: /^\/fr\/emplois(?:\/|$)/ },
  jobsch: { hosts: ["www.jobs.ch"], paths: /^\/fr\/(?:offres-emplois|stellenangebote)(?:\/|$)/ },
  hellowork: { hosts: ["www.hellowork.com"], paths: /^\/fr-fr\/(?:emploi|emplois)(?:\/|$)/ },
  francetravail: { hosts: ["candidat.francetravail.fr"], paths: /^\/offres\/recherche(?:\/|$)/ },
  talent: { hosts: ["fr.talent.com", "be.talent.com", "ch.talent.com", "lu.talent.com", "ca.talent.com", "www.talent.com", "ma.talent.com", "tn.talent.com", "sn.talent.com"], paths: /^\/(?:jobs|view)(?:\/|$)/ },
};

export type PublicScrapingProxyConfig = ScrapingProxySettings & {
  hasKey: boolean;
  keySource: "settings" | "env" | null;
};
