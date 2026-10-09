import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BrowserContext } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { getBrowser, newContext } from "@/lib/scrapers/base";
import { openIndeedDiagnosticBrowser, probeIndeedDetail } from "@/lib/scrapers/indeed-browser";

let context: BrowserContext;
const target = "https://ch.indeed.com/viewjob?jk=0123456789abcdef";
const description = "Vous administrez les systèmes Windows et Linux, assurez la sécurité du réseau, gérez les sauvegardes et accompagnez les utilisateurs de notre équipe informatique à Genève.";
const identity = "<h1>Ingénieur systèmes</h1><div data-testid='inlineHeader-companyName'>Entreprise de test</div><div id='jobLocationText'>Genève</div>";

describe.skipIf(process.env.JOBSCOUT_INDEED_BROWSER !== "1")("Indeed : fixtures Chromium et fiche réelle dans Chrome visible", () => {
  beforeAll(async () => { context = await newContext(); });
  afterAll(async () => {
    await context?.close();
    if (context) await (await getBrowser()).close();
  });

  async function fixture(html: string, status = 200) {
    const page = await context.newPage();
    // Tous les accès sont interceptés : les fixtures ne contactent pas Indeed.
    await page.route("**/*", route => route.fulfill({ status, contentType: "text/html; charset=utf-8", body: html }));
    try { return await probeIndeedDetail(page, target, { navigationTimeoutMs: 2000, contentTimeoutMs: 800 }); }
    finally { await page.close(); }
  }

  it.each(["jobDescriptionText", "new-description"])("attend une description injectée en JavaScript : %s", async name => {
    const element = name === "jobDescriptionText" ? "id='jobDescriptionText'" : "class='simple-job-description-html'";
    const result = await fixture(`${identity}<script>setTimeout(() => { document.body.insertAdjacentHTML('beforeend', ${JSON.stringify(`<div ${element}>${description}</div>`)}); }, 150)</script>`);
    expect(result.status).toBe("ok");
    expect(result.offer?.description_text).toContain("sauvegardes");
    expect(result.offer?.company).toBe("Entreprise de test");
  });

  it("utilise un JobPosting JSON-LD malgré l'absence des sélecteurs", async () => {
    const ld = { "@context": "https://schema.org", "@type": "JobPosting", title: "Ingénieur systèmes", description, hiringOrganization: { name: "Entreprise structurée" }, jobLocation: { address: { addressLocality: "Genève", addressCountry: "CH" } } };
    const result = await fixture(`<script type='application/ld+json'>${JSON.stringify(ld)}</script>`);
    expect(result.status).toBe("ok");
    expect(result.selector).toBe("JobPosting JSON-LD");
    expect(result.offer?.company).toBe("Entreprise structurée");
  });

  it("conserve la description affichée quand le JSON-LD ne contient qu'un extrait", async () => {
    const ld = { "@type": "JobPosting", title: "Ingénieur systèmes", description: "Résumé structuré. ".repeat(8), hiringOrganization: { name: "Entreprise de test" } };
    const result = await fixture(`${identity}<script type='application/ld+json'>${JSON.stringify(ld)}</script><div class='simple-job-description-html'>${description}</div>`);
    expect(result.status).toBe("ok");
    expect(result.offer?.description_text).toBe(description);
  });

  it("signale une structure inconnue sans récupérer toute la page comme description", async () => {
    expect((await fixture(`${identity}<article>${description}</article>`)).status).toBe("missing_description");
  });
  it("n'accepte pas une description masquée comme fiche complète", async () => {
    expect((await fixture(`${identity}<div id='jobDescriptionText' style='display:none'>${description}</div>`)).status).toBe("missing_description");
  });
  it("ne valide pas un extrait trop court", async () => {
    expect((await fixture(`${identity}<div id='jobDescriptionText'>Petit extrait.</div>`)).status).toBe("missing_description");
  });
  it("détecte une protection HTTP 200 et ne la considère pas comme une offre", async () => {
    expect((await fixture("<title>Just a moment...</title><form id='challenge-form'>Verify you are human</form>")).status).toBe("blocked");
  });
  it("détecte une offre expirée", async () => {
    expect((await fixture("<h1>This job is no longer available</h1>")).status).toBe("expired");
  });

  it.skipIf(!process.env.JOBSCOUT_INDEED_URL)("récupère une fiche réelle dans Chrome visible sans proxy ni session utilisateur", async () => {
    const session = await openIndeedDiagnosticBrowser();
    const page = await session.context.newPage();
    const dir = path.join(process.cwd(), "test-results", "indeed-browser");
    fs.mkdirSync(dir, { recursive: true });
    const deadline = setTimeout(() => { void page.close().catch(() => {}); }, 60_000);
    try {
      const result = await probeIndeedDetail(page, process.env.JOBSCOUT_INDEED_URL!);
      const { offer, ...diagnostic } = result;
      fs.writeFileSync(path.join(dir, "result.json"), JSON.stringify({ mode: "chrome-visible", browserVersion: session.browser.version(), ...diagnostic, url: offer?.url, title: offer?.title, company: offer?.company, location: offer?.location, descriptionLength: offer?.description_text.length ?? 0 }, null, 2));
      if (offer) fs.writeFileSync(path.join(dir, "offer.json"), JSON.stringify(offer, null, 2));
      console.info(`[Indeed Chrome visible] ${JSON.stringify(diagnostic)}`);
      await page.screenshot({ path: path.join(dir, "page.png"), timeout: 3000 }).catch(() => {});
      expect(result.status, result.message).toBe("ok");
      expect(offer?.description_status).toBe("ok");
      expect(offer?.description_text.length).toBeGreaterThanOrEqual(100);
      expect(offer?.title).toBeTruthy();
      expect(offer?.company).toBeTruthy();
    } finally {
      clearTimeout(deadline);
      await session.context.close();
      await session.browser.close();
    }
  }, 70_000);
});
