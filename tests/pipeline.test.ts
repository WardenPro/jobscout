import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setSetting } from "@/lib/db";
import { providerBaseUrlSetting, providerModelsSetting } from "@/lib/ai/client";
import { generateCV } from "@/lib/ai/generate-cv";
import { generateLM } from "@/lib/ai/generate-lm";
import { offre, profile } from "./fixtures";

/**
 * Bout en bout : la vraie chaîne de génération (prompts, validation anti-invention,
 * limites de mise en page, relecture) contre un faux serveur « compatible OpenAI »
 * local. Aucun appel réseau externe, aucune clé.
 */

type Seen = { tool: string; body: Record<string, unknown>; auth: string | undefined };
const seen: Seen[] = [];

/** Réponses scriptées par outil, comme le ferait un modèle. */
function answer(tool: string, userText: string): unknown {
  if (tool === "build_cv") {
    return {
      identity: { full_name: "Camille Martin", email: "camille.martin@example.org", phone: null, location: "Lyon, France", linkedin_url: null, portfolio_url: null },
      summary: "Cheffe de projet digital, cinq ans de pilotage de sites web.",
      // Sections renvoyées sous forme de chaîne JSON : défaut réel de certains modèles.
      sections: JSON.stringify({
        experiences: [
          { title: "Cheffe de projet digital", company: "Studio Nova", location: "Lyon", start_date: "2021-01", end_date: null, bullet_points: ["Pilotage de 3 refontes de sites e-commerce"] },
          // Expérience inventée : doit être supprimée par la validation anti-invention.
          { title: "Directrice marketing", company: "Entreprise Inventée SA", location: "Paris", start_date: "2019-01", end_date: "2020-12", bullet_points: ["Gestion d'un budget de 2 M€"] },
        ],
        educations: [{ school: "Université de Lyon", degree: "Master", field: "Management", start_date: "2016", end_date: "2018", bullet_points: [] }],
        projects: [],
        skills_flat: ["Gestion de projet", "SQL"],
        languages: [{ name: "Anglais", level: "C1" }],
      }),
    };
  }
  if (tool === "build_lm") {
    return {
      object: "Candidature au poste de chef de projet digital",
      body_paragraphs: [
        "Entreprise Exemple engage la refonte de ses sites et recherche un profil capable de coordonner des équipes techniques.",
        "Chez Studio Nova depuis 2021, j'ai piloté trois refontes de sites e-commerce et coordonné une équipe de cinq personnes.",
        "Votre besoin de pilotage rigoureux rejoint ma pratique de la gestion de projet et du suivi d'indicateurs.",
        "Disponible pour un entretien à Lyon ou en visioconférence, je vous remercie de l'attention portée à ma candidature.",
      ],
    };
  }
  if (tool === "return_corrections") {
    // Relecture « écho » : renvoie exactement les textes reçus.
    const parts = userText.split(/\n\n?\[\d+\] /).slice(1);
    return { items: parts.map((p) => p.trim()), changes: [] };
  }
  if (tool === "return_paragraph") {
    // Réparation « mobilité » : renvoie le §4 avec le lieu de l'offre.
    return { paragraph: "Frontalier, je peux me rendre chaque jour à Genève et suis disponible pour un entretien sur place ou en visioconférence." };
  }
  if (tool === "return_translations") {
    const parts = userText.split(/\n\[\d+\] /).slice(1);
    return { items: parts.map((p) => p.trim()) };
  }
  return {};
}

