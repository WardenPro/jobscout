import { beforeAll, describe, expect, it } from "vitest";
import { setSetting } from "@/lib/db";
import { providerBaseUrlSetting, providerKeySetting, providerModelsSetting } from "@/lib/ai/client";
import { PROVIDERS, isProviderId } from "@/lib/ai/providers";
import { generateCV } from "@/lib/ai/generate-cv";
import { generateLM } from "@/lib/ai/generate-lm";
import { offre, profile } from "../fixtures";

/**
 * Test RÉEL, facultatif et payant (quelques centimes) : génère un CV et une
 * lettre avec VOTRE fournisseur, sur un profil fictif. Ne tourne que si
 * JOBSCOUT_LIVE=1 (voir vitest.config.mts).
 *
 *   JOBSCOUT_LIVE=1 JOBSCOUT_LIVE_PROVIDER=openai JOBSCOUT_LIVE_KEY=sk-... npx vitest run tests/live
 *
 * Variables : JOBSCOUT_LIVE_PROVIDER (anthropic, openai, gemini, mistral,
 * deepseek, groq, openrouter, ollama, lmstudio, custom), JOBSCOUT_LIVE_KEY,
 * JOBSCOUT_LIVE_BASE_URL (serveurs locaux / autre), JOBSCOUT_LIVE_MODEL_WRITER,
 * JOBSCOUT_LIVE_MODEL_REVIEWER.
 */

const provider = process.env.JOBSCOUT_LIVE_PROVIDER ?? "anthropic";

beforeAll(() => {
  if (!isProviderId(provider)) throw new Error(`Fournisseur inconnu : ${provider}`);
  const preset = PROVIDERS[provider];
  setSetting("llm:mode", "byok");
  setSetting("llm:provider", provider);
  if (process.env.JOBSCOUT_LIVE_KEY) setSetting(providerKeySetting(provider), process.env.JOBSCOUT_LIVE_KEY);
  if (process.env.JOBSCOUT_LIVE_BASE_URL) setSetting(providerBaseUrlSetting(provider), process.env.JOBSCOUT_LIVE_BASE_URL);
  const writer = process.env.JOBSCOUT_LIVE_MODEL_WRITER || preset.models.writer;
  const reviewer = process.env.JOBSCOUT_LIVE_MODEL_REVIEWER || preset.models.reviewer || writer;
  setSetting(providerModelsSetting(provider), JSON.stringify({ writer, reviewer }));
});

describe(`génération réelle avec ${provider}`, () => {
  it("CV fidèle au profil", { timeout: 600_000 }, async () => {
    const cv = await generateCV(profile, offre, "fr");
    console.log(JSON.stringify(cv, null, 2));
    expect(cv.sections.experiences.length).toBeGreaterThanOrEqual(1);
    const allowed = new Set(["Studio Nova", null, ""]);
    for (const e of cv.sections.experiences) expect(allowed.has(e.company)).toBe(true);
    expect(cv.summary.length).toBeGreaterThan(40);
  });

  it("lettre de 4 paragraphes", { timeout: 600_000 }, async () => {
    const lm = await generateLM(profile, offre, "fr");
    console.log(JSON.stringify(lm, null, 2));
    expect(lm.body_paragraphs.filter((p) => p.trim().length > 40)).toHaveLength(4);
    expect(lm.object.length).toBeGreaterThan(5);
  });
});
