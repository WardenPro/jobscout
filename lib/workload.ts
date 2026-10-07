/**
 * Taux d'activité (« 80 – 100 % », « Pensum 60 % ») — notion centrale du marché
 * suisse, où une offre précise presque toujours le pourcentage d'un plein temps.
 * Client-safe : utilisé par le score, la fiche d'une offre et le profil.
 */
export type Workload = { min: number; max: number };

const PCT = String.raw`(\d{2,3})\s*%`;
const RANGE = new RegExp(String.raw`(\d{2,3})\s*%?\s*(?:-|–|—|à|a|bis|to)\s*${PCT}`, "i");
const SINGLE = new RegExp(PCT, "i");
// Dans la description, un pourcentage n'est un taux d'activité que s'il suit l'un
// de ces mots (« 100 % télétravail », « +20 % de croissance » ne le sont pas).
const CONTEXT = String.raw`(?:taux(?:\s+d'?\s*activit[ée])?|activit[ée]|pensum|arbeitspensum|beschäftigungsgrad|workload|temps\s+(?:de\s+travail|partiel)|part[\s-]time|teilzeit)\s*(?:de|d'|:|von|of)?\s*(?:entre\s+)?`;
const DESC_RANGE = new RegExp(CONTEXT + RANGE.source, "i");
const DESC_SINGLE = new RegExp(CONTEXT + PCT, "i");

function valid(min: number, max: number): Workload | null {
  if (!(min >= 10 && max <= 100 && min <= max)) return null;
  return { min, max };
}

function fromShortText(s: string): Workload | null {
  const r = RANGE.exec(s);
  if (r) return valid(Number(r[1]), Number(r[2]));
  // « 100% remote » dans un titre n'est pas un taux d'activité.
  const one = SINGLE.exec(s);
  if (one && !/^\s*(?:remote|t[ée]l[ée]travail|homeoffice|home\s+office)/i.test(s.slice(one.index + one[0].length))) {
    const n = Number(one[1]);
    return valid(n, n);
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