let server: http.Server;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw) as {
        tools?: Array<{ function: { name: string } }>;
        messages: Array<{ role: string; content: string }>;
      };
      const tool = body.tools?.[0]?.function.name ?? "?";
      seen.push({ tool, body, auth: req.headers.authorization });
      const user = body.messages.find((m) => m.role === "user")?.content ?? "";
      const args = answer(tool, user);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ type: "function", function: { name: tool, arguments: JSON.stringify(args) } }] } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        })
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  // Fournisseur « Autre (compatible OpenAI) », sans clé, sur le faux serveur.
  setSetting("llm:mode", "byok");
  setSetting("llm:provider", "custom");
  setSetting(providerBaseUrlSetting("custom"), `http://127.0.0.1:${port}/v1`);
  setSetting(providerModelsSetting("custom"), JSON.stringify({ writer: "modele-redaction", reviewer: "modele-relecture" }));
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("génération de bout en bout via un serveur compatible OpenAI", () => {
  it("CV : sections en chaîne réparées, expérience inventée supprimée, relecture par le modèle de relecture", async () => {
    seen.length = 0;
    const cv = await generateCV(profile, offre, "fr");
    expect(cv.identity.full_name).toBe("Camille Martin");
    const companies = cv.sections.experiences.map((e) => e.company);
    expect(companies).toContain("Studio Nova");
    expect(companies).not.toContain("Entreprise Inventée SA");
    expect(cv.sections.skills_flat).toEqual(expect.arrayContaining(["Gestion de projet", "SQL"]));

    const cvCall = seen.find((s) => s.tool === "build_cv")!;
    expect(cvCall.body.model).toBe("modele-redaction");
    expect(cvCall.body.tool_choice).toBe("required"); // « Autre » : pas de choix d'outil nommé
    expect(cvCall.auth).toBeUndefined(); // aucune clé envoyée
    const review = seen.find((s) => s.tool === "return_corrections")!;
    expect(review.body.model).toBe("modele-relecture");
  });

  it("lettre : 4 paragraphes, relue, sans réparation « mobilité » (même ville)", async () => {
    seen.length = 0;
    const lm = await generateLM(profile, offre, "fr");
    expect(lm.body_paragraphs).toHaveLength(4);
    expect(lm.body_paragraphs.every((p) => p.length > 20)).toBe(true);
    expect(lm.object).toContain("chef de projet digital");
    expect(seen.map((s) => s.tool)).toEqual(["build_lm", "return_corrections"]);
  });

  it("offre en Suisse, candidat frontalier : statut dans la lettre, réparation sans déménagement, permis dans le CV", async () => {
    const frontalier = { ...profile, location: "Annemasse, France", work_permit: "g" } as typeof profile;
    const swissOffre = { ...offre, country: "Suisse", location: "Genève" } as typeof offre;

    seen.length = 0;
    const lm = await generateLM(frontalier, swissOffre, "fr");
    const userOf = (tool: string) => {
      const call = seen.find((x) => x.tool === tool)!;
      const msgs = call.body.messages as Array<{ role: string; content: string }>;
      return { user: msgs.find((m) => m.role === "user")!.content, system: msgs.find((m) => m.role === "system")!.content };
    };
    expect(userOf("build_lm").user).toContain("frontalier titulaire d'un permis G");
    expect(userOf("build_lm").user).toContain("Ne parle PAS de déménagement");
    // Genève absent de la lettre scriptée → réparation ciblée, en mode frontalier.
    expect(userOf("return_paragraph").system).toContain("frontalier");
    expect(userOf("return_paragraph").system).toContain("Ne parle PAS de déménagement");
    expect(lm.body_paragraphs[3]).toContain("Genève");

    const cv = await generateCV(frontalier, swissOffre, "fr");
    expect(cv.identity.location).toBe("Lyon, France · Permis G (frontalier)");
  });

  it("offre en France : aucun statut suisse, ni dans la lettre ni dans le CV", async () => {
    const frontalier = { ...profile, work_permit: "g" } as typeof profile;
    seen.length = 0;
    await generateLM(frontalier, offre, "fr");
    const call = seen.find((x) => x.tool === "build_lm")!;
    const user = (call.body.messages as Array<{ role: string; content: string }>).find((m) => m.role === "user")!.content;
    expect(user).not.toContain("Statut de travail en Suisse (fait du profil)");
    const cv = await generateCV(frontalier, offre, "fr");
    expect(cv.identity.location).toBe("Lyon, France");
  });
});
