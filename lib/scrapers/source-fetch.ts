import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { getScrapingProxyConfig } from "./proxy-config";
import { SCRAPING_PROXY_TARGETS, type ScrapingProxySettings } from "@/lib/scraping-proxy";
import type { Scraper } from "./base";

const ENDPOINT = "https://api.brightdata.com/request";
const MAX_BODY = 4_000_000;
// Web Unlocker peut attendre ses sélecteurs jusqu'à 150 s : laisser revenir
// son diagnostic plutôt que masquer l'échec par un abandon local à 90 s.
const UNLOCK_TIMEOUT = 180_000;
type Scope = { used: number; stopped?: string; proxyActive: boolean };
// Next duplique les modules entre routes ; une portée par générateur évite de
// partager un plafond entre deux scans, ou de le réinitialiser entre les pages.
const globals = globalThis as typeof globalThis & { __jobscoutProxyScope?: AsyncLocalStorage<Scope> };
const scopes = globals.__jobscoutProxyScope ??= new AsyncLocalStorage<Scope>();

function isAllowedTarget(source: string, raw: string): boolean {
  try {
    const url = new URL(raw);
    const target = SCRAPING_PROXY_TARGETS[source];
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") &&
      !!target && target.hosts.includes(url.hostname) && target.paths.test(url.pathname);
  } catch { return false; }
}

