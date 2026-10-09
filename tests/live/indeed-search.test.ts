import { expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { indeedSearchUrl } from "@/lib/indeed";
import { parseIndeedSearch } from "@/lib/scrapers/indeed";
import { indeedScraper } from "@/lib/scrapers/indeed";
import type { ScrapedOffre, ProgressEvent } from "@/lib/scrapers/base";
import { openIndeedDiagnosticBrowser, probeIndeedDetail } from "@/lib/scrapers/indeed-browser";

it.skipIf(process.env.JOBSCOUT_INDEED_SEARCH !== "1")("recherche directe Indeed puis fiche dans Chrome visible", async () => {
  const directory = path.join(process.cwd(), "test-results", "indeed-search");
  fs.mkdirSync(directory, { recursive: true });
  const url = indeedSearchUrl("informatique", "Suisse");
  // fetch natif direct : aucun appel à sourceFetch ou à l'API Bright Data.
  const response = await fetch(url, {
    headers: { "user-agent": "JobScout/3.4 (+https://github.com/WardenPro/jobscout)", accept: "text/html", "accept-language": "fr-CH,fr;q=0.9" },
    signal: AbortSignal.timeout(15000), redirect: "error",
  });
  const html = await response.text();
  fs.writeFileSync(path.join(directory, "direct-search.html"), html);
  let listing: ReturnType<typeof parseIndeedSearch> | undefined;
  let parseError: string | undefined;
  if (response.ok) {
    try { listing = parseIndeedSearch(html); } catch (error) { parseError = error instanceof Error ? error.message : "Résultats non reconnus"; }
  }
  const report = { url, transport: "direct-fetch", httpStatus: response.status, title: /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1], cards: listing?.cards.length ?? 0, hasNext: listing?.hasNext, parseError };
  fs.writeFileSync(path.join(directory, "direct-search.json"), JSON.stringify(report, null, 2));
  console.info(JSON.stringify(report));
  expect(response.ok, `Recherche directe : HTTP ${response.status}`).toBe(true);
  expect(listing?.cards.length, parseError).toBeGreaterThan(0);
  const session = await openIndeedDiagnosticBrowser();
  try {
    const page = await session.context.newPage();
    const card = listing!.cards[0];
    const detail = await probeIndeedDetail(page, card.url);
    fs.writeFileSync(path.join(directory, "hybrid-result.json"), JSON.stringify({ search: report, detail: { status: detail.status, httpStatus: detail.httpStatus, url: card.url, title: detail.offer?.title, company: detail.offer?.company, descriptionLength: detail.offer?.description_text.length ?? 0 } }, null, 2));
    expect(detail.status, detail.message).toBe("ok");
  } finally { await session.context.close(); await session.browser.close(); }
}, 110000);

it.skipIf(process.env.JOBSCOUT_INDEED_SCAN !== "1")("scan Indeed réel : conserve une carte même si la fiche est bloquée", async () => {
  const offers: ScrapedOffre[] = [];
  const events: ProgressEvent[] = [];
  for await (const offer of indeedScraper.scrape({ countries: ["Suisse"], sectors: ["informatique"], maxOffres: 1 }, event => events.push(event))) offers.push(offer);
  const report = { offers: offers.map(offer => ({ title: offer.title, company: offer.company, url: offer.url, status: offer.description_status, descriptionLength: offer.description_text.length, error: offer.scrape_errors })), events };
  const directory = path.join(process.cwd(), "test-results", "indeed-search");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "scan-result.json"), JSON.stringify(report, null, 2));
  console.info(JSON.stringify(report));
  expect(offers).toHaveLength(1);
  expect(offers[0].title).toBeTruthy();
  expect(offers[0].company).toBeTruthy();
  expect(events.at(-1)).toMatchObject({ kind: "done", seen: 1 });
  if (offers[0].description_status !== "ok") expect(offers[0].scrape_errors).toBeTruthy();
}, 110000);

it.skipIf(process.env.JOBSCOUT_INDEED_SEARCH_BROWSER !== "1")("recherche et fiche dans Chrome visible sans proxy", async () => {
  const directory = path.join(process.cwd(), "test-results", "indeed-search");
  fs.mkdirSync(directory, { recursive: true });
  const session = await openIndeedDiagnosticBrowser();
  try {
    const page = await session.context.newPage();
    const url = indeedSearchUrl("informatique", "Suisse");
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector("a[data-jk], h2 a[href*='jk='], h3 a[href*='jk=']", { timeout: 15000 }).catch(() => undefined);
    const html = await page.content();
    fs.writeFileSync(path.join(directory, "browser-search.html"), html);
    await page.screenshot({ path: path.join(directory, "browser-search.png") });
    let listing: ReturnType<typeof parseIndeedSearch> | undefined;
    let parseError: string | undefined;
    try { listing = parseIndeedSearch(html); } catch (error) { parseError = error instanceof Error ? error.message : "Résultats non reconnus"; }
    const report = { url, transport: "chrome-visible-no-proxy", httpStatus: response?.status(), title: await page.title(), cards: listing?.cards.length ?? 0, hasNext: listing?.hasNext, parseError };
    fs.writeFileSync(path.join(directory, "browser-search.json"), JSON.stringify(report, null, 2));
    console.info(JSON.stringify(report));
    expect(response?.ok(), `Recherche Chrome : HTTP ${response?.status()}`).toBe(true);
    expect(listing?.cards.length, parseError).toBeGreaterThan(0);
    const card = listing!.cards[0];
    const detailPage = await session.context.newPage();
    const detail = await probeIndeedDetail(detailPage, card.url);
    const detailReport = { status: detail.status, httpStatus: detail.httpStatus, url: card.url, title: detail.offer?.title, company: detail.offer?.company, descriptionLength: detail.offer?.description_text.length ?? 0, message: detail.message };
    fs.writeFileSync(path.join(directory, "browser-chain.json"), JSON.stringify({ search: report, detail: detailReport }, null, 2));
    console.info(JSON.stringify(detailReport));
    expect(detail.status, detail.message).toBe("ok");
  } finally { await session.context.close(); await session.browser.close(); }
}, 110000);
