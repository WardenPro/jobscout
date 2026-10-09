import { expect, it, vi } from "vitest";
import { saveProfile } from "@/lib/db/queries";
import { getDb } from "@/lib/db";
import { profile } from "./fixtures";
import type { Scraper, ScrapeCriteria } from "@/lib/scrapers/base";
const state = vi.hoisted(() => ({ criteria: undefined as ScrapeCriteria | undefined }));
vi.mock("@/lib/scrapers/registry", () => ({ getEnabledScrapers: () => [{ name: "jobup", async *scrape(criteria) {
  state.criteria = criteria;
  for (const location of ["Genève", "Zurich"]) yield { source_id: location, url: `https://example.org/${location}`, title: "Support IT", company: "Test", country: "Suisse", location, contract_type: "CDI", salary: null, description_html: "Description", description_text: "Description", description_status: "ok", posted_at: null, is_vie: false, raw_payload: {} };
} } satisfies Scraper] }));
it("transmet les zones à la source et n'insère pas une annonce hors zone", async () => {
  saveProfile({ ...profile, sources_enabled: ["jobup"], target_countries: ["Suisse"], search_areas: [{ country: "CH", kind: "canton", value: "GE" }] });
  const { runScan } = await import("@/lib/scan/orchestrator");
  for await (const event of runScan(() => {})) void event;
  expect(state.criteria?.search_areas).toEqual([{ country: "CH", kind: "canton", value: "GE" }]);
  expect(getDb().prepare("SELECT location FROM offres").all()).toEqual([{ location: "Genève" }]);
});
