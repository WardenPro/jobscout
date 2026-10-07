import { detectVie } from "./vie";

export type ContractCategory = "cdi" | "cdd" | "vie" | "stage" | "alternance" | "autre";

export const CONTRACT_LABELS: Record<ContractCategory, string> = {
  cdi: "CDI",
  cdd: "CDD",
  vie: "V.I.E",
  stage: "Stage",
  alternance: "Alternance",
  autre: "Autre",
};

export const CONTRACT_ORDER: ContractCategory[] = ["cdi", "cdd", "vie", "stage", "alternance", "autre"];

function strip(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function classifyContract(input: {
  contract_type: string | null;
  title: string;
  description_text: string;
  is_vie?: number | boolean; // legacy, ignored — we re-detect on the fly
  source?: string | null;
  url?: string | null;
}): ContractCategory {
  // 1. V.I.E with strict detection (re-evaluated, ignores any stale is_vie flag).
  //    We check this BEFORE alternance/stage so "V.I.E Marketing" is V.I.E, not "stage".
  if (
    detectVie({
      source: input.source ?? "",
      title: input.title,
      description: input.description_text,
      url: input.url,
    })
  ) {
    return "vie";
  }

  // Le contrat explicite de la source prime sur les prérequis de la description.
  const stated = classifyText(strip(input.contract_type));
  if (stated) return stated;
  const inferred = classifyText(`${strip(input.title)} ${strip(input.description_text).slice(0, 1500)}`);
  if (inferred) return inferred;

  // Les libellés FULL_TIME / PART_TIME ne donnent pas la nature du contrat :
  // ils restent un recours après les indications du titre et de la description.
  const ct = strip(input.contract_type);
  if (ct.includes("intern")) return "stage";
  if (ct.includes("temporary") || ct.includes("contractor")) return "cdd";
  if (ct.includes("full_time") || ct.includes("part_time") || ct.includes("full time") || ct.includes("part time")) {
    return "cdi";
  }
  return "autre";
}

function classifyText(text: string): ContractCategory | null {
  // Une négation explicite allemande n'est pas un contrat à durée déterminée.
  const haystack = text.replace(/\b(?:nicht|nie)\s+befristet\w*\b/g, "unbefristet");

  // 2. Alternance / apprentissage (very specific keywords)
  //    Suisse alémanique : Lehrstelle. Pas « Lehre » seul : « abgeschlossene Lehre » est un prérequis.
  //    « capacité d'apprentissage » (qualité demandée) n'est pas un contrat d'apprentissage.
  if (
    /\b(alternance|alternant|(?<!(?:capacite|capacites|facilite|aptitude|aptitudes|courbe|soif|gout|sens)\s+d.)apprentissage|apprenti|contrat\s+pro|professionnalisation|lehrstelle)\b/.test(
      haystack
    )
  ) {
    return "alternance";
  }
  // 3. Stage / internship
  if (/\b(stage|stagiaire|internship|intern|praktikum|praktikant(?:in)?)\b/.test(haystack)) {
    return "stage";
  }
  // 4. CDD
  //    Suisse : « Durée déterminée » (jobup.ch, jobs.ch), befristet, temporär.
  if (/\bcdd\b|\bfixed[\s-]term\b|\btemporary\b|\btemporaire\b|\b(?:contrat\s+a\s+)?duree\s+determinee\b|\bbefristet|\btemporar\b/.test(haystack)) {
    return "cdd";
  }
  // 5. CDI
  //    Suisse : « Durée indéterminée », « engagement fixe », unbefristet, Festanstellung.
  if (/\bcdi\b|\bpermanent\b|\b(?:contrat\s+a\s+)?duree\s+indeterminee\b|\bengagement\s+fixe\b|\bunbefristet|\bfestanstellung\b/.test(haystack)) {
    return "cdi";
  }

  return null;
}
