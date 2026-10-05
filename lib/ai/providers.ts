/**
 * Catalogue des fournisseurs d'IA utilisables avec une clé personnelle.
 *
 * Deux familles seulement côté code :
 * - « anthropic » : API Messages native (SDK officiel) — seule compatible avec
 *   le mode relais (pack), dont le relais parle le format Anthropic ;
 * - « openai-compatible » : format Chat Completions (POST {base}/chat/completions),
 *   parlé par OpenAI et, via leurs points d'accès compatibles, par Google Gemini,
 *   Mistral, DeepSeek, Groq, OpenRouter, Ollama, LM Studio et tout serveur
 *   compatible (vLLM, llama.cpp, LocalAI…).
 *
 * Les modèles par défaut ne sont que des suggestions : l'utilisateur choisit
 * les siens dans Profil › Génération IA (liste chargée chez le fournisseur).
 * Ce fichier ne dépend pas du serveur : il est aussi importé par l'interface.
 */

export type ProviderKind = "anthropic" | "openai-compatible";

export type ProviderId =
  | "anthropic"
  | "openai"
  | "gemini"
  | "mistral"
  | "deepseek"
  | "groq"
  | "openrouter"
  | "ollama"
  | "lmstudio"
  | "custom";

export type ProviderPreset = {
  id: ProviderId;
  label: string;
  kind: ProviderKind;
  /** URL de base de l'API (pour openai-compatible : jusqu'au préfixe de /chat/completions). */
  baseURL: string;
  /** L'URL peut être modifiée par l'utilisateur (serveur local, auto-hébergé…). */
  editableBaseURL: boolean;
  keyRequired: boolean;
  /** Fournisseur qui tourne sur la machine de l'utilisateur (aucune donnée ne sort). */
  local: boolean;
  /** Modèle « rédaction » (extraction du CV, CV, lettre, message V.I.E) et « relecture » (relecture, traduction). */
  models: { writer: string; reviewer: string };
  /**
   * Première stratégie de sortie structurée : « tools » = appel de fonction forcé ;
   * « json_schema » = sortie JSON contrainte par schéma (serveurs locaux, Gemini).
   * En cas de refus, llm.ts descend l'échelle : outil → schéma JSON → JSON → texte.
   */
  structured: "tools" | "json_schema";
  /** Accepte tool_choice nommé ({type:"function",function:{name}}) ; sinon "required". */
  namedToolChoice: boolean;
  /** Paramètres propres au fournisseur ajoutés au premier essai (retirés dans les replis). */
  extraBody?: Record<string, unknown>;
  /** Nom du paramètre de longueur de sortie. */
  tokenParam: "max_tokens" | "max_completion_tokens";
  /** Multiplicateur de budget de sortie (modèles « de raisonnement » qui consomment des jetons de réflexion). */
  tokenHeadroom: number;
  /** Délai maximal d'un appel (les modèles locaux sont lents). */
  timeoutMs: number;
  keyPlaceholder: string;
  keyUrl: string | null;
  help: string;
};

