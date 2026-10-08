/** Recherche publique suisse, partagée par le scan et le lien dans l'interface. */
export function indeedSearchUrl(keywords = "", location = "Suisse", start = 0): string {
  const params = new URLSearchParams({ q: keywords.trim(), l: location.trim() || "Suisse", hl: "fr" });
  if (start > 0) params.set("start", String(start));
  return `https://ch.indeed.com/jobs?${params}`;
}
