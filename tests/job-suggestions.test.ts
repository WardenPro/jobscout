import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ProfileFullSchema } from "@/lib/cv/types";
import { saveProfile, getProfile } from "@/lib/db/queries";
import { getDb } from "@/lib/db";
import { buildProfileFromExtraction } from "@/lib/cv/validate";
import { extractCV } from "@/lib/cv/extract-semantic";
import { POST } from "@/app/api/profile/job-suggestions/route";
import { callStructured } from "@/lib/ai/llm";
vi.mock("@/lib/ai/llm", () => ({ callStructured: vi.fn() }));
const suggestions = [{ title: "Administrateur systèmes", reason: "Administration Windows Server et Linux dans les expériences." }];
const profile = ProfileFullSchema.parse({ summary: "Administration de systèmes Windows et Linux", sectors: ["Support IT"] });
beforeEach(() => { vi.mocked(callStructured).mockReset(); });
const request = (body: unknown) => new NextRequest("http://localhost/api/profile/job-suggestions", { method: "POST", body: JSON.stringify(body) });

it("propose des métiers dans l'appel d'extraction, les conserve sans sélectionner les cibles", async () => {
  vi.mocked(callStructured).mockResolvedValue({ input: { identity: { full_name: null, email: null, phone: null, location: null, linkedin_url: null, portfolio_url: null }, summary: profile.summary, experiences: [], educations: [], skills: [], languages: [], certifications: [], job_suggestions: suggestions }, truncated: false, provider: "openrouter", model: "test" });
  const extracted = await extractCV("Expérience en administration de serveurs Windows et Linux.");
  const imported = buildProfileFromExtraction(extracted, "CV source");
  expect(callStructured).toHaveBeenCalledTimes(1);
  expect(imported.job_suggestions).toEqual(suggestions);
  expect(imported.sectors).toEqual([]);
  saveProfile({ ...imported, sectors: ["Support IT"] });
  expect(getProfile()?.job_suggestions).toEqual(suggestions);
  expect(getProfile()?.sectors).toEqual(["Support IT"]);
});

it("analyse un profil existant, dédoublonne les idées et laisse les données enregistrées intactes", async () => {
  saveProfile(profile);
  vi.mocked(callStructured).mockResolvedValue({ input: { suggestions: [...suggestions, { ...suggestions[0], title: "administrateur systèmes" }] }, truncated: false, provider: "openrouter", model: "test" });
  const response = await POST(request({ ...profile, email: "private@example.test", raw_cv_text: "Texte privé", photo: null }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ suggestions });
  expect(getProfile()?.sectors).toEqual(["Support IT"]);
  expect(JSON.stringify(vi.mocked(callStructured).mock.calls)).not.toContain("private@example.test");
  expect(JSON.stringify(vi.mocked(callStructured).mock.calls)).not.toContain("Texte privé");
});

it("refuse un profil vide avant de contacter l'IA", async () => {
  expect((await POST(request({}))).status).toBe(400);
  expect(callStructured).not.toHaveBeenCalled();
});

it("signale une réponse tronquée sans retourner de suggestions partielles", async () => {
  vi.mocked(callStructured).mockResolvedValue({ input: { suggestions }, truncated: true, provider: "openrouter", model: "test" });
  const response = await POST(request(profile));
  expect(response.status).not.toBe(200);
  expect((await response.json()).error).toBeTruthy();
});

it("rejette les suggestions mal formées", async () => {
  vi.mocked(callStructured).mockResolvedValue({ input: { suggestions: [{ title: "Poste" }] }, truncated: false, provider: "openrouter", model: "test" });
  expect((await POST(request(profile))).status).not.toBe(200);
});

it("migre une ancienne base sans changer les cibles ni le parcours", async () => {
  saveProfile(profile);
  const db = getDb();
  db.exec("ALTER TABLE profile DROP COLUMN job_suggestions");
  db.close();
  vi.resetModules();
  const migrated = await import("@/lib/db/queries");
  expect(migrated.getProfile()).toMatchObject({ summary: profile.summary, sectors: ["Support IT"], job_suggestions: [] });
});
