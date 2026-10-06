import { describe, expect, it } from "vitest";
import {
  PROVIDERS,
  PROVIDER_IDS,
  isProviderId,
  missingModels,
  noLocalModelMessage,
  normalizeBaseURLInput,
  validateBaseURL,
} from "@/lib/ai/providers";

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

describe("saisie de l'adresse d'un serveur local (3.4.14)", () => {
  it("ajoute http:// et /v1 aux saisies incomplètes d'Ollama", () => {
    expect(normalizeBaseURLInput("localhost:11434", "ollama")).toBe("http://localhost:11434/v1");
    expect(normalizeBaseURLInput("http://127.0.0.1:11434/", "ollama")).toBe("http://127.0.0.1:11434/v1");
    expect(normalizeBaseURLInput("http://127.0.0.1:11434/api", "ollama")).toBe("http://127.0.0.1:11434/v1");
    expect(normalizeBaseURLInput("127.0.0.1:11434/v1", "ollama")).toBe("http://127.0.0.1:11434/v1");
  });
  it("retire un point d'accès complet collé par erreur", () => {
    expect(normalizeBaseURLInput("http://127.0.0.1:1234/v1/chat/completions", "lmstudio")).toBe("http://127.0.0.1:1234/v1");
    expect(normalizeBaseURLInput("https://api.exemple.com/v1/models", "custom")).toBe("https://api.exemple.com/v1");
  });
  it("laisse intactes les adresses correctes et ne touche pas au chemin d'un fournisseur distant", () => {
    expect(normalizeBaseURLInput("http://127.0.0.1:11434/v1", "ollama")).toBe("http://127.0.0.1:11434/v1");
    expect(normalizeBaseURLInput("https://api.exemple.com", "custom")).toBe("https://api.exemple.com");
  });
  it("une IP du réseau local reste refusée après normalisation (pas de décision d'ouverture)", () => {
    expect(validateBaseURL(normalizeBaseURLInput("192.168.1.20:11434", "ollama")).ok).toBe(false);
  });
});

describe("modèles introuvables (3.4.14)", () => {
  it("« nom » et « nom:latest » désignent le même modèle", () => {
    expect(missingModels(["llama3.2:latest", "gemma4:12b"], ["llama3.2", "gemma4:12b"])).toEqual([]);
  });
  it("signale un modèle absent une seule fois", () => {
    expect(missingModels(["gemma4:12b"], ["qwen3.5:9b", "qwen3.5:9b"])).toEqual(["qwen3.5:9b"]);
  });
  it("aucun modèle installé : la commande à taper pour Ollama, le logiciel pour LM Studio", () => {
    expect(noLocalModelMessage("ollama", "gemma4:12b")).toContain("ollama pull gemma4:12b");
    const both = noLocalModelMessage("ollama", "gemma4:12b", "qwen3.5:9b");
    expect(both).toContain("« ollama pull gemma4:12b » puis « ollama pull qwen3.5:9b »");
    expect(noLocalModelMessage("ollama", "qwen3.5:4b", "qwen3.5:4b").match(/ollama pull/g)).toHaveLength(1);
    expect(noLocalModelMessage("lmstudio")).toContain("LM Studio");
  });
});
