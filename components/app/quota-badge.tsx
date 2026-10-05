"use client";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

type LlmStatus = {
  mode: "pack" | "byok" | "unset";
  configured: boolean;
  quota: {
    points_remaining: number | null;
    dossiers_estimes: number | null;
  } | null;
};

// Barre latérale + en-tête mobile : une seule requête en vol pour les deux.
let inflight: Promise<LlmStatus | null> | null = null;
function fetchLlmStatus(): Promise<LlmStatus | null> {
  inflight ??= fetch("/api/settings/llm", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<LlmStatus>) : null))
    .catch(() => null /* hors-ligne : rien à signaler */)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Pied de barre latérale (patron version-badge) : quota du pack IA.
 * N'affiche rien hors mode pack ou si le proxy est injoignable — la barre
 * latérale reste sobre, jamais de message d'erreur ici.
 * `compact` : pastille de l'en-tête mobile (« dossiers » masqué sous 640 px,
 * toujours lu par les lecteurs d'écran).
 */
export function QuotaBadge({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<LlmStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLlmStatus().then((d) => {
      if (!cancelled && d) setStatus(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status?.mode !== "pack" || !status.configured || !status.quota) return null;
  const { points_remaining, dossiers_estimes } = status.quota;
  if (points_remaining == null) return null;
  const dossiers = dossiers_estimes ?? Math.floor(points_remaining / 10);

  if (compact) {
    return (
      <p
        className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-caption text-textSecondary"
        title={`Relais : ${points_remaining} points restants`}
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          {`≈ ${dossiers}`}
          <span className="sr-only sm:not-sr-only">{" dossiers"}</span>
        </span>
      </p>
    );
  }

  return (
    <div className="px-3 pt-1">
      <p
        className="flex items-center gap-1.5 text-caption text-textSecondary"
        title={`Relais : ${points_remaining} points restants`}
      >
        <Sparkles className="h-3 w-3 shrink-0" />
        {`≈ ${dossiers} dossiers`}
      </p>
    </div>
  );
}