function isChallenge(html: string): boolean {
  const head = html.slice(0, 100_000);
  return /<title[^>]*>[^<]*(?:just a moment|access denied|attention required|captcha|security check|verify you|vérifiez que)/i.test(head) ||
    /id\s*=\s*["'](?:challenge-form|cf-challenge-running|captcha-form)["']/i.test(head);
}

function relayErrorHint(getHeader: (name: string) => string | null): string | null {
  const code = getHeader("x-brd-error-code") || getHeader("x-brd-err-code");
  const reason = getHeader("x-brd-error") || getHeader("x-brd-err-msg");
  if (!code && !reason) return null;
  // Ne jamais recopier les messages distants : ils peuvent contenir une URL,
  // une clé ou d'autres données. Seuls les diagnostics connus deviennent du texte.
  if (code === "expect_element" || /waiting for selector.*failed.*timeout/i.test(reason ?? "")) {
    return "La page a été chargée, mais l'élément attendu par Bright Data est absent. Contactez le support Bright Data pour cette URL.";
  }
  if (code === "feature_not_active") return "L'option Web Unlocker demandée n'est pas activée dans cette zone.";
  if (code === "premium") return "Ce domaine nécessite une autorisation Premium dans la zone Bright Data.";
  if (code === "no_peers") return "Aucun relais disponible pour la localisation demandée.";
  if (code === "reject_block" || code?.startsWith("resolve_failed_")) return "Le site renvoie une page de protection que Bright Data n'a pas pu résoudre.";
  if (code === "navigation_timeout" || code === "domcontentloaded_event_timeout") return "Bright Data n'a pas terminé le chargement de la page dans son délai.";
  return "Bright Data n'a pas pu récupérer cette page. Vérifiez la zone ou contactez son support.";
}

async function unlock(url: string, config: ScrapingProxySettings & { apiKey: string }): Promise<Response> {
  if (!config.apiKey || !config.zone) throw new Error("Bright Data : clé API ou zone manquante dans Profil › Paramètres.");
  const signal = AbortSignal.timeout(UNLOCK_TIMEOUT);
  const connectionError = () => new Error(signal.aborted
    ? "Bright Data : délai de 180 secondes dépassé. Aucun nouvel appel pour cette source pendant ce scan."
    : "Bright Data : connexion impossible. Aucun nouvel appel pour cette source pendant ce scan.");
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST", headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ zone: config.zone, url, format: "json" }),
      signal,
      cache: "no-store", redirect: "error",
    });
  } catch {
    // Ne jamais exposer une exception de transport pouvant contenir la clé.
    throw connectionError();
  }
  if (response.status !== 200) {
    void response.body?.cancel();
    const hint = relayErrorHint(name => response.headers.get(name)) ?? (response.status === 401 ? "Vérifiez la clé API." : response.status === 402 ? "Vérifiez le crédit du compte." : response.status === 403 ? "Vérifiez l'accès de la clé à cette zone." : "Vérifiez la zone et le compte.");
    throw new Error(`Bright Data HTTP ${response.status}. ${hint} Aucun nouvel appel pour cette source pendant ce scan.`);
  }
  let data: { status_code?: unknown; status?: unknown; body?: unknown; headers?: Record<string, unknown> };
  try {
    const raw = await response.text();
    if (raw.length > MAX_BODY) throw new Error();
    data = JSON.parse(raw);
    const status = data.status_code ?? data.status;
    if (!Number.isInteger(status) || Number(status) < 200 || Number(status) > 599 || typeof data.body !== "string") throw new Error();
  } catch {
    if (signal.aborted) throw connectionError();
    throw new Error("Bright Data : réponse invalide ou trop volumineuse. Aucun nouvel appel pour cette source pendant ce scan.");
  }
  const status = Number(data.status_code ?? data.status);
  const getHeader = (name: string): string | null => {
    if (!data.headers || typeof data.headers !== "object" || Array.isArray(data.headers)) return null;
    const value = Object.entries(data.headers).find(([key]) => key.toLowerCase() === name)?.[1];
    return typeof value === "string" ? value : null;
  };
  if (status === 407) {
    const reason = getHeader("x-brd-error");
    const hint = typeof reason === "string" && reason.includes("ip_forbidden")
      ? "L'adresse IP de ce PC n'est pas autorisée dans la zone Bright Data. Autorisez-la dans votre compte puis relancez."
      : "Vérifiez les autorisations de la zone et du compte Bright Data.";
    throw new Error(`Bright Data HTTP 407. ${hint} Aucun nouvel appel pour cette source pendant ce scan.`);
  }
  const hint = status >= 400 ? relayErrorHint(getHeader) : null;
  if (hint) throw new Error(`Bright Data HTTP ${status}. ${hint} Aucun nouvel appel pour cette source pendant ce scan.`);
  return new Response([204, 205, 304].includes(status) ? null : data.body as string, {
    status, headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/** Aucun cookie, jeton du site, en-tête personnalisé ou contenu de profil transmis au relais. */
export async function sourceFetch(source: string, url: string, init: RequestInit = {}): Promise<Response> {
  const config = getScrapingProxyConfig();
  if (config.mode === "off" || !config.sources.includes(source)) return fetch(url, init);
  const scope = scopes.getStore() ?? { used: 0, proxyActive: false };
  if (scope.stopped) throw new Error(scope.stopped);
  const headers = new Headers(init.headers);
  if (!isAllowedTarget(source, url) || (init.method && init.method !== "GET") || init.body != null || headers.has("authorization") || headers.has("cookie")) {
    throw new Error("Bright Data : seules les pages publiques compatibles de cette source peuvent être relayées.");
  }
  if (config.mode === "fallback" && !scope.proxyActive) {
    const directSignal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000);
    const direct = await fetch(url, { ...init, signal: directSignal });
    const blocked = [403, 429].includes(direct.status) || (direct.status === 200 && isChallenge(await direct.clone().text()));
    if (!blocked) return direct;
    void direct.body?.cancel();
    // Après un blocage, les autres pages de cette source passent directement
    // par le relais pour ne pas répéter une requête refusée à chaque offre.
    scope.proxyActive = true;
  }
  if (scope.used >= config.maxRequests) {
    scope.stopped = `Bright Data : plafond de ${config.maxRequests} appels atteint pour cette source. Relancez un scan ou modifiez le plafond dans les paramètres.`;
    throw new Error(scope.stopped);
  }
  scope.used++;
  try {
    // Le délai court du chargement direct ne s'applique pas à Web Unlocker.
    const response = await unlock(url, config);
    if (response.status === 200 && isChallenge(await response.clone().text())) {
      void response.body?.cancel();
      throw new Error("Bright Data : le site demande encore une vérification. Aucun nouvel appel pour cette source pendant ce scan.");
    }
    if ([401, 403, 429].includes(response.status)) {
      scope.stopped = `Bright Data : le site refuse encore l'accès (HTTP ${response.status}). Aucun nouvel appel pour cette source pendant ce scan.`;
    }
    return response;
  } catch (e) {
    scope.stopped = e instanceof Error ? e.message : "Bright Data indisponible.";
    throw new Error(scope.stopped);
  }
}

/** La portée reste vivante entre les next() d'un générateur, sans fuite entre scans. */
export function withProxyScope(scraper: Scraper): Scraper {
  return {
    name: scraper.name,
    async *scrape(criteria, onEvent) {
      const scope: Scope = { used: 0, proxyActive: false };
      const iterator = scraper.scrape(criteria, onEvent);
      try {
        while (true) {
          const step = await scopes.run(scope, () => iterator.next());
          if (step.done) break;
          yield step.value;
        }
      } finally {
        await scopes.run(scope, () => iterator.return(undefined));
        if (scope.used) console.info(`[scraping-proxy] ${scraper.name} : ${scope.used} appel(s) Bright Data.`);
        if (scope.stopped) onEvent({ kind: "error", source: scraper.name, message: scope.stopped });
      }
    },
  };
}

/** Test explicite et borné à une requête ; aucun appel sur lecture/enregistrement des paramètres. */
export async function verifyBrightData(): Promise<void> {
  const response = await unlock("https://geo.brdtest.com/welcome.txt", getScrapingProxyConfig());
  void response.body?.cancel();
  if (!response.ok) throw new Error(`Bright Data : le test a reçu HTTP ${response.status}.`);
}
