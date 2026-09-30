"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Save, Trash2, ArrowRightLeft, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

type Snapshot = { name: string; full_name?: string | null; saved_at?: string };

export function ProfileSwitcher({ currentName }: { currentName: string | null }) {
  const router = useRouter();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [saveName, setSaveName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmLoad, setConfirmLoad] = useState<string | null>(null);

  const refresh = async () => {
    const res = await fetch("/api/profile/snapshots");
    if (res.ok) {
      const data = await res.json();
      setSnapshots(data.snapshots ?? []);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  async function act(action: "save" | "load" | "delete", name: string) {
    setBusy(`${action}:${name}`);
    setMessage(null);
    try {
      const res = await fetch("/api/profile/snapshots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error ?? "Erreur", error: true });
        return;
      }
      if (action === "save") setMessage({ text: `Profil sauvegardé sous « ${name} ».` });
      if (action === "load") {
        // Nombre d'offres re-scorées renvoyé par l'API (comme en 3.4.10).
        const rescored = typeof data.rescored === "number" ? data.rescored : null;
        setMessage({ text: `Profil « ${name} » chargé${rescored != null ? ` : ${rescored.toLocaleString("fr-FR")} offre${rescored > 1 ? "s" : ""} re-scorée${rescored > 1 ? "s" : ""}` : ""}.` });
        router.refresh();
      }
      if (action === "delete") setMessage({ text: `« ${name} » supprimé.` });
      setSaveName("");
      await refresh();
    } catch {
      setMessage({ text: "L'action n'a pas abouti. Vérifiez la connexion puis réessayez.", error: true });
    } finally {
      setBusy(null);
      // La confirmation reste affichée (bouton désactivé) pendant l'action, puis se referme.
      setConfirmDelete(null);
      setConfirmLoad(null);
    }
  }

  return (
    <Card className="p-0 sm:p-0">
      <details className="group">
        <summary className="flex min-h-20 list-none items-center gap-3 px-5 py-4 sm:px-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surfaceHover text-accent"><Users className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block text-h3">Profils enregistrés</span><span className="block text-small text-textSecondary">{snapshots.length ? `${snapshots.length} profil${snapshots.length > 1 ? "s" : ""} sauvegardé${snapshots.length > 1 ? "s" : ""}` : "Aucun profil sauvegardé"}</span></span>
          <ChevronDown className="h-5 w-5 shrink-0 text-textSecondary transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-border px-5 py-5 sm:px-6">
      <p className="mb-4 max-w-[65ch] text-small text-textSecondary">Sauvegardez votre profil avant d'en charger un autre. Le classement des offres est recalculé lors du changement.</p>

      {snapshots.length > 0 && (
        <div className="space-y-2 mb-4">
          {snapshots.map((s) => (
            <div
              key={s.name}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
            >
              <div className="min-w-0">
                <p className="text-body font-medium truncate">{s.name}</p>
                <p className="text-caption text-textSecondary truncate">
                  {s.full_name ?? "—"}
                  {s.saved_at ? ` · sauvegardé le ${s.saved_at.slice(0, 10)}` : ""}
                </p>
              </div>
              <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
                {confirmDelete === s.name ? (
                  <span className="flex flex-wrap items-center justify-end gap-2 text-small">
                    <span>Supprimer ?</span>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)} disabled={busy !== null}>Annuler</Button>
                    <Button size="sm" variant="danger" onClick={() => void act("delete", s.name)} disabled={busy !== null}>
                      {busy === `delete:${s.name}` && <Spinner size={14} />}
                      Confirmer
                    </Button>
                  </span>
                ) : confirmLoad === s.name ? (
                  <span className="flex flex-wrap items-center justify-end gap-2 text-small">
                    <span>Charger ce profil ?</span>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmLoad(null)} disabled={busy !== null}>Annuler</Button>
                    <Button size="sm" onClick={() => void act("load", s.name)} disabled={busy !== null}>
                      {busy === `load:${s.name}` && <Spinner size={14} className="text-onAccent" />}
                      {busy === `load:${s.name}` ? "Chargement…" : "Confirmer"}
                    </Button>
                  </span>
                ) : <>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => { setConfirmDelete(null); setConfirmLoad(s.name); }}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Charger
                </Button>
                <button
                  type="button"
                  aria-label={`Supprimer ${s.name}`}
                  disabled={busy !== null}
                  onClick={() => { setConfirmLoad(null); setConfirmDelete(s.name); }}
                  className="flex h-10 w-10 items-center justify-center rounded-md text-textSecondary hover:bg-surfaceHover hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                </>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label htmlFor="profile-save-name" className="min-w-0 flex-1 text-small font-semibold">Nom du profil à enregistrer
        <Input
          id="profile-save-name"
          className="mt-1.5"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          placeholder={
            currentName
              ? `Ex. ${currentName}`
              : "Ex. Recherche marketing"
          }
          onKeyDown={(e) =>
            e.key === "Enter" && saveName.trim() && act("save", saveName.trim())
          }
        />
        </label>
        <Button
          variant="secondary"
          disabled={!saveName.trim() || busy !== null}
          onClick={() => act("save", saveName.trim())}
        >
          {busy?.startsWith("save:") ? <Spinner size={14} /> : <Save className="h-4 w-4" />}
          Sauvegarder le profil actuel
        </Button>
      </div>

      {message && <p role={message.error ? "alert" : "status"} className={message.error ? "mt-3 rounded-md border border-danger bg-surface px-3 py-2 text-small text-text" : "mt-3 text-small text-text"}>{message.text}</p>}
        </div>
      </details>
    </Card>
  );
}
