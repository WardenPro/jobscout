"use client";
import { useEffect, useState } from "react";
import { Folder, FolderOpen, Check, AlertCircle, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function SettingsFolder() {
  const [folder, setFolder] = useState("");
  const [originalFolder, setOriginalFolder] = useState("");
  const [defaultFolder, setDefaultFolder] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/docs-folder")
      .then((r) => r.json())
      .then((data) => {
        setFolder(data.folder ?? "");
        setOriginalFolder(data.folder ?? "");
        setIsCustom(!!data.isCustom);
        setDefaultFolder(data.defaultFolder ?? "");
      })
      .catch(() => {});
  }, []);

  async function call(action: "verify" | "save" | "reset", payloadFolder?: string) {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/settings/docs-folder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, folder: payloadFolder ?? folder }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur");
        return;
      }
      if (action === "verify") {
        setInfo("Dossier accessible en écriture ✓");
        return;
      }
      if (action === "reset") {
        setFolder(data.folder);
        setOriginalFolder(data.folder);
        setIsCustom(false);
        setInfo("Dossier réinitialisé.");
        return;
      }
      setOriginalFolder(data.folder);
      setIsCustom(true);
      setInfo("Dossier enregistré ✓");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  async function openFolder() {
    await fetch("/api/settings/open-folder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: originalFolder }),
    });
  }

  // Optional: use the File System Access API to nudge the user to a folder
  // This only works on Chromium and only returns the folder name (not full path),
  // so it's a hint, not a true picker. We display the chosen name to help the user
  // verify they're typing the right path.
  async function tryDirectoryHint() {
    try {
      // @ts-expect-error - showDirectoryPicker is browser-only
      const handle = await window.showDirectoryPicker?.();
      if (handle?.name) {
        setInfo(
          `Dossier sélectionné : "${handle.name}". Collez le chemin complet ci-dessus (ex. C:\\Users\\${handle.name}…)`
        );
      }
    } catch {
      // user cancelled
    }
  }

  const dirty = folder !== originalFolder;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <div className="h-8 w-8 rounded-md bg-surface flex items-center justify-center text-textSecondary">
          <Folder className="h-5 w-5" />
        </div>
        <h2 className="text-h3">Dossier des documents</h2>
      </div>
      <p className="text-small text-textSecondary mb-4">
        Tous les CV, lettres de motivation et messages générés par JobScout sont sauvegardés
        dans ce dossier, chacun dans un sous-dossier dédié à l'offre. Word (.docx) et PDF côte à côte.
      </p>

      <Input
        value={folder}
        onChange={(e) => setFolder(e.target.value)}
        placeholder="C:\Users\votre-nom\Documents\JobScout"
        spellCheck={false}
      />
      <p className="text-caption text-textSecondary mt-1.5">
        {isCustom ? (
          <>Dossier personnalisé. Défaut : <code>{defaultFolder}</code></>
        ) : (
          <>Aucun dossier personnalisé — utilise le défaut <code>{defaultFolder}</code></>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <Button onClick={() => call("save")} disabled={loading || !folder.trim() || !dirty}>
          {loading ? <Spinner size={16} className="text-onAccent" /> : <Check className="h-4 w-4" />}
          Enregistrer
        </Button>
        <Button variant="secondary" onClick={() => call("verify")} disabled={loading || !folder.trim()}>
          Vérifier
        </Button>
        <Button variant="ghost" onClick={tryDirectoryHint} disabled={loading}>
          <FolderOpen className="h-4 w-4" /> Parcourir…
        </Button>
        <Button variant="ghost" onClick={openFolder} disabled={loading}>
          <FolderOpen className="h-4 w-4" /> Ouvrir le dossier
        </Button>
        {isCustom && (
          <Button variant="ghost" onClick={() => call("reset")} disabled={loading}>
            <RotateCcw className="h-4 w-4" /> Réinitialiser
          </Button>
        )}
      </div>

      {info && (
        <div role="status" className="mt-3 flex items-start gap-2 rounded-md border border-border bg-surface p-3 text-small text-text">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" /> {info}
        </div>
      )}
      {error && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-md border border-danger bg-surface p-3 text-small text-text">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" /> {error}
        </div>
      )}
    </Card>
  );
}
