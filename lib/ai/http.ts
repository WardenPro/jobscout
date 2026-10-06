import "server-only";
import { Agent, EnvHttpProxyAgent, fetch as undiciFetch } from "undici";

/**
 * Transport HTTP des fournisseurs compatibles OpenAI (Ollama, LM Studio,
 * OpenAI, Gemini, Mistral…).
 *
 * Le fetch intégré de Node (undici) coupe toute requête dont les en-têtes
 * tardent plus de 300 s (headersTimeout). Sans streaming, Ollama n'envoie ses
 * en-têtes qu'une fois la génération finie : une génération locale de plus de
 * 5 minutes échouait en « fetch failed » (UND_ERR_HEADERS_TIMEOUT), affichée
 * « Impossible de joindre Ollama » alors que le serveur tournait — mesuré le
 * 06/10/2026, échec à 300,7 s sous Node 24.13 comme sous le Node 22 embarqué.
 *
 * Cet agent lève les délais propres d'undici. La garde de l'appelant
 * (lib/ai/llm.ts : AbortController réglé sur preset.timeoutMs, 15 s pour la
 * liste des modèles) couvre l'attente des en-têtes ET la lecture du corps :
 * c'est elle, et elle seule, qui borne l'attente. Le fetch du paquet undici est
 * utilisé avec son propre agent, plutôt que le fetch intégré, pour ne jamais
 * mélanger deux versions d'undici (Node 22 embarque la 6.x).
 */
export const AGENT_OPTIONS = { headersTimeout: 0, bodyTimeout: 0 } as const;

// Poste derrière un proxy d'entreprise : le fetch intégré respecte HTTP(S)_PROXY
// et NO_PROXY quand NODE_USE_ENV_PROXY=1 ; on garde ce comportement.
const agent = process.env.NODE_USE_ENV_PROXY === "1" ? new EnvHttpProxyAgent(AGENT_OPTIONS) : new Agent(AGENT_OPTIONS);

export const providerFetch = ((input: string | URL, init?: RequestInit) =>
  undiciFetch(input, { ...(init as object), dispatcher: agent })) as unknown as typeof fetch;

/** Délais internes d'undici : « trop lent », pas « injoignable ». */
const TIMEOUT_CODES = new Set(["UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"]);

/**
 * Code machine de la cause d'un échec réseau (ECONNREFUSED, UND_ERR_SOCKET,
 * ERR_SSL_…), cherché dans la chaîne `cause` et dans les erreurs groupées
 * (AggregateError, quand localhost est essayé en IPv6 puis en IPv4).
 */
export function networkCode(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let depth = 0; depth < 4 && cur; depth++) {
    const o = cur as { code?: unknown; errors?: unknown; cause?: unknown };
    if (typeof o.code === "string" && o.code) return o.code;
    if (Array.isArray(o.errors)) {
      const inner = o.errors.map((x) => networkCode(x)).find(Boolean);
      if (inner) return inner;
    }
    cur = o.cause;
  }
  return undefined;
}

/** L'échec est un dépassement de délai (garde de l'appelant ou délai interne d'undici). */
export function isTimeoutError(e: unknown): boolean {
  if (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError")) return true;
  return TIMEOUT_CODES.has(networkCode(e) ?? "");
}
