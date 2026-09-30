import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { getClaude, getLlmConfig, LlmNotConfiguredError, type LlmConfig, type LlmRole } from "./client";
import { PROVIDERS, type ProviderId } from "./providers";
import { coerceToSchema, extractJsonObject, parseToolArguments } from "./json-extract";

/**
 * Couche commune des appels IA : une seule primitive, `callStructured`, qui
 * renvoie l'objet JSON demandé par un « outil » (nom + schéma), quel que soit
 * le fournisseur choisi par l'utilisateur.
 *
 * - Anthropic (BYOK ou Pack) : API Messages, outil forcé (ou « auto » pour les
 *   modèles qui le refusent), cache du prompt.
 * - Compatible OpenAI (OpenAI, Gemini, Mistral, DeepSeek, Groq, OpenRouter,
 *   Ollama, LM Studio, autre) : Chat Completions ; stratégie de départ selon le
 *   fournisseur (appel de fonction forcé, ou sortie contrainte par schéma pour
 *   les serveurs locaux), puis repli cran par cran jusqu'à l'extraction
 *   tolérante du JSON dans le texte.
 *
 * Les garde-fous métier (validation contre le profil, schémas Zod, limites de
 * mise en page) restent chez les appelants : ils ne dépendent pas du fournisseur.
 */

export type StructuredTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type SystemBlock = { text: string; cache?: boolean };

export type StructuredRequest = {
  /** « writer » = rédaction (extraction, CV, lettre, V.I.E) ; « reviewer » = relecture, traduction, réparation. */
  role: LlmRole;
  system: string | SystemBlock[];
  user: string;
  tool: StructuredTool;
  maxTokens: number;
};

export type StructuredResult = {
  /** Objet renvoyé par le modèle, ou null s'il n'a rien rendu d'exploitable. */
  input: Record<string, unknown> | null;
  /** La réponse a été coupée par la limite de longueur. */
  truncated: boolean;
  provider: ProviderId;
  model: string;
};

/** Réponse HTTP d'erreur d'un fournisseur compatible OpenAI. */
export class LlmHttpError extends Error {
  readonly status: number;
  readonly provider: ProviderId;
  readonly detail: string;
  constructor(status: number, provider: ProviderId, detail: string) {
    super(`HTTP ${status} (${provider}) ${detail}`.trim());
    this.name = "LlmHttpError";
    this.status = status;
    this.provider = provider;
    this.detail = detail;
  }
}

