import { expect, it, vi } from "vitest";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { normalizePhoto } from "@/lib/cv/photo";
import { ProfileFullSchema } from "@/lib/cv/types";
import { saveProfile, getProfile } from "@/lib/db/queries";
import { profile, offre } from "./fixtures";
import { renderCVDocx } from "@/lib/docx/render";
import { fitCVToOnePage } from "@/lib/pdf/render";

vi.mock("@/lib/ai/llm", () => ({ callStructured: vi.fn() }));
vi.mock("@/lib/ai/proofread", () => ({ proofreadCV: vi.fn(async (cv) => cv), translateToEnglish: vi.fn() }));
import { callStructured } from "@/lib/ai/llm";
import { generateCV } from "@/lib/ai/generate-cv";

it("normalise la photo, conserve celle du profil et l'intègre aux deux formats sans l'envoyer à l'IA", async () => {
  const png = await sharp({ create: { width: 300, height: 400, channels: 3, background: "#b9c9d8" } }).png().toBuffer();
  const photo = await normalizePhoto(png);
  const meta = await sharp(Buffer.from(photo.split(",")[1], "base64")).metadata();
  expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 480, 600]);
  const withPhoto = ProfileFullSchema.parse({ ...profile, photo });
  saveProfile(withPhoto);
  expect(getProfile()?.photo).toBe(photo);
  saveProfile({ ...withPhoto, summary: "Profil mis à jour" });
  expect(getProfile()?.photo).toBe(photo);
  const generated = {
    identity: { full_name: "Camille Martin", email: "camille.martin@example.org", phone: "+33 6 12 34 56 78", location: "Lyon, France", linkedin_url: null, portfolio_url: null },
    summary: "Cheffe de projet digital, cinq ans d'expérience en pilotage de sites web et coordination d'équipes.",
    sections: {
      experiences: [{ title: "Cheffe de projet digital", company: "Studio Nova", location: "Lyon", start_date: "01/2021", end_date: null, bullet_points: ["Pilotage de 3 refontes de sites e-commerce", "Coordination d'une équipe de 5 personnes"] }],
      educations: [{ school: "Université de Lyon", degree: "Master Management", field: null, start_date: "2016", end_date: "2018", bullet_points: [] }],
      skills_flat: ["Gestion de projet", "SQL"], languages: [{ name: "Anglais", level: "C1" }], projects: [],
    },
  };
  vi.mocked(callStructured).mockResolvedValue({ input: generated, truncated: false, provider: "openrouter", model: "test" });
  const cv = await generateCV(withPhoto, offre, "fr");
  expect(cv.photo).toBe(photo);
  expect(JSON.stringify(vi.mocked(callStructured).mock.calls)).not.toContain("data:image");
  const { pdf, cv: fitted } = await fitCVToOnePage(cv);
  const docx = await renderCVDocx(fitted);
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  expect(docx.subarray(0, 2).toString()).toBe("PK");
  if (process.env.JOBSCOUT_PHOTO_QA_DIR) {
    fs.mkdirSync(process.env.JOBSCOUT_PHOTO_QA_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.JOBSCOUT_PHOTO_QA_DIR, "cv-photo.pdf"), pdf);
    fs.writeFileSync(path.join(process.env.JOBSCOUT_PHOTO_QA_DIR, "cv-photo.docx"), docx);
  }
  saveProfile({ ...withPhoto, photo: null });
  expect(getProfile()?.photo).toBeNull();
});

it("refuse les faux fichiers et les photos trop volumineuses", async () => {
  await expect(normalizePhoto(Buffer.from("faux jpeg"))).rejects.toThrow();
  await expect(normalizePhoto(Buffer.alloc(5 * 1024 * 1024 + 1))).rejects.toThrow();
  expect(ProfileFullSchema.safeParse({ ...profile, photo: "https://example.org/photo.jpg" }).success).toBe(false);
});
