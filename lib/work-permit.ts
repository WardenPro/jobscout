/**
 * Statut de travail en Suisse (profil) — client-safe.
 *
 * Pour un candidat français, c'est souvent la première question du recruteur
 * suisse : peut-il travailler ici, et vient-il de l'autre côté de la frontière ?
 * Le statut est repris dans la lettre et dans l'en-tête du CV, et seulement pour
 * une offre en Suisse.
 */
export const WORK_PERMITS = ["citizen", "c", "b", "g", "eu_g", "eu_b"] as const;
export type WorkPermit = (typeof WORK_PERMITS)[number];

export const WORK_PERMIT_LABELS: Record<WorkPermit, string> = {
  citizen: "Nationalité suisse",
  c: "Permis C (établissement)",
  b: "Permis B (séjour)",
  g: "Permis G (frontalier)",
  eu_g: "Frontalier UE/AELE, permis G à obtenir",
  eu_b: "Ressortissant UE/AELE, prêt à s'installer en Suisse",
};

/** Mention de l'en-tête du CV. Rien pour « à obtenir » : pas un titre à afficher. */
const CV_MENTION: Record<WorkPermit, { fr: string; en: string } | null> = {
  citizen: { fr: "Nationalité suisse", en: "Swiss citizen" },
  c: { fr: "Permis C", en: "C permit" },
  b: { fr: "Permis B", en: "B permit" },
  g: { fr: "Permis G (frontalier)", en: "G permit (cross-border)" },
  eu_g: null,
  eu_b: null,
};

/** Le candidat vit hors de Suisse et fera l'aller-retour : pas de « déménagement ». */
export function isCrossBorder(p: WorkPermit | null | undefined): boolean {
  return p === "g" || p === "eu_g";
}

export function isSwissOffer(country: string | null | undefined): boolean {
  const c = (country ?? "").trim().toLowerCase();
  return c === "suisse" || c === "switzerland" || c === "ch";
}

export function cvPermitMention(p: WorkPermit | null | undefined, lang: "fr" | "en"): string | null {
  return p ? CV_MENTION[p]?.[lang] ?? null : null;
}

/**
 * Consigne pour la lettre (offre en Suisse uniquement). Le fait vient du profil :
 * le modèle a le droit de le citer, et doit le faire une fois, au §4.
 */
export function letterPermitInstruction(p: WorkPermit | null | undefined): string | null {
  if (!p) return null;
  const facts: Record<WorkPermit, string> = {
    citizen: "de nationalité suisse : aucune autorisation de travail n'est nécessaire",
    c: "titulaire d'un permis C : il peut travailler en Suisse sans démarche",
    b: "titulaire d'un permis B : il peut travailler en Suisse",
    g: "frontalier titulaire d'un permis G : il réside en France et se rend chaque jour sur son lieu de travail en Suisse",
    eu_g: "ressortissant de l'UE/AELE résidant en France : il travaillera en frontalier, le permis G s'obtient sur simple contrat de travail",
    eu_b: "ressortissant de l'UE/AELE prêt à s'installer en Suisse : le permis B s'obtient sur simple contrat de travail",
  };
  const mobility = isCrossBorder(p)
    ? "Ne parle PAS de déménagement ni de relocalisation : le candidat fait l'aller-retour depuis la France."
    : "";
  return `## Statut de travail en Suisse (fait du profil)\nLe candidat est ${facts[p]}. Mentionne-le en une phrase dans le §4 (disponibilité). ${mobility}`.trim();
}
