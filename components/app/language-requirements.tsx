import { LANGUAGE_LABELS, type LanguageAssessment } from "@/lib/language-requirements";
import { Badge } from "@/components/ui/badge";

export function LanguageRequirements({ assessment }: { assessment: LanguageAssessment }) {
  return (
    <section aria-label="Langues demandées" className="space-y-3">
      <div>
        <p className="font-semibold">Langues demandées</p>
        <p className="text-small text-textSecondary">Langue du texte : {assessment.textLanguage ? LANGUAGE_LABELS[assessment.textLanguage] : "indéterminée"}. Elle ne suffit pas à déterminer les exigences.</p>
      </div>
      {!assessment.checks.length && <p className="text-small text-textSecondary">Aucune exigence explicite détectée. Vérifiez l'annonce d'origine.</p>}
      {assessment.checks.map((check, index) => (
        <div key={index} className="rounded-md border border-border p-3 text-small">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{check.languages.map(l => LANGUAGE_LABELS[l]).join(" ou ")}{check.level ? ` · ${check.level}` : ""}</span>
            <Badge variant={check.importance === "required" && check.status === "gap" ? "warning" : check.status === "compatible" ? "success" : "default"}>
              {check.importance === "required" ? "Exigé" : "Souhaité / atout"}
            </Badge>
          </div>
          <p className="mt-1 text-textSecondary">
            {check.status === "compatible" ? "Profil cohérent avec le niveau demandé." : check.status === "gap" ? check.importance === "required" ? "Écart avec les langues déclarées dans votre profil." : "Atout non couvert par les langues déclarées." : "Niveau à confirmer : données insuffisantes."}
            {check.profileLevels.length ? ` ${check.profileLevels.join(" · ")}.` : check.status === "gap" ? " Langue non renseignée." : ""}
          </p>
          <details className="mt-2 text-textSecondary"><summary className="cursor-pointer">Extrait de l'annonce</summary><p className="mt-1">{check.evidence}</p></details>
        </div>
      ))}
      {!!assessment.checks.length && <p className="text-caption text-textSecondary">Détection indicative. Les niveaux « professionnel » et « courant » sont comparés approximativement à B2 et C1 ; les niveaux non précisés restent à confirmer.</p>}
    </section>
  );
}
