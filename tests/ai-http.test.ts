import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AGENT_OPTIONS, isTimeoutError, networkCode, providerFetch } from "@/lib/ai/http";
import { callStructured, listModels } from "@/lib/ai/llm";
import { cfgFor } from "./fixtures";

/**
 * Transport réel (sans faux fetch) : le fetch du paquet undici avec l'agent
 * sans délai interne. La coupure à 300 s du fetch intégré n'est pas rejouée
 * ici (5 minutes) : elle a été mesurée à part le 06/10/2026 (300,7 s).
 */
let server: http.Server;
let base = "";
beforeAll(async () => {
  server = http.createServer((req, res) => {
    const delay = req.url?.includes("lent") ? 2000 : 0;
    // Faux serveur compatible OpenAI pour les appels réels de llm.ts (sans faux fetch).
    const body =
      req.url === "/v1/models"
        ? { object: "list", data: [{ id: "gemma4:12b" }] }
        : req.url === "/v1/chat/completions"
          ? { choices: [{ finish_reason: "stop", message: { role: "assistant", content: '{"title":"T"}' } }] }
          : { ok: true, url: req.url };
    setTimeout(() => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    }, delay);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});

describe("transport des fournisseurs compatibles OpenAI", () => {
  it("renvoie la réponse d'un serveur local", async () => {
    const res = await providerFetch(`${base}/ping`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, url: "/ping" });
  });

  it("la garde de l'appelant (AbortController) reste le plafond, reconnue comme délai", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 200);
    const err = await providerFetch(`${base}/lent`, { signal: controller.signal }).catch((e) => e);
    expect(isTimeoutError(err)).toBe(true);
  });

  it("port fermé → code ECONNREFUSED retrouvé dans la cause", async () => {
    const closed = http.createServer();
    await new Promise<void>((r) => closed.listen(0, "127.0.0.1", () => r()));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>((r) => closed.close(() => r()));
    const err = await providerFetch(`http://127.0.0.1:${port}/v1/models`).catch((e) => e);
    expect(networkCode(err)).toBe("ECONNREFUSED");
    expect(isTimeoutError(err)).toBe(false);
  });
});

describe("non-régression : le fetch intégré (coupure à 300 s) n'est plus utilisé (3.4.14)", () => {
  it("l'agent n'a aucun délai interne (la garde de l'appelant borne seule l'attente)", () => {
    expect(AGENT_OPTIONS).toEqual({ headersTimeout: 0, bodyTimeout: 0 });
  });

  it("callStructured et listModels, sans faux fetch, joignent le serveur sans passer par le fetch global", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    try {
      const cfg = cfgFor("ollama", { baseURL: `${base}/v1` });
      expect(await listModels(cfg)).toEqual(["gemma4:12b"]);
      const out = await callStructured(
        {
          role: "writer",
          system: "Réponds en JSON.",
          user: "Titre ?",
          tool: { name: "t", description: "titre", input_schema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] } },
          maxTokens: 100,
        },
        cfg
      );
      expect(out.input).toEqual({ title: "T" });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
