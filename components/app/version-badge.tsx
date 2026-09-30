"use client";
import { useEffect, useState } from "react";
import { ArrowUpCircle } from "lucide-react";

type UpdateStatus = {
  current: string;
  variant?: "prod" | "test";
  latest: string | null;
  updateAvailable: boolean;
  downloadUrl: string | null;
  sha256: string | null;
};

// La barre latérale et l'en-tête mobile montent chacun un badge (l'un des deux
// est masqué en CSS) : une seule requête en vol pour les deux.
let inflight: Promise<UpdateStatus | null> | null = null;
function fetchUpdateStatus(): Promise<UpdateStatus | null> {
  inflight ??= fetch("/api/update", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<UpdateStatus>) : null))
    .catch(() => null /* hors-ligne : rien à signaler */)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Pied de barre latérale : version courante en sobre, et — seulement si le
 * serveur a réussi à joindre l'endpoint de version — une pastille discrète
 * proposant la mise à jour. `productName` vaut « JobScout Test » dans
 * l'installeur de test (lib/update/check.ts › productName()).
 *
 * `compact` (en-tête mobile) : uniquement la pastille de mise à jour, rien
 * s'il n'y en a pas ; libellé réduit au numéro sous 640 px.
 */
export function VersionBadge({
  version,
  productName = "JobScout",
  compact = false,
}: {
  version: string;
  productName?: string;
  compact?: boolean;
}) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchUpdateStatus().then((d) => {
      if (!cancelled && d) setStatus(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const displayed = status?.current ?? version;

  if (compact) {
    if (!status?.updateAvailable) return null;
    const content = (
      <>
        <ArrowUpCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="sm:hidden" aria-hidden="true">{`v${status.latest}`}</span>
        <span className="sr-only sm:not-sr-only">{`Version ${status.latest} disponible`}</span>
      </>
    );
    const pill = "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-accent/30 px-2.5 text-caption font-semibold";
    return status.downloadUrl ? (
      <a
        href={status.downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={status.sha256 ? `SHA-256 de l'installeur : ${status.sha256}` : `Version ${status.latest} disponible`}
        className={`${pill} text-accent transition-colors hover:bg-accent/10`}
      >
        {content}
      </a>
    ) : (
      <p className={`${pill} text-textSecondary`} title={`Version ${status.latest} disponible`}>
        {content}
      </p>
    );
  }

  return (
    <div className="px-3 pt-3 space-y-2">
      <p className="text-caption text-textSecondary">{`${productName} v${displayed}`}</p>
      {/* Hôte hors allowlist (§6.7) => downloadUrl null : on annonce la version
          SANS lien, au lieu d'un lien mort vers « # ». */}
      {status?.updateAvailable &&
        (status.downloadUrl ? (
          <a
            href={status.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={status.sha256 ? `SHA-256 de l'installeur : ${status.sha256}` : undefined}
            className="flex items-center gap-2 text-caption text-accent hover:underline"
          >
            <ArrowUpCircle className="h-3.5 w-3.5 shrink-0" />
            Version {status.latest} disponible
          </a>
        ) : (
          <p className="flex items-center gap-2 text-caption text-textSecondary">
            <ArrowUpCircle className="h-3.5 w-3.5 shrink-0" />
            Version {status.latest} disponible
          </p>
        ))}
    </div>
  );
}
