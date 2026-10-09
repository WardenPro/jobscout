"use client";
import { useRef, useState } from "react";
import { Sparkles, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ProfileFull } from "@/lib/cv/types";
import { JobSuggestionsSchema } from "@/lib/cv/job-suggestions";

export function JobSuggestions({ profile, update }: { profile: ProfileFull; update: (patch: Partial<ProfileFull>) => void }) {
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzed, setAnalyzed] = useState(false);
  const suggestions = profile.job_suggestions ?? [];
  const hasContent = !!profile.summary?.trim() || !!profile.experiences.length || !!profile.skills.length || !!profile.educations.length;
  async function analyze() {
    if (busy.current) return;
    busy.current = true; setLoading(true); setError(null);
    try {
      const { summary, experiences, educations, skills } = profile;
      const response = await fetch("/api/profile/job-suggestions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ summary, experiences, educations, skills }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Impossible d'analyser le profil.");
      const parsed = JobSuggestionsSchema.safeParse(data.suggestions);
      if (!parsed.success) throw new Error("Les suggestions reçues sont invalides.");
      update({ job_suggestions: parsed.data }); setAnalyzed(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Impossible d'analyser le profil."); }
    finally { busy.current = false; setLoading(false); }
  }
  return <div className="my-4 rounded-md border border-border bg-surface p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="flex items-center gap-2 text-small font-medium"><Sparkles className="h-4 w-4 text-accent" /> Idées de postes d'après votre CV</p>
      <Button type="button" variant="secondary" size="sm" disabled={loading || !hasContent} onClick={analyze}>
        {loading ? <><Spinner size={14} /> Analyse en cours…</> : suggestions.length ? "Actualiser les idées" : "Analyser mon profil"}
      </Button>
    </div>
    <p className="mt-2 text-caption text-textSecondary">L'IA propose des intitulés à partir de vos expériences, formations et compétences. Ajoutez ceux qui vous intéressent, puis enregistrez vos choix.</p>
    {!hasContent && <p className="mt-2 text-small text-textSecondary">Importez un CV ou renseignez votre parcours pour obtenir des idées.</p>}
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {suggestions.map(suggestion => {
        const selected = profile.sectors.some(sector => sector.trim().toLocaleLowerCase() === suggestion.title.toLocaleLowerCase());
        return <div key={suggestion.title} className="rounded-md border border-border p-3">
          <p className="text-small font-medium">{suggestion.title}</p>
          <p className="mt-1 text-caption text-textSecondary">{suggestion.reason}</p>
          <Button type="button" size="sm" variant="secondary" className="mt-2" disabled={selected} onClick={() => update({ sectors: [...profile.sectors, suggestion.title] })} aria-label={`${selected ? "Ajouté" : "Ajouter"} : ${suggestion.title}`}>
            {selected ? <><Check className="h-3 w-3" /> Ajouté</> : <><Plus className="h-3 w-3" /> Ajouter à mes cibles</>}
          </Button>
        </div>;
      })}
    </div>
    {analyzed && !suggestions.length && <p className="mt-2 text-small text-textSecondary">Le parcours ne permet pas encore de proposer des intitulés précis. Complétez vos expériences ou ajoutez vos cibles manuellement.</p>}
    {error && <p role="alert" className="mt-2 text-small text-danger">{error}</p>}
  </div>;
}
