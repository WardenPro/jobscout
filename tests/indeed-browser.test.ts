import { expect, it, vi } from "vitest";
import type { Page } from "playwright";
import { probeIndeedDetail } from "@/lib/scrapers/indeed-browser";

const url = "https://ch.indeed.com/viewjob?jk=0123456789abcdef";
function fakePage(status = 200, state: object = { state: "waiting" }) {
  return {
    goto: vi.fn(async () => ({ status: () => status })),
    url: vi.fn(() => url),
    waitForFunction: vi.fn(async () => ({ jsonValue: async () => state, dispose: vi.fn() })),
    content: vi.fn(async () => ""),
  };
}

it.each([401, 403, 429])("arrête au HTTP %s sans lire la description ni réessayer", async status => {
  const page = fakePage(status);
  expect((await probeIndeedDetail(page as unknown as Page, url)).status).toBe("blocked");
  expect(page.goto).toHaveBeenCalledTimes(1);
  expect(page.waitForFunction).not.toHaveBeenCalled();
});
it.each([404, 410])("classe une fiche HTTP %s comme retirée", async status => {
  expect((await probeIndeedDetail(fakePage(status) as unknown as Page, url)).status).toBe("expired");
});
it.each(["http://ch.indeed.com/viewjob?jk=0123456789abcdef", "https://example.org/viewjob?jk=0123456789abcdef", "https://ch.indeed.com/jobs?jk=0123456789abcdef", "https://ch.indeed.com/viewjob?jk=incorrect"]) ("refuse une URL hors périmètre avant navigation : %s", async input => {
  const page = fakePage();
  await expect(probeIndeedDetail(page as unknown as Page, input)).rejects.toThrow();
  expect(page.goto).not.toHaveBeenCalled();
});
it("signale un délai de navigation dépassé sans exposer le message distant", async () => {
  const page = fakePage();
  page.goto.mockRejectedValue(Object.assign(new Error("message distant sensible"), { name: "TimeoutError" }));
  const result = await probeIndeedDetail(page as unknown as Page, url);
  expect(result.status).toBe("timeout");
  expect(JSON.stringify(result)).not.toContain("message distant sensible");
});
it("refuse une redirection vers une page différente", async () => {
  const page = fakePage();
  page.url.mockReturnValue("https://ch.indeed.com/jobs");
  expect((await probeIndeedDetail(page as unknown as Page, url)).status).toBe("navigation_error");
});
it.each([500, 502])("distingue une panne HTTP %s d'un blocage anti-bot", async status => {
  expect((await probeIndeedDetail(fakePage(status) as unknown as Page, url)).status).toBe("http_error");
});
