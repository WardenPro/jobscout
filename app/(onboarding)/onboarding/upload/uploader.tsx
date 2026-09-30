"use client";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, AlertCircle } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const SAFE_TYPES = [".pdf", ".docx", ".txt", ".png", ".jpg", ".jpeg"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
// Les erreurs IA du serveur renvoient vers « Profil › Génération IA » : ici,
// ces réglages sont sur la page même (bloc au-dessus).
const AI_SETTINGS_HINT = /Génération IA/;

export function CVUploader({
  disabled = false,
  onOpenAiSettings,
}: {
  disabled?: boolean;
  onOpenAiSettings?: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (disabled) return;
    setError(null);
    if (!SAFE_TYPES.some((ext) => file.name.toLowerCase().endsWith(ext))) {
      setError("Format non pris en charge. Choisissez un PDF, DOCX, TXT, PNG ou JPG.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("Ce CV dépasse 10 Mo. Choisissez un fichier plus léger.");
      return;
    }
    setFilename(file.name);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("cv", file);
      const res = await fetch("/api/profile/extract", { method: "POST", body: fd });
      if (!res.ok) {
        // res.ok AVANT res.json() : un corps non-JSON (page HTML d'erreur) ne
        // doit pas masquer le vrai message derrière « Unexpected token ».
        const data = await res.json().catch(() => null);
        setError(data?.error || `Erreur lors de l'extraction (HTTP ${res.status}).`);
        setLoading(false);
        return;
      }
      const data = await res.json().catch(() => null);
      if (!data?.profile) {
        setError("Réponse du serveur illisible — réessayez.");
        setLoading(false);
        return;
      }
      // Stash extracted profile in sessionStorage and navigate
      sessionStorage.setItem("jobscout:extracted-profile", JSON.stringify(data.profile));
      router.push("/onboarding/verify");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled) return;
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        onClick={() => !loading && !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !loading && !disabled) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={disabled || loading ? -1 : 0}
        aria-label="Sélectionner un CV à importer"
        aria-describedby={loading || (filename && !error) ? undefined : hintId}
        aria-disabled={disabled}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-9 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:py-10",
          disabled
            ? "border-border bg-surface cursor-not-allowed [&>svg]:opacity-50"
            : loading
            ? "border-border bg-surface cursor-default"
            : dragOver
            ? "border-accent bg-accent/5 cursor-pointer"
            : "border-border bg-surface hover:bg-surfaceHover hover:border-textSecondary cursor-pointer"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={SAFE_TYPES.join(",")}
          className="hidden"
          // Le clic programmatique remonterait jusqu'à la zone et la
          // redéclencherait : on l'arrête ici.
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        {loading ? (
          <>
            <Spinner size={28} />
            <p className="text-body text-text mt-2">Lecture de votre CV…</p>
            <p className="text-small text-textSecondary">{filename}</p>
          </>
        ) : filename && !error ? (
          <>
            <FileText className="h-8 w-8 text-accent" />
            <p className="text-body text-text">{filename}</p>
          </>
        ) : (
          <>
            <Upload className="h-8 w-8 text-textSecondary" />
            <p className="text-body text-text font-medium">Glissez votre CV ici</p>
            <p id={hintId} className="text-small text-textSecondary">
              ou cliquez pour sélectionner — PDF, DOCX, TXT ou image, 10 Mo au plus
              {disabled && (
                <span className="mt-1 block font-medium text-text">Configurez d'abord la génération IA ci-dessus pour débloquer l'import.</span>
              )}
            </p>
          </>
        )}
      </div>
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-md bg-[rgba(255,59,48,0.08)] p-4 text-small text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {error}
            {onOpenAiSettings && AI_SETTINGS_HINT.test(error) && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={onOpenAiSettings}
                  className="font-semibold underline underline-offset-2 hover:no-underline"
                >
                  Ouvrir les réglages de génération IA
                </button>
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
