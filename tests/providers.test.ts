import { describe, expect, it } from "vitest";
import { PROVIDERS, PROVIDER_IDS, isProviderId, validateBaseURL } from "@/lib/ai/providers";

describe("catalogue des fournisseurs", () => {
  it("chaque fournisseur est complet et cohérent", () => {
    for (const id of PROVIDER_IDS) {
      const p = PROVIDERS[id];
      expect(p.id).toBe(id);
      expect(p.label.length).toBeGreaterThan(2);
      expect(["anthropic", "openai-compatible"]).toContain(p.kind);
      expect(p.tokenHeadroom).toBeGreaterThanOrEqual(1);
      expect(p.timeoutMs).toBeGreaterThanOrEqual(60_000);
      if (!p.editableBaseURL) {
        // Une URL fixe doit être en HTTPS : elle reçoit la clé et le CV.
        expect(p.baseURL.startsWith("https://")).toBe(true);
      }
      if (p.local) expect(p.keyRequired).toBe(false);
      expect(["tools", "json_schema"]).toContain(p.structured);
      // Un modèle par défaut vide n'est admis que là où l'utilisateur doit choisir le sien.
      if (!p.models.writer) expect(["lmstudio", "custom"]).toContain(id);
    }
  });

  it("serveurs locaux : ni tool_choice nommé ni outil forcé en premier (non gérés par Ollama / LM Studio)", () => {
    for (const id of ["ollama", "lmstudio"] as const) {
      expect(PROVIDERS[id].namedToolChoice).toBe(false);
      expect(PROVIDERS[id].structured).toBe("json_schema");
    }
  });

  it("seul Anthropic utilise l'API native", () => {
    expect(PROVIDER_IDS.filter((id) => PROVIDERS[id].kind === "anthropic")).toEqual(["anthropic"]);
  });

  it("reconnaît les identifiants", () => {
    expect(isProviderId("ollama")).toBe(true);
    expect(isProviderId("inconnu")).toBe(false);
    expect(isProviderId(42)).toBe(false);
  });
});

describe("validation de l'adresse du serveur", () => {
  it("accepte HTTPS et normalise le / final", () => {
    expect(validateBaseURL("https://api.exemple.com/v1/")).toEqual({ ok: true, url: "https://api.exemple.com/v1" });
  });
  it("accepte HTTP seulement pour la machine locale", () => {
    expect(validateBaseURL("http://127.0.0.1:11434/v1").ok).toBe(true);
    expect(validateBaseURL("http://localhost:1234/v1").ok).toBe(true);
    expect(validateBaseURL("http://192.168.1.20:11434/v1").ok).toBe(false);
    expect(validateBaseURL("http://api.exemple.com/v1").ok).toBe(false);
  });
  it("refuse les adresses invalides ou avec identifiants", () => {
    expect(validateBaseURL("").ok).toBe(false);
    expect(validateBaseURL("pas une url").ok).toBe(false);
    expect(validateBaseURL("https://user:pass@api.exemple.com").ok).toBe(false);
    expect(validateBaseURL("ftp://api.exemple.com").ok).toBe(false);
  });
});
