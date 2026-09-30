"use client";
import { useCallback, useRef, useState } from "react";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import { AiSettings } from "@/components/app/ai-settings";
import { CVUploader } from "./uploader";

/**
 * Gate d'onboarding CLIENT : l'uploader reste désactivé tant
 * que GET /api/settings/llm ne dit pas « configuré ». Le fetch vit dans la
 * carte AiSettings — pas de getSetting() dans le RSC de la page (piège de
 * prérendu documenté dans app/page.tsx : la valeur serait figée au build).
 *
 * La carte IA est repliée dès que l'IA est prête : dépliée, elle repoussait
 * la zone de dépôt (l'action principale de l'étape) sous la ligne de
 * flottaison à 1440×900. Elle reste montée une fois repliée : c'est elle qui
 * interroge le statut.
 */
export function UploadGate() {
  // null = statut pas encore chargé : on garde l'uploader fermé par défaut.
  const [configured, setConfigured] = useState<boolean | null>(null);
  // null = l'utilisateur n'a pas encore déplié ni replié le bloc lui-même.
  const [aiOpen, setAiOpen] = useState<boolean | null>(null);
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const open = aiOpen ?? configured === false;

  const onStatusChange = useCallback(({ configured }: { configured: boolean }) => setConfigured(configured), []);

  // Appelé depuis un message d'erreur IA de l'uploader : les réglages sont
  // sur cette page (sans profil, /profile renverrait ici).
  const openAiSettings = useCallback(() => {
    setAiOpen(true);
    requestAnimationFrame(() => detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  return (
    <div className="space-y-5">
      <details
        ref={detailsRef}
        id="generation-ia"
        open={open}
        onToggle={(e) => setAiOpen(e.currentTarget.open)}
        className="group scroll-mt-6"
      >
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2.5 text-small transition-colors hover:bg-surfaceHover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 [&::-webkit-details-marker]:hidden">
          <Sparkles className="h-4 w-4 shrink-0 text-textSecondary" aria-hidden="true" />
          <span className="font-medium text-text">Génération IA</span>
          <span className="flex min-w-0 items-center gap-1.5 text-textSecondary">
            {configured === true && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            {configured === null ? "Vérification…" : configured ? "Prête" : "À configurer"}
          </span>
          <span className="ml-auto flex items-center gap-1.5 text-textSecondary">
            <span className="hidden sm:inline">{open ? "Replier" : "Modifier"}</span>
            <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
          </span>
        </summary>
        <div className="mt-3">
          <AiSettings onStatusChange={onStatusChange} />
        </div>
      </details>
      <CVUploader disabled={configured !== true} onOpenAiSettings={openAiSettings} />
    </div>
  );
}
