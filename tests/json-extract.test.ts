import { describe, expect, it } from "vitest";
import { coerceToSchema, extractJsonObject, parseToolArguments, stripNoise } from "@/lib/ai/json-extract";

describe("extraction JSON tolérante", () => {
  it("lit un objet JSON direct", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it("ignore le texte autour, les balises Markdown et les blocs de réflexion", () => {
    const text = "<think>je réfléchis {pas du json}</think>\nVoici :\n```json\n{\"items\": [\"a\", \"b\"]}\n```\nFin.";
    expect(extractJsonObject(text)).toEqual({ items: ["a", "b"] });
  });

  it("ne se laisse pas piéger par des accolades dans les chaînes", () => {
    expect(extractJsonObject('Réponse : {"t": "un } et un {", "n": 2}')).toEqual({ t: "un } et un {", n: 2 });
  });

  it("passe à l'objet suivant si le premier est invalide", () => {
    expect(extractJsonObject('{faux} puis {"ok": true}')).toEqual({ ok: true });
  });

  it("renvoie null sans objet exploitable", () => {
    expect(extractJsonObject("aucun json ici")).toBeNull();
    expect(extractJsonObject("[1, 2, 3]")).toBeNull();
  });

  it("stripNoise retire <thinking> et les clôtures", () => {
    expect(stripNoise("<thinking>x</thinking>```{}```")).toBe("{}");
  });
});

describe("arguments d'appel de fonction", () => {
  it("accepte un objet déjà décodé", () => {
    expect(parseToolArguments({ a: 1 })).toEqual({ a: 1 });
  });
  it("décode une chaîne JSON", () => {
    expect(parseToolArguments('{"a":1}')).toEqual({ a: 1 });
  });
  it("récupère un JSON entouré de texte", () => {
    expect(parseToolArguments('Voici les arguments : {"a":1}')).toEqual({ a: 1 });
  });
  it("renvoie null pour une chaîne vide ou un tableau", () => {
    expect(parseToolArguments("")).toBeNull();
    expect(parseToolArguments([1])).toBeNull();
  });
});

describe("remise en forme selon le schéma", () => {
  const schema = {
    type: "object",
    properties: {
      sections: {
        type: "object",
        properties: { experiences: { type: "array", items: { type: "object", properties: { title: { type: "string" } } } } },
      },
      tags: { type: "array", items: { type: "string" } },
      name: { type: "string" },
    },
  };

  it("décode les sous-objets et tableaux renvoyés en chaîne JSON", () => {
    const out = coerceToSchema(
      { sections: '{"experiences":[{"title":"A"}]}', tags: '["x","y"]', name: '{"reste":"une chaîne"}' },
      schema
    );
    expect(out).toEqual({ sections: { experiences: [{ title: "A" }] }, tags: ["x", "y"], name: '{"reste":"une chaîne"}' });
  });

  it("laisse intacte une chaîne non JSON", () => {
    expect(coerceToSchema({ tags: "pas du json" }, schema)).toEqual({ tags: "pas du json" });
  });
});
