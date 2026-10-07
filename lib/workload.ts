/**
 * Taux d'activité (« 80 – 100 % », « Pensum 60 % ») — notion centrale du marché
 * suisse, où une offre précise presque toujours le pourcentage d'un plein temps.
 * Client-safe : utilisé par le score, la fiche d'une offre et le profil.
 */
import { z } from "zod";

export const WorkloadRangeSchema = z
  .tuple([z.number().int().min(10).max(100), z.number().int().min(10).max(100)])
  .refine(([min, max]) => min <= max, "Taux d'activité : le minimum dépasse le maximum");

export type Workload = { min: number; max: number };

const PCT = String.raw`(?<!\d)(\d{2,3})\s*%`;
const RANGE = new RegExp(String.raw`(?<!\d)(\d{2,3})\s*%?\s*(?:-|–|—|à|a|bis|to)\s*${PCT}`, "i");
const RATE = new RegExp(`${RANGE.source}|${PCT}`, "gi");
const REMOTE = String.raw`(?:remote|t[ée]l[ée]travail|homeoffice|home\s+office)`;
const REMOTE_BEFORE = new RegExp(`${REMOTE}\\s*[:·-]?\\s*$`, "i");
const REMOTE_AFTER = new RegExp(`^\\s*(?:(?:en|in|im|de)\\s+)?${REMOTE}\\b`, "i");
// Dans la description, un pourcentage n'est un taux d'activité que s'il suit l'un
// de ces mots (« 100 % télétravail », « +20 % de croissance » ne le sont pas).
const CONTEXT = String.raw`(?:taux(?:\s+d'?\s*activit[ée])?|activit[ée]|pensum|arbeitspensum|beschäftigungsgrad|workload|temps\s+(?:de\s+travail|partiel)|part[\s-]time|teilzeit)\s*(?:de|d'|:|von|of)?\s*(?:entre\s+)?`;
const DESC_RANGE = new RegExp(CONTEXT + RANGE.source, "i");
const DESC_SINGLE = new RegExp(CONTEXT + PCT, "i");

function valid(min: number, max: number): Workload | null {
  const parsed = WorkloadRangeSchema.safeParse([min, max]);
  return parsed.success ? { min, max } : null;
}

function fromShortText(s: string): Workload | null {
  // Examine les deux côtés et continue après un pourcentage de télétravail :
  // « Remote 100 %, Pensum 60 % » contient aussi un vrai taux d'activité.
  for (const match of s.matchAll(RATE)) {
    const before = s.slice(0, match.index);
    const after = s.slice(match.index + match[0].length);
    if (REMOTE_BEFORE.test(before) || REMOTE_AFTER.test(after)) continue;
    const min = Number(match[1] ?? match[3]);
    return valid(min, Number(match[2] ?? min));
  }
  return null;
}

/** Taux d'activité de l'offre : contrat et titre d'abord, puis description avec mot-clé. */
export function extractWorkload(o: {
  contract_type?: string | null;
  title?: string | null;
  description_text?: string | null;
}): Workload | null {
  for (const s of [o.contract_type, o.title]) {
    const w = s ? fromShortText(s) : null;
    if (w) return w;
  }
  const d = (o.description_text ?? "").slice(0, 3000);
  const r = DESC_RANGE.exec(d);
  if (r) return valid(Number(r[1]), Number(r[2]));
  const one = DESC_SINGLE.exec(d);
  if (one) return valid(Number(one[1]), Number(one[1]));
  return null;
}

export function formatWorkload(w: Workload): string {
  return w.min === w.max ? `${w.max} %` : `${w.min} – ${w.max} %`;
}

/** Retire le taux d'activité d'un libellé de contrat (« Durée indéterminée · 80 – 100 % »). */
export function stripWorkload(label: string): string {
  return label.replace(/\s*·?\s*\d{2,3}\s*%?\s*(?:[-–—]\s*\d{2,3}\s*)?%\s*$/, "").trim();
}
