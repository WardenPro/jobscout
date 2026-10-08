"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export function ProfilePhoto({ photo, onChange }: { photo?: string | null; onChange: (photo: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file?: File) {
    if (!file) return;
    setError(null);
    if (file.size > 5 * 1024 * 1024) { setError("Choisissez une image de moins de 5 Mo."); return; }
    setBusy(true);
    try {
      const body = new FormData();
      body.append("photo", file);
      const response = await fetch("/api/profile/photo", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Import impossible.");
      onChange(data.photo);
    } catch (e) { setError(e instanceof Error ? e.message : "Import impossible."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }

  return (
    <div className="mb-5 rounded-md border border-border p-4">
      <p className="text-small font-semibold">Photo professionnelle (facultative)</p>
      <div className="mt-3 flex flex-wrap items-start gap-4">
        {photo && <img src={photo} alt="Aperçu de votre photo sur le CV" className="h-[150px] w-[120px] rounded-md object-cover" />}
        <div className="flex-1 space-y-3">
          <p className="text-small text-textSecondary">Votre photo apparaît en haut à droite des prochains CV PDF et Word. Choisissez un portrait avec un fond sobre et le visage centré. Le recadrage au format portrait est visible ici.</p>
          <p className="text-caption text-textSecondary">JPG, PNG ou WebP · 5 Mo maximum. La photo reste sur votre ordinateur. Enregistrez le profil pour appliquer, puis régénérez les CV existants pour l'ajouter.</p>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Importer une photo professionnelle" onChange={(e) => upload(e.target.files?.[0])} />
          <div className="flex gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Import en cours…" : photo ? "Remplacer la photo" : "Importer une photo"}</Button>
            {photo && <Button variant="ghost" disabled={busy} onClick={() => onChange(null)}>Supprimer</Button>}
          </div>
        </div>
      </div>
      {error && <p role="alert" className="mt-3 text-small text-danger">{error}</p>}
    </div>
  );
}
