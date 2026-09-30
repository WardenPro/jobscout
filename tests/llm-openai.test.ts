import { describe, expect, it } from "vitest";
import { callStructured, listModels, LlmHttpError, LlmTransportError, type StructuredRequest } from "@/lib/ai/llm";
import { PROVIDERS } from "@/lib/ai/providers";
import { translateAiError } from "@/lib/ai/errors";
import { cfgFor } from "./fixtures";

const TOOL = {
  name: "build_thing",
  description: "Construit la chose.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      sections: { type: "object", properties: { items: { type: "array", items: { type: "string" } } } },
    },
    required: ["title", "sections"],
  },
};
const REQ: StructuredRequest = {
  role: "writer",
  system: [{ text: "Tu es un assistant.", cache: true }, { text: "Profil : …" }],
  user: "Fais la chose.",
  tool: TOOL,
  maxTokens: 1000,
};

type Call = { url: string; init: RequestInit; body: Record<string, unknown> | null };

/** Faux fetch : rejoue une liste de réponses et mémorise les requêtes. */
function fakeFetch(responses: Array<{ status?: number; body: unknown } | Error>) {
  const calls: Call[] = [];
  let i = 0;
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    const bodyText = typeof init?.body === "string" ? init.body : null;
    calls.push({ url: String(url), init: init ?? {}, body: bodyText ? JSON.parse(bodyText) : null });
    const r = responses[Math.min(i++, responses.length - 1)];
    if (r instanceof Error) throw r;
    const status = r.status ?? 200;
    const text = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
    return new Response(text, { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fn, calls };
}

const toolAnswer = (args: unknown, finish = "tool_calls") => ({
  choices: [
    {
      finish_reason: finish,
      message: { content: null, tool_calls: [{ type: "function", function: { name: "build_thing", arguments: typeof args === "string" ? args : JSON.stringify(args) } }] },
    },
  ],
  usage: { prompt_tokens: 100, completion_tokens: 50 },
});
const noSleep = { sleep: async () => {} };

describe("fournisseur compatible OpenAI", () => {
  it("OpenAI : appel de fonction nommé, max_completion_tokens avec marge, clé en Bearer", async () => {
    const { fn, calls } = fakeFetch([{ body: toolAnswer({ title: "T", sections: { items: ["a"] } }) }]);
    const cfg = cfgFor("openai");
    const r = await callStructured(REQ, cfg, { fetch: fn });
    expect(r.input).toEqual({ title: "T", sections: { items: ["a"] } });
    expect(r.truncated).toBe(false);
    expect(r.provider).toBe("openai");
    expect(r.model).toBe(cfg.models.writer);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
    const b = calls[0].body!;
    expect(b.model).toBe(cfg.models.writer);
    expect(b.tool_choice).toEqual({ type: "function", function: { name: "build_thing" } });
    expect(b.max_completion_tokens).toBe(4000);
    expect(b.max_tokens).toBeUndefined();
    // GPT-6 n'accepte les outils en Chat Completions qu'avec le raisonnement coupé.
    expect(b.reasoning_effort).toBe("none");
    expect((b.messages as Array<{ role: string; content: string }>)[0]).toEqual({ role: "system", content: "Tu es un assistant.\n\nProfil : …" });
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer test-key-123456");
  });

  it("modèle de relecture pour le rôle reviewer", async () => {
    const { fn, calls } = fakeFetch([{ body: toolAnswer({ title: "T", sections: {} }) }]);
    const cfg = cfgFor("openai");
    await callStructured({ ...REQ, role: "reviewer" }, cfg, { fetch: fn });
    expect(calls[0].body!.model).toBe(cfg.models.reviewer);
  });

  it("Mistral : outil nommé et max_tokens, sans paramètre propre à un autre fournisseur", async () => {
    const { fn, calls } = fakeFetch([{ body: toolAnswer({ title: "T", sections: {} }) }]);
    await callStructured(REQ, cfgFor("mistral"), { fetch: fn });
    expect(calls[0].body!.tool_choice).toEqual({ type: "function", function: { name: "build_thing" } });
    expect(calls[0].body!.max_tokens).toBe(1000);
    // Mistral refuse les champs inconnus : rien d'autre que le strict nécessaire.
    expect(Object.keys(calls[0].body!).sort()).toEqual(["max_tokens", "messages", "model", "stream", "tool_choice", "tools"]);
  });

  it("Gemini : tool_choice « required » (forme nommée non garantie)", async () => {
    const { fn, calls } = fakeFetch([{ body: toolAnswer({ title: "T", sections: {} }) }]);
    await callStructured(REQ, cfgFor("gemini"), { fetch: fn });
    expect(calls[0].body!.tool_choice).toBe("required");
    expect(calls[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
  });

  it("DeepSeek : mode « thinking » coupé (sinon l'outil forcé est refusé) et URL sans /v1", async () => {
    const { fn, calls } = fakeFetch([{ body: toolAnswer({ title: "T", sections: {} }) }]);
    await callStructured(REQ, cfgFor("deepseek"), { fetch: fn });
    expect(calls[0].url).toBe("https://api.deepseek.com/chat/completions");
    expect(calls[0].body!.thinking).toEqual({ type: "disabled" });
    expect(calls[0].body!.tool_choice).toEqual({ type: "function", function: { name: "build_thing" } });
  });

  it("Groq : max_completion_tokens", async () => {
    const { fn, calls } = fakeFetch([{ body: toolAnswer({ title: "T", sections: {} }) }]);
    await callStructured(REQ, cfgFor("groq"), { fetch: fn });
    expect(calls[0].body!.max_completion_tokens).toBe(2000);
    expect(calls[0].body!.max_tokens).toBeUndefined();
  });

  it("paramètre propre refusé nommément → même stratégie rejouée sans lui", async () => {
    const { fn, calls } = fakeFetch([
      { status: 400, body: { error: { message: "Unsupported value: 'reasoning_effort' does not support 'none' with this model." } } },
      { body: toolAnswer({ title: "T", sections: {} }) },
    ]);
    const r = await callStructured(REQ, cfgFor("openai"), { fetch: fn });
    expect(r.input).toEqual({ title: "T", sections: {} });
    expect(calls).toHaveLength(2);
    expect(calls[0].body!.reasoning_effort).toBe("none");
    expect(calls[1].body!.reasoning_effort).toBeUndefined();
    expect(calls[1].body!.tools).toBeDefined();
  });

  it("Ollama et LM Studio : sortie contrainte par le schéma d'emblée, sans outil ni tool_choice", async () => {
    for (const id of ["ollama", "lmstudio"] as const) {
      expect(PROVIDERS[id].structured).toBe("json_schema");
      const { fn, calls } = fakeFetch([{ body: { choices: [{ finish_reason: "stop", message: { content: '{"title":"T","sections":{}}' } }] } }]);
      const r = await callStructured(REQ, cfgFor(id), { fetch: fn });
      expect(r.input).toEqual({ title: "T", sections: {} });
      expect(calls).toHaveLength(1);
      const b = calls[0].body!;
      expect(b.tools).toBeUndefined();
      expect(b.tool_choice).toBeUndefined();
      expect(b.response_format).toEqual({ type: "json_schema", json_schema: { name: "build_thing", schema: TOOL.input_schema, strict: false } });
      expect(String((b.messages as Array<{ content: string }>)[0].content)).toContain("Format de réponse obligatoire");
    }
  });

  it("remet en forme un sous-objet renvoyé en chaîne JSON", async () => {
    const { fn } = fakeFetch([{ body: toolAnswer({ title: "T", sections: '{"items":["x"]}' }) }]);
    const r = await callStructured(REQ, cfgFor("deepseek"), { fetch: fn });
    expect(r.input).toEqual({ title: "T", sections: { items: ["x"] } });
  });

  it("sans appel de fonction, lit le JSON dans le texte (balises de réflexion comprises)", async () => {
    const { fn, calls } = fakeFetch([
      { body: { choices: [{ finish_reason: "stop", message: { content: '<think>…</think>```json\n{"title":"T","sections":{}}\n```' } }] } },
    ]);
    const r = await callStructured(REQ, cfgFor("ollama"), { fetch: fn });
    expect(r.input).toEqual({ title: "T", sections: {} });
    expect(calls).toHaveLength(1);
  });

  it("Ollama sans clé : aucun en-tête Authorization", async () => {
    const { fn, calls } = fakeFetch([{ body: toolAnswer({ title: "T", sections: {} }) }]);
    await callStructured(REQ, cfgFor("ollama"), { fetch: fn });
    expect((calls[0].init.headers as Record<string, string>).authorization).toBeUndefined();
    expect(calls[0].url).toBe("http://127.0.0.1:11434/v1/chat/completions");
  });

  it("outils refusés (HTTP 400) → repli sur la sortie contrainte par schéma, schéma aussi dans le prompt", async () => {
    const { fn, calls } = fakeFetch([
      { status: 400, body: { error: { message: "tools not supported" } } },
      { body: { choices: [{ finish_reason: "stop", message: { content: '{"title":"T","sections":{}}' } }] } },
    ]);
    const r = await callStructured(REQ, cfgFor("custom"), { fetch: fn });
    expect(r.input).toEqual({ title: "T", sections: {} });
    expect(calls).toHaveLength(2);
    expect(calls[0].body!.tool_choice).toBe("required");
    expect(calls[1].body!.tools).toBeUndefined();
    expect((calls[1].body!.response_format as { type: string }).type).toBe("json_schema");
    expect(String((calls[1].body!.messages as Array<{ content: string }>)[0].content)).toContain("Format de réponse obligatoire");
    expect(String((calls[1].body!.messages as Array<{ content: string }>)[0].content)).toContain("json");
  });

  it("échelle complète : outil → schéma → mode JSON → texte libre", async () => {
    const { fn, calls } = fakeFetch([
      { status: 400, body: { error: { message: "tools not supported" } } },
      { status: 422, body: { error: { message: "json_schema not supported" } } },
      { status: 400, body: { error: { message: "response_format not supported" } } },
      { body: { choices: [{ finish_reason: "stop", message: { content: 'Voici : {"title":"T","sections":{}}' } }] } },
    ]);
    const r = await callStructured(REQ, cfgFor("custom"), { fetch: fn });
    expect(r.input).toEqual({ title: "T", sections: {} });
    expect(calls.map((c) => (c.body!.tools ? "tools" : (c.body!.response_format as { type?: string } | undefined)?.type ?? "text"))).toEqual([
      "tools",
      "json_schema",
      "json_object",
      "text",
    ]);
  });

  it("dernier cran refusé → l'erreur remonte (pas de boucle)", async () => {
    const { fn, calls } = fakeFetch([{ status: 400, body: { error: { message: "context length exceeded" } } }]);
    const err = await callStructured(REQ, cfgFor("custom"), { fetch: fn }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmHttpError);
    expect(err.status).toBe(400);
    expect(calls).toHaveLength(4);
  });

  it("réponse vide après appel de fonction → nouvel essai en mode JSON", async () => {
    const { fn, calls } = fakeFetch([
      { body: { choices: [{ finish_reason: "stop", message: { content: "Je ne peux pas." } }] } },
      { body: { choices: [{ finish_reason: "stop", message: { content: '{"title":"T","sections":{}}' } }] } },
    ]);
    const r = await callStructured(REQ, cfgFor("groq"), { fetch: fn });
    expect(r.input).toEqual({ title: "T", sections: {} });
    expect(calls).toHaveLength(2);
  });

  it("signale une réponse tronquée", async () => {
    const { fn } = fakeFetch([{ body: toolAnswer('{"title":"T","sections":{"items":["a",', "length") }]);
    const r = await callStructured(REQ, cfgFor("openai"), { fetch: fn });
    expect(r.truncated).toBe(true);
  });

  it("aucune sortie exploitable → input null (l'appelant lève une erreur claire)", async () => {
    const { fn } = fakeFetch([{ body: { choices: [{ finish_reason: "stop", message: { content: "rien" } }] } }]);
    const r = await callStructured(REQ, cfgFor("gemini"), { fetch: fn });
    expect(r.input).toBeNull();
  });

  it("réessaie une fois sur 429 puis traduit l'erreur en français", async () => {
    const { fn, calls } = fakeFetch([
      { status: 429, body: { error: { message: "rate limited" } } },
      { status: 429, body: { error: { message: "rate limited" } } },
    ]);
    const err = await callStructured(REQ, cfgFor("openai"), { fetch: fn, ...noSleep }).catch((e) => e);
    expect(calls).toHaveLength(2);
    expect(err).toBeInstanceOf(LlmHttpError);
    const t = translateAiError(err)!;
    expect(t.status).toBe(429);
    expect(t.message).toContain("Limite atteinte chez OpenAI");
  });

  it("clé refusée (401) → message clair, sans nouvel essai", async () => {
    const { fn, calls } = fakeFetch([{ status: 401, body: { error: { message: "invalid api key" } } }]);
    const err = await callStructured(REQ, cfgFor("mistral"), { fetch: fn, ...noSleep }).catch((e) => e);
    expect(calls).toHaveLength(1);
    expect(translateAiError(err)!.message).toBe("Clé API refusée par Mistral AI — vérifiez-la dans Profil › Génération IA.");
  });

  it("modèle inconnu (404 partout) → message « modèle introuvable »", async () => {
    const { fn } = fakeFetch([{ status: 404, body: { error: { message: "model not found" } } }]);
    const err = await callStructured(REQ, cfgFor("openai"), { fetch: fn, ...noSleep }).catch((e) => e);
    expect(translateAiError(err)!.message).toContain("Modèle introuvable chez OpenAI");
  });

  it("serveur local éteint → message qui invite à lancer le logiciel", async () => {
    const { fn } = fakeFetch([new TypeError("fetch failed")]);
    const err = await callStructured(REQ, cfgFor("ollama"), { fetch: fn }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmTransportError);
    const t = translateAiError(err)!;
    expect(t.status).toBe(502);
    expect(t.message).toContain("Ollama (local)");
    expect(t.message).toContain("lancé");
  });

  it("délai dépassé → 504", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const { fn } = fakeFetch([abort]);
    const err = await callStructured(REQ, cfgFor("openai"), { fetch: fn }).catch((e) => e);
    expect(translateAiError(err)!.status).toBe(504);
  });

  it("OpenRouter : en-têtes d'identification de l'application", async () => {
    const { fn, calls } = fakeFetch([{ body: toolAnswer({ title: "T", sections: {} }) }]);
    await callStructured(REQ, cfgFor("openrouter"), { fetch: fn });
    expect((calls[0].init.headers as Record<string, string>)["X-Title"]).toBe("JobScout");
  });
});

describe("liste des modèles", () => {
  it("lit data[].id et retire le préfixe « models/ » de Gemini", async () => {
    const { fn, calls } = fakeFetch([{ body: { data: [{ id: "models/gemini-flash-latest" }, { id: "gemini-pro-latest" }, { id: "gemini-pro-latest" }] } }]);
    const ids = await listModels(cfgFor("gemini"), { fetch: fn });
    expect(ids).toEqual(["gemini-flash-latest", "gemini-pro-latest"]);
    expect(calls[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/models");
  });

  it("erreur HTTP → LlmHttpError", async () => {
    const { fn } = fakeFetch([{ status: 401, body: { error: "unauthorized" } }]);
    await expect(listModels(cfgFor("openai"), { fetch: fn })).rejects.toBeInstanceOf(LlmHttpError);
  });
});