export const PROVIDERS: Record<ProviderId, ProviderPreset> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic (Claude)",
    kind: "anthropic",
    baseURL: "https://api.anthropic.com",
    editableBaseURL: false,
    keyRequired: true,
    local: false,
    models: { writer: "claude-opus-4-8", reviewer: "claude-sonnet-5" },
    structured: "tools",
    namedToolChoice: true,
    tokenParam: "max_tokens",
    tokenHeadroom: 1,
    timeoutMs: 600_000,
    keyPlaceholder: "sk-ant-…",
    keyUrl: "https://platform.claude.com",
    help: "Référence de JobScout : qualité de rédaction et respect du profil éprouvés. Environ 0,12 à 0,20 $ par dossier.",
  },
  openai: {
    id: "openai",
    label: "OpenAI (GPT)",
    kind: "openai-compatible",
    baseURL: "https://api.openai.com/v1",
    editableBaseURL: false,
    keyRequired: true,
    local: false,
    models: { writer: "gpt-6-sol", reviewer: "gpt-6-luna" },
    structured: "tools",
    namedToolChoice: true,
    extraBody: { reasoning_effort: "none" },
    tokenParam: "max_completion_tokens",
    tokenHeadroom: 4,
    timeoutMs: 300_000,
    keyPlaceholder: "sk-…",
    keyUrl: "https://platform.openai.com/api-keys",
    help: "Clé sur platform.openai.com (pas d'offre gratuite). GPT-6 Sol pour la rédaction, GPT-6 Luna pour la relecture ; JobScout coupe leur phase de raisonnement pour garantir des réponses structurées.",
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    kind: "openai-compatible",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    editableBaseURL: false,
    keyRequired: true,
    local: false,
    models: { writer: "gemini-3.8-flash", reviewer: "gemini-3.5-flash-lite" },
    structured: "tools",
    namedToolChoice: false,
    tokenParam: "max_tokens",
    tokenHeadroom: 3,
    timeoutMs: 300_000,
    keyPlaceholder: "AIza…",
    keyUrl: "https://aistudio.google.com/apikey",
    help: "Clé gratuite sur Google AI Studio (quota limité ; sur l'offre gratuite, vos données peuvent servir à améliorer les produits Google).",
  },
  mistral: {
    id: "mistral",
    label: "Mistral AI",
    kind: "openai-compatible",
    baseURL: "https://api.mistral.ai/v1",
    editableBaseURL: false,
    keyRequired: true,
    local: false,
    models: { writer: "mistral-medium-latest", reviewer: "mistral-small-latest" },
    structured: "tools",
    namedToolChoice: true,
    tokenParam: "max_tokens",
    tokenHeadroom: 1,
    timeoutMs: 300_000,
    keyPlaceholder: "Clé Mistral",
    keyUrl: "https://console.mistral.ai/api-keys",
    help: "Fournisseur européen, offre gratuite avec quotas (sans carte bancaire). Clé sur console.mistral.ai.",
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai-compatible",
    baseURL: "https://api.deepseek.com",
    editableBaseURL: false,
    keyRequired: true,
    local: false,
    models: { writer: "deepseek-v4-pro", reviewer: "deepseek-flash" },
    structured: "tools",
    namedToolChoice: true,
    extraBody: { thinking: { type: "disabled" } },
    tokenParam: "max_tokens",
    tokenHeadroom: 1,
    timeoutMs: 300_000,
    keyPlaceholder: "sk-…",
    keyUrl: "https://platform.deepseek.com/api_keys",
    help: "Très économique (compte prépayé, tarif doublé aux heures de pointe asiatiques). Clé sur platform.deepseek.com.",
  },
  groq: {
    id: "groq",
    label: "Groq",
    kind: "openai-compatible",
    baseURL: "https://api.groq.com/openai/v1",
    editableBaseURL: false,
    keyRequired: true,
    local: false,
    models: { writer: "openai/gpt-oss-120b", reviewer: "openai/gpt-oss-20b" },
    structured: "tools",
    namedToolChoice: true,
    tokenParam: "max_completion_tokens",
    tokenHeadroom: 2,
    timeoutMs: 180_000,
    keyPlaceholder: "gsk_…",
    keyUrl: "https://console.groq.com/keys",
    help: "Modèles ouverts très rapides. Offre gratuite très limitée (environ 8 000 jetons par minute) : un dossier complet peut la dépasser. Clé sur console.groq.com.",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai-compatible",
    baseURL: "https://openrouter.ai/api/v1",
    editableBaseURL: false,
    keyRequired: true,
    local: false,
    models: { writer: "google/gemini-3.8-flash", reviewer: "openai/gpt-6-luna" },
    structured: "tools",
    namedToolChoice: false,
    tokenParam: "max_tokens",
    tokenHeadroom: 2,
    timeoutMs: 300_000,
    keyPlaceholder: "sk-or-…",
    keyUrl: "https://openrouter.ai/keys",
    help: "Une seule clé pour des centaines de modèles (format « fournisseur/modèle »).",
  },
  ollama: {
    id: "ollama",
    label: "Ollama (local)",
    kind: "openai-compatible",
    baseURL: "http://127.0.0.1:11434/v1",
    editableBaseURL: true,
    keyRequired: false,
    local: true,
    models: { writer: "gemma4:12b", reviewer: "qwen3.5:9b" },
    structured: "json_schema",
    namedToolChoice: false,
    tokenParam: "max_tokens",
    tokenHeadroom: 2,
    timeoutMs: 900_000,
    keyPlaceholder: "(aucune clé)",
    keyUrl: "https://ollama.com/download",
    help: "Gratuit et 100 % local, mais la qualité dépend du modèle et de la machine (modèles de 8 à 14 milliards de paramètres conseillés : gemma4:12b, qwen3.5:9b, ministral-3:14b). Augmentez le contexte d'Ollama (variable OLLAMA_CONTEXT_LENGTH=16384), sinon les longs CV sont tronqués.",
  },
  lmstudio: {
    id: "lmstudio",
    label: "LM Studio (local)",
    kind: "openai-compatible",
    baseURL: "http://127.0.0.1:1234/v1",
    editableBaseURL: true,
    keyRequired: false,
    local: true,
    models: { writer: "", reviewer: "" },
    structured: "json_schema",
    namedToolChoice: false,
    tokenParam: "max_tokens",
    tokenHeadroom: 2,
    timeoutMs: 900_000,
    keyPlaceholder: "(aucune clé)",
    keyUrl: "https://lmstudio.ai",
    help: "Gratuit et 100 % local : démarrez le serveur de LM Studio, chargez un modèle, puis « Charger la liste ».",
  },
  custom: {
    id: "custom",
    label: "Autre (compatible OpenAI)",
    kind: "openai-compatible",
    baseURL: "",
    editableBaseURL: true,
    keyRequired: false,
    local: false,
    models: { writer: "", reviewer: "" },
    structured: "tools",
    namedToolChoice: false,
    tokenParam: "max_tokens",
    tokenHeadroom: 2,
    timeoutMs: 600_000,
    keyPlaceholder: "Clé (si le serveur en demande une)",
    keyUrl: null,
    help: "Tout serveur au format OpenAI Chat Completions (vLLM, llama.cpp, LocalAI, passerelle d'entreprise…). Indiquez l'URL qui précède /chat/completions.",
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === "string" && (PROVIDER_IDS as string[]).includes(v);
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Valide une URL de base saisie par l'utilisateur. Elle reçoit la clé API et
 * le contenu du CV : HTTPS obligatoire, sauf serveur sur la machine même
 * (Ollama, LM Studio). Renvoie l'URL normalisée (sans « / » final) ou un
 * message d'erreur en français.
 */
export function validateBaseURL(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const text = raw.trim().replace(/\/+$/, "");
  if (!text) return { ok: false, error: "Indiquez l'adresse du serveur (URL de base)." };
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return { ok: false, error: "Adresse invalide — exemple : https://api.exemple.com/v1 ou http://127.0.0.1:11434/v1." };
  }
  if (u.username || u.password) return { ok: false, error: "L'adresse ne doit pas contenir d'identifiants." };
  const host = u.hostname.toLowerCase();
  if (u.protocol === "https:") return { ok: true, url: text };
  if (u.protocol === "http:" && LOCAL_HOSTS.has(host)) return { ok: true, url: text };
  return {
    ok: false,
    error: "Pour protéger votre clé et votre CV, seule une adresse en https:// est acceptée (http:// uniquement pour un serveur sur cette machine : localhost ou 127.0.0.1).",
  };
}
