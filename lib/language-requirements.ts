/** Exigences explicites de l'annonce, distinctes de sa langue de rédaction. Client-safe. */
export const LANGUAGE_LABELS = { fr: "Français", de: "Allemand", en: "Anglais", it: "Italien" } as const;
export type JobLanguage = keyof typeof LANGUAGE_LABELS;
export type LanguageRequirement = {
  languages: JobLanguage[];
  importance: "required" | "preferred";
  level: string | null;
  evidence: string;
};
export type LanguageCheck = LanguageRequirement & {
  status: "compatible" | "gap" | "unknown";
  profileLevels: string[];
};
export type LanguageAssessment = { textLanguage: JobLanguage | null; checks: LanguageCheck[] };

const ALIASES: Record<JobLanguage, string> = {
  fr: "francais|francaise|franzosisch(?:kenntnisse)?|french|francese",
  de: "allemand|allemande|deutsch(?:kenntnisse)?|german|tedesco",
  en: "anglais|anglaise|englisch(?:kenntnisse)?|english|inglese",
  it: "italien|italienne|italienisch(?:kenntnisse)?|italian|italiano",
};
const NAMES = new RegExp(`\\b(?:${Object.values(ALIASES).join("|")})\\b`, "g");
const REQUIRED = /\b(?:obligatoire|exige\w*|indispensable|imperatif|requis\w*|required|mandatory|essential|must|voraussetzung|erforderlich|zwingend|maitris\w*|parlez|parler|speak|speaking|sprechen|(?:deutsch|franzosisch|englisch|italienisch)?kenntnisse|connaissances|niveau|level|courant\w*|fluent\w*|fliessend\w*|verhandlungssicher|professionnel\w*|professional|business|suffisant\w*|sufficient|native|natif|maternelle|muttersprache|bilingue|bilingual|b[12]|c[12]|a[12])\b/;
const PREFERRED = /\b(?:atout|souhaite\w*|apprecie\w*|idealement|prefer\w*|desirable|advantage|plus|asset|facultatif|optional|wunschenswert|von vorteil|idealerweise)\b/;
const NEGATED = /(?:\b(?:pas|non|not|nicht|keine?)\s+(?:(?:de|d['’]|necessarily|unbedingt)\s*)?(?:necessaire\w*|exige\w*|requis\w*|obligatoire\w*|imperatif\w*|indispensable|connaissances|required|mandatory|essential|erforderlich|notwendig|kenntnisse)|\b(?:aucune?|no)\s+(?:exigence|requirement)|\bnicht\s+zwingend|\b(?:exige\w*|requier\w*)\s+pas\b)/;
const OR = /^\s*(?:ou|or|oder|oppure|\/)\s*(?:(?:de|du|en|in)\s+|[dl]['’])*\s*$/;
const ALTERNATIVE_QUALIFIERS = /\b(?:[abc][12]|courant\w*|fluent\w*|fliessend\w*|professionnel\w*|professional|business|niveau|level)\b/g;
const AND = /^\s*(?:et|and|und|,)\s*(?:(?:de|du|en|in)\s+|[dl]['’])*\s*$/;
const TEXT_WORDS: Record<JobLanguage, RegExp> = {
  fr: /\b(?:vous|nous|votre|avec|pour|dans|missions|entreprise|poste|recherchons)\b/g,
  de: /\b(?:sie|wir|ihre|und|mit|fur|aufgaben|unternehmen|erfahrung|kenntnisse)\b/g,
  en: /\b(?:you|your|we|our|the|and|with|skills|company|requirements)\b/g,
  it: /\b(?:voi|nostro|con|per|azienda|competenze|esperienza|richiesto|della|lavoro)\b/g,
};

function fold(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/ß/g, "ss");
}

function languageOf(word: string): JobLanguage {
  return (Object.keys(ALIASES) as JobLanguage[]).find(l => new RegExp(`^(?:${ALIASES[l]})$`).test(word))!;
}

export function detectTextLanguage(text: string): JobLanguage | null {
  const folded = fold(text);
  const votes = (Object.keys(TEXT_WORDS) as JobLanguage[])
    .map(language => ({ language, count: (folded.match(TEXT_WORDS[language]) ?? []).length }))
    .sort((a, b) => b.count - a.count);
  return votes[0].count >= 3 && votes[0].count > votes[1].count * 1.3 ? votes[0].language : null;
}

function requiredLevel(text: string): string | null {
  const cefr = /\b([abc][12])\b/.exec(text);
  if (cefr) return cefr[1].toUpperCase();
  if (/\b(?:native|natif|maternelle|muttersprache)\b/.test(text)) return "Natif";
  if (/\b(?:courant\w*|fluent\w*|fliessend\w*|verhandlungssicher|bilingue|bilingual)\b/.test(text)) return "Courant";
  if (/\b(?:professionnel\w*|professional|business)\b/.test(text)) return "Professionnel";
  if (/\b(?:bases|basic|grundkenntnisse|notions)\b/.test(text)) return "Notions";
  return null;
}

/** Détection conservatrice : une langue citée sans demande explicite n'est pas une exigence. */
export function extractLanguageRequirements(description: string): LanguageRequirement[] {
  const requirements: LanguageRequirement[] = [];
  for (const evidence of description.split(/[.!?;\n]+/).map(s => s.trim()).filter(Boolean)) {
    const sentence = fold(evidence);
    const names = [...sentence.matchAll(NAMES)];
    if (!names.length) continue;
    // « français ou allemand obligatoire » : une alternative, pas deux obligations.
    const isAlternative = names.length > 1 && names.slice(1).every((m, i) =>
      OR.test(sentence.slice(names[i].index! + names[i][0].length, m.index).replace(ALTERNATIVE_QUALIFIERS, ""))
    );
    if (isAlternative && (REQUIRED.test(sentence) || PREFERRED.test(sentence)) && !NEGATED.test(sentence)) {
      const levels = new Set(names.map((m, i) => requiredLevel(sentence.slice(m.index, names[i + 1]?.index))).filter(Boolean));
      // Des niveaux différents selon l'alternative restent à confirmer plutôt que d'attribuer le premier aux deux.
      const level = levels.size > 1 ? null : requiredLevel(sentence);
      requirements.push({ languages: [...new Set(names.map(m => languageOf(m[0])))], importance: PREFERRED.test(sentence) ? "preferred" : "required", level, evidence: evidence.slice(0, 240) });
      continue;
    }
    const coordinated = names.length > 1 && names.slice(1).every((m, i) => AND.test(sentence.slice(names[i].index! + names[i][0].length, m.index)));
    if (coordinated && (REQUIRED.test(sentence) || PREFERRED.test(sentence)) && !NEGATED.test(sentence)) {
      for (const language of new Set(names.map(m => languageOf(m[0])))) {
        requirements.push({ languages: [language], importance: PREFERRED.test(sentence) ? "preferred" : "required", level: requiredLevel(sentence), evidence: evidence.slice(0, 240) });
      }
      continue;
    }
    for (let i = 0; i < names.length; i++) {
      const m = names[i];
      const start = i === 0 ? 0 : m.index!;
      const end = names[i + 1]?.index ?? sentence.length;
      const local = sentence.slice(start, end);
      // Qualificatifs avant une langue : « maîtrise de l'anglais », « bonnes connaissances en allemand ».
      const prefix = i > 0 ? sentence.slice(names[i - 1].index! + names[i - 1][0].length, m.index).split(/,|\bet\b|\band\b|\bund\b/).at(-1) ?? "" : "";
      const context = `${prefix} ${local}`;
      const negatedLanguage = new RegExp(`\\b(?:no|kein\\w*|pas\\s+de)\\s+(?:${ALIASES[languageOf(m[0])]})\\b`).test(context);
      const inheritedDemand = i > 0 && REQUIRED.test(sentence.slice(0, names[0].index)) &&
        /^\s*(?:et|and|und|,)\s*(?:(?:de|du|en|in)\s+|[dl]['’])*\s*$/.test(sentence.slice(names[i - 1].index! + names[i - 1][0].length, m.index));
      if (NEGATED.test(context) || negatedLanguage || (!REQUIRED.test(context) && !PREFERRED.test(context) && !inheritedDemand)) continue;
      requirements.push({ languages: [languageOf(m[0])], importance: PREFERRED.test(context) ? "preferred" : "required", level: requiredLevel(context), evidence: evidence.slice(0, 240) });
    }
  }
  // Une même obligation répétée ne multiplie pas les écarts ; l'exigence la plus forte prime.
  const unique = new Map<string, LanguageRequirement>();
  for (const requirement of requirements) {
    const key = [...requirement.languages].sort().join("/");
    const previous = unique.get(key);
    if (!previous || (previous.importance === "preferred" && requirement.importance === "required") ||
      (previous.importance === requirement.importance && (levelRank(requirement.level) ?? 0) > (levelRank(previous.level) ?? 0))) unique.set(key, requirement);
  }
  return [...unique.values()];
}

function levelRank(level: string | null | undefined): number | null {
  const text = fold(level ?? "");
  const cefr = /\b([abc][12])\b/.exec(text)?.[1];
  if (cefr) return ["a1", "a2", "b1", "b2", "c1", "c2"].indexOf(cefr) + 1;
  if (/natif|native|maternelle|muttersprache/.test(text)) return 6;
  if (/courant|fluent|bilingue|bilingual|fliessend|verhandlungssicher/.test(text)) return 5;
  if (/professionnel|professional|business/.test(text)) return 4;
  if (/notions|basic|debutant|beginner|grundkenntnisse/.test(text)) return 1;
  return null;
}

export function assessLanguages(description: string, profileLanguages: { name: string; level?: string | null }[] | null): LanguageAssessment {
  const checks = extractLanguageRequirements(description).map(requirement => {
    const profileLevels: string[] = [];
    const statuses = requirement.languages.map(language => {
      if (profileLanguages === null) return "unknown";
      const entries = profileLanguages.filter(l => new RegExp(`\\b(?:${ALIASES[language]})\\b`).test(fold(l.name)));
      if (!entries.length) return "gap";
      profileLevels.push(...entries.map(l => `${LANGUAGE_LABELS[language]} : ${l.level || "niveau non renseigné"}`));
      const ranks = entries.map(l => levelRank(l.level)).filter((rank): rank is number => rank !== null);
      if (requirement.level === "Natif") return entries.some(l => /natif|native|maternelle|muttersprache/.test(fold(l.level ?? ""))) ? "compatible" : "unknown";
      const required = levelRank(requirement.level);
      if (required === null || !ranks.length) return "unknown";
      return Math.max(...ranks) >= required ? "compatible" : "gap";
    });
    const status: LanguageCheck["status"] = statuses.includes("compatible") ? "compatible" : statuses.includes("unknown") ? "unknown" : "gap";
    return { ...requirement, status, profileLevels };
  });
  return { textLanguage: detectTextLanguage(description), checks };
}