/** Aucune réponse du serveur (hors-ligne, serveur local éteint, délai dépassé). */
export class LlmTransportError extends Error {
  readonly provider: ProviderId;
  readonly url: string;
  readonly timeout: boolean;
  constructor(provider: ProviderId, url: string, timeout: boolean, cause?: unknown) {
    super(`${timeout ? "délai dépassé" : "injoignable"} : ${url}`);
    this.name = "LlmTransportError";
    this.provider = provider;
    this.url = url;
    this.timeout = timeout;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

export type LlmDeps = {
  fetch?: typeof fetch;
  anthropic?: Pick<Anthropic, "messages" | "models">;
  sleep?: (ms: number) => Promise<void>;
};

const blocksOf = (system: string | SystemBlock[]): SystemBlock[] =>
  typeof system === "string" ? [{ text: system, cache: false }] : system;

export async function callStructured(
  req: StructuredRequest,
  cfg: LlmConfig = getLlmConfig(),
  deps: LlmDeps = {}
): Promise<StructuredResult> {
  if (cfg.mode === "unset") throw new LlmNotConfiguredError();
  const model = cfg.models[req.role];
  if (cfg.kind === "anthropic") return callAnthropic(req, cfg, model, deps);
  return callOpenAICompatible(req, cfg, model, deps);
}

/* ---------------------------------- Anthropic --------------------------------- */

/**
 * Modèles Anthropic qui refusent l'outil forcé (tool_choice « tool ») : les
 * modèles haut de gamme récents (Opus 5.5, Sonnet 5.5, Fable 5.1) répondent 400.
 * Mémorisé pour ne payer l'aller-retour refusé qu'une fois par modèle.
 */
const anthropicNoForcedTool = new Set<string>();

/** Pour les tests : oublie les stratégies mémorisées. */
export function resetLlmMemory(): void {
  anthropicNoForcedTool.clear();
}

function isForcedToolRefusal(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const status = (e as { status?: unknown }).status;
  return status === 400 && /tool_choice|forced tool|tool choice/i.test(e.message);
}

async function callAnthropic(
  req: StructuredRequest,
  cfg: LlmConfig,
  model: string,
  deps: LlmDeps
): Promise<StructuredResult> {
  const client = deps.anthropic ?? getClaude(cfg);
  const blocks = blocksOf(req.system);
  const send = (forced: boolean) =>
    client.messages.create({
      model,
      max_tokens: req.maxTokens,
      system: [
        ...blocks.map((b) => ({
          type: "text" as const,
          text: b.text,
          ...(b.cache ? { cache_control: { type: "ephemeral" as const } } : {}),
        })),
        // Sans outil forcé, la consigne d'appel passe par le prompt (après les blocs mis en cache).
        ...(forced
          ? []
          : [{ type: "text" as const, text: `Réponds uniquement en appelant l'outil « ${req.tool.name} », sans texte autour.` }]),
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [req.tool as any],
      tool_choice: forced ? { type: "tool", name: req.tool.name } : { type: "auto" },
      messages: [{ role: "user", content: req.user }],
    });

  let forced = !anthropicNoForcedTool.has(model);
  let message: Awaited<ReturnType<typeof send>>;
  try {
    message = await send(forced);
  } catch (e) {
    if (!forced || !isForcedToolRefusal(e)) throw e;
    console.warn(`[llm] anthropic/${model} : outil forcé refusé — appel en mode « auto »`);
    anthropicNoForcedTool.add(model);
    forced = false;
    message = await send(false);
  }
  const t = message.content.find((b) => b.type === "tool_use");
  let raw: unknown = t && t.type === "tool_use" ? t.input : null;
  if (raw == null) {
    // Mode « auto » : le modèle a pu répondre par du JSON en texte.
    const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    raw = extractJsonObject(text);
  }
  const input = parseToolArguments(coerceToSchema(raw, req.tool.input_schema));
  const truncated = message.stop_reason === "max_tokens";
  const u = (message as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
  console.log(
    `[llm] ${cfg.mode === "pack" ? "pack" : "anthropic"}/${model}${forced ? "" : " (auto)"} — ${u?.input_tokens ?? "?"} jetons en entrée, ${u?.output_tokens ?? "?"} en sortie${truncated ? ", TRONQUÉ" : ""}`
  );
  return { input, truncated, provider: cfg.provider, model };
}

/* ------------------------------ Compatible OpenAI ----------------------------- */

type ChatMessage = { role: "system" | "user"; content: string };
type ChatResponse = {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | Array<{ type?: string; text?: string }> | null;
      tool_calls?: Array<{ function?: { name?: string; arguments?: unknown } }>;
    };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

const RETRYABLE = new Set([429, 500, 502, 503, 504, 529]);

type ChatChoice = NonNullable<ChatResponse["choices"]>[number];

/** Texte de la réponse (chaîne, ou liste de parties chez certains serveurs). */
function contentText(choice: ChatChoice): string {
  const content = choice.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p) => (p && typeof p.text === "string" ? p.text : "")).join("");
  return "";
}

function jsonInstruction(tool: StructuredTool): string {
  // Le mot « json » en minuscules est exigé par certains serveurs (DeepSeek) pour le mode JSON.
  return (
    `\n\n## Format de réponse obligatoire\n` +
    `Réponds UNIQUEMENT par un objet JSON valide (format json), sans aucun texte autour et sans balises Markdown. ` +
    `Cet objet correspond aux arguments de l'outil « ${tool.name} » (${tool.description}) et doit respecter ce schéma JSON :\n` +
    JSON.stringify(tool.input_schema)
  );
}

/**
 * Échelle des stratégies de sortie structurée, de la plus fiable à la plus
 * tolérante. On descend d'un cran quand le serveur refuse la requête (statut
 * listé) ou ne renvoie rien d'exploitable.
 * - tools : appel de fonction forcé ;
 * - json_schema : sortie contrainte par le schéma (décodage guidé en local) ;
 * - json_object : mode JSON, schéma dans le prompt ;
 * - text : aucune contrainte, JSON extrait du texte.
 */
type Step = "tools" | "json_schema" | "json_object" | "text";
const LADDER: Record<"tools" | "json_schema", Step[]> = {
  tools: ["tools", "json_schema", "json_object", "text"],
  json_schema: ["json_schema", "json_object", "text"],
};
/** Statuts qui font passer au cran suivant (404 : certains serveurs répondent ainsi à un paramètre inconnu). */
const FALLBACK_ON: Record<Step, number[]> = {
  tools: [400, 404, 405, 422, 501],
  json_schema: [400, 404, 405, 422, 501],
  json_object: [400, 422],
  text: [],
};
const STEP_LABEL: Record<Step, string> = { tools: "outil", json_schema: "schéma", json_object: "json", text: "texte" };

async function callOpenAICompatible(
  req: StructuredRequest,
  cfg: LlmConfig,
  model: string,
  deps: LlmDeps
): Promise<StructuredResult> {
  const preset = PROVIDERS[cfg.provider];
  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const url = `${cfg.baseURL.replace(/\/+$/, "")}/chat/completions`;
  const systemText = blocksOf(req.system)
    .map((b) => b.text)
    .join("\n\n");
  const maxTokens = Math.round(req.maxTokens * preset.tokenHeadroom);

  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
  if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`;
  if (cfg.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://github.com/latenightsbeats1208-pixel/jobscout";
    headers["X-Title"] = "JobScout";
  }

  async function post(body: Record<string, unknown>): Promise<ChatResponse> {
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), preset.timeoutMs);
      let res: Response;
      try {
        res = await doFetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
      } catch (e) {
        const timeout = e instanceof Error && e.name === "AbortError";
        throw new LlmTransportError(cfg.provider, cfg.baseURL, timeout, e);
      } finally {
        clearTimeout(timer);
      }
      if (res.ok) return (await res.json()) as ChatResponse;
      const text = await res.text().catch(() => "");
      if (RETRYABLE.has(res.status) && attempt < 1) {
        await sleep(2000);
        continue;
      }
      let detail = text.slice(0, 400);
      try {
        const j = JSON.parse(text) as { error?: { message?: unknown } | string; message?: unknown };
        const m = typeof j.error === "string" ? j.error : j.error?.message ?? j.message;
        if (typeof m === "string") detail = m.slice(0, 400);
      } catch {
        // corps non JSON : on garde l'extrait brut
      }
      throw new LlmHttpError(res.status, cfg.provider, detail);
    }
  }

  const messages = (withSchema: boolean): ChatMessage[] => [
    { role: "system", content: systemText + (withSchema ? jsonInstruction(req.tool) : "") },
    { role: "user", content: req.user },
  ];

  function bodyFor(step: Step, extra: Record<string, unknown>): Record<string, unknown> {
    const body: Record<string, unknown> = { model, ...extra, [preset.tokenParam]: maxTokens, stream: false };
    if (step === "tools") {
      body.messages = messages(false);
      body.tools = [
        { type: "function", function: { name: req.tool.name, description: req.tool.description, parameters: req.tool.input_schema } },
      ];
      body.tool_choice = preset.namedToolChoice ? { type: "function", function: { name: req.tool.name } } : "required";
    } else {
      body.messages = messages(true);
      if (step === "json_schema") {
        body.response_format = {
          type: "json_schema",
          json_schema: { name: req.tool.name, schema: req.tool.input_schema, strict: false },
        };
      } else if (step === "json_object") {
        body.response_format = { type: "json_object" };
      }
    }
    return body;
  }

  const finish = (data: ChatResponse, step: Step): StructuredResult | null => {
    const choice = data.choices?.[0];
    const truncated = choice?.finish_reason === "length";
    const calls = choice?.message?.tool_calls ?? [];
    const call = calls.find((c) => c.function?.name === req.tool.name) ?? calls[0];
    let input = call ? parseToolArguments(call.function?.arguments) : null;
    if (!input && choice) input = extractJsonObject(contentText(choice));
    if (input) input = coerceToSchema(input, req.tool.input_schema) as Record<string, unknown>;
    const u = data.usage;
    console.log(
      `[llm] ${cfg.provider}/${model} (${STEP_LABEL[step]}) — ${u?.prompt_tokens ?? "?"} jetons en entrée, ${u?.completion_tokens ?? "?"} en sortie${truncated ? ", TRONQUÉ" : ""}`
    );
    if (input || truncated) return { input, truncated, provider: cfg.provider, model };
    return null;
  };

  // Paramètres propres au fournisseur (ex. raisonnement coupé) : retirés si le
  // serveur les refuse nommément, puis on rejoue le même cran.
  const extra: Record<string, unknown> = { ...(preset.extraBody ?? {}) };
  const steps = LADDER[preset.structured];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    try {
      const r = finish(await post(bodyFor(step, extra)), step);
      if (r) return r;
    } catch (e) {
      if (!(e instanceof LlmHttpError) || !FALLBACK_ON[step].includes(e.status)) throw e;
      const refused = Object.keys(extra).filter((k) => e.detail.includes(k));
      if (refused.length > 0) {
        console.warn(`[llm] ${cfg.provider}/${model} : paramètre refusé (${refused.join(", ")}) — nouvel essai sans`);
        for (const k of refused) delete extra[k];
        i--;
        continue;
      }
      if (i === steps.length - 1) throw e;
      console.warn(
        `[llm] ${cfg.provider}/${model} : ${STEP_LABEL[step]} refusé (HTTP ${e.status}) — repli « ${STEP_LABEL[steps[i + 1]]} »`
      );
    }
  }
  return { input: null, truncated: false, provider: cfg.provider, model };
}

/* ------------------------------- Liste des modèles ------------------------------ */

/**
 * Liste les modèles disponibles chez le fournisseur (appel gratuit) : sert à
 * vérifier la clé et à proposer les modèles dans les réglages.
 */
export async function listModels(cfg: LlmConfig, deps: LlmDeps = {}): Promise<string[]> {
  if (cfg.kind === "anthropic") {
    const client = deps.anthropic ?? getClaude(cfg);
    const page = await client.models.list({ limit: 100 });
    return page.data.map((m) => m.id);
  }
  const doFetch = deps.fetch ?? fetch;
  const url = `${cfg.baseURL.replace(/\/+$/, "")}/models`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await doFetch(url, {
      headers: { accept: "application/json", ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
      signal: controller.signal,
    });
  } catch (e) {
    throw new LlmTransportError(cfg.provider, cfg.baseURL, e instanceof Error && e.name === "AbortError", e);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new LlmHttpError(res.status, cfg.provider, (await res.text().catch(() => "")).slice(0, 300));
  const body = (await res.json().catch(() => null)) as { data?: Array<{ id?: unknown }>; models?: Array<{ name?: unknown }> } | null;
  const ids = [
    ...(body?.data ?? []).map((m) => m.id),
    ...(body?.models ?? []).map((m) => m.name),
  ].filter((x): x is string => typeof x === "string");
  // Gemini préfixe ses modèles par « models/ » : l'API compatible accepte les deux.
  return [...new Set(ids.map((id) => id.replace(/^models\//, "")))].sort();
}
