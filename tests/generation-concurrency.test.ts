import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/queries", () => ({ getProfile: () => ({ full_name: "Test" }) }));
vi.mock("@/lib/db/offres", () => ({ getOffre: () => ({ id: 136, company: "Test", title: "Test", description_text: "Test", source: "jobs_ch", country: "Suisse" }) }));
vi.mock("@/lib/ai/generate-cv", () => ({ generateCV: vi.fn() }));
vi.mock("@/lib/ai/generate-lm", () => ({ generateLM: vi.fn() }));
vi.mock("@/lib/db/documents", () => ({ offreFolderPath: () => "test", saveDocument: vi.fn() }));

import { POST } from "@/app/api/generate/all/route";
import { generateCV } from "@/lib/ai/generate-cv";
import { generateLM } from "@/lib/ai/generate-lm";
import { AiContentError } from "@/lib/ai/errors";

const request = () => new NextRequest("http://localhost/api/generate/all", { method: "POST", body: JSON.stringify({ offreId: 136 }) });

it("refuse une génération concurrente avant tout appel IA et libère le verrou après un échec", async () => {
  let fail!: (reason: unknown) => void;
  const pending = new Promise<never>((_, reject) => { fail = reject; });
  vi.mocked(generateCV).mockReturnValue(pending);
  vi.mocked(generateLM).mockReturnValue(pending);
  const first = POST(request());
  await vi.waitFor(() => expect(generateCV).toHaveBeenCalledTimes(1));
  const second = await POST(request());
  expect(second.status).toBe(409);
  expect(generateCV).toHaveBeenCalledTimes(1);
  expect(generateLM).toHaveBeenCalledTimes(1);
  fail(new AiContentError("Échec simulé"));
  await first;
  await POST(request());
  expect(generateCV).toHaveBeenCalledTimes(2);
});
