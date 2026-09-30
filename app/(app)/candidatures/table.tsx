"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CalendarDays, Check, ChevronDown, Download, FileSpreadsheet, Search, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import type { CandidatureWithOffre } from "@/lib/db/candidatures";

const STATUS_OPTIONS: { id: string; label: string; variant: BadgeVariant }[] = [
  { id: "envoyee", label: "Envoyée", variant: "info" },
  { id: "en_cours", label: "En cours", variant: "warning" },
  { id: "entretien", label: "Entretien", variant: "warning" },
  { id: "acceptee", label: "Acceptée", variant: "success" },
  { id: "refusee", label: "Refusée", variant: "danger" },
];

const STAGES = [
  { id: "", label: "Toutes" },
  { id: "en_cours", label: "En cours" },
  { id: "envoyee", label: "Envoyées" },
  { id: "entretien", label: "Entretiens" },
  { id: "decisions", label: "Décisions" },
] as const;
const EMPTY_STAGE_COPY: Record<string, { title: string; description: string }> = {
  en_cours: { title: "Aucune candidature en préparation", description: "Depuis une offre, ajoutez-la au suivi pour préparer votre dossier." },
  envoyee: { title: "Aucune candidature envoyée", description: "Après avoir postulé sur le site de l'annonce, passez son statut à « Envoyée »." },
  entretien: { title: "Aucun entretien pour le moment", description: "Les entretiens apparaîtront ici lorsque vous changerez le statut d'une candidature." },
  decisions: { title: "Aucune décision enregistrée", description: "Les candidatures acceptées ou refusées apparaîtront ici." },
};

function matchesStage(status: string, stage: string): boolean {
  return !stage || (stage === "decisions" ? status === "acceptee" || status === "refusee" : status === stage);
}

function statusMeta(status: string) {
  return STATUS_OPTIONS.find((item) => item.id === status) ?? { label: status, variant: "default" as const };
}

function displayDate(value: string | null | undefined): string {
  if (!value) return "—";
  const datePart = value.slice(0, 10);
  const date = new Date(`${datePart}T12:00:00`);
  return Number.isNaN(date.getTime()) ? datePart : date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export function CandidaturesTable({ initial }: { initial: CandidatureWithOffre[] }) {
  const [rows, setRows] = useState(initial);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => setRows(initial), [initial]);
  const filtered = useMemo(() => rows.filter((row) => {
    if (!matchesStage(row.status, statusFilter)) return false;
    const haystack = [row.offre_company, row.offre_title, row.ext_company, row.ext_title, row.notes, row.contact].filter(Boolean).join(" ").toLowerCase();
    return !query || haystack.includes(query.toLowerCase());
  }), [rows, query, statusFilter]);
  const emptyState = rows.length === 0
    ? { title: "Un suivi clair, dès la première candidature", description: "Depuis une offre, ajoutez la candidature au suivi. Vous pourrez noter les contacts, les échéances et les prochaines étapes." }
    : query ? { title: "Aucun résultat", description: "Essayez un autre mot clé ou choisissez une autre étape." }
    : EMPTY_STAGE_COPY[statusFilter] ?? { title: "Aucun résultat", description: "Modifiez la recherche ou choisissez une autre étape." };

  async function patch(id: number, body: Record<string, string | null>): Promise<boolean> {
    setError(null);
    try {
      const res = await fetch("/api/candidatures", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...body }) });
      if (!res.ok) throw new Error("La modification n'a pas pu être enregistrée.");
      setRows((current) => current.map((row) => row.id === id ? { ...row, ...body } : row));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erreur réseau.");
      return false;
    }
  }

  async function remove(id: number): Promise<void> {
    setError(null);
    try {
      const res = await fetch(`/api/candidatures?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("La candidature n'a pas pu être supprimée.");
      setRows((current) => current.filter((row) => row.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erreur réseau.");
    }
  }

  async function importFile(file: File) {
    setError(null);
    if (file.size > 10 * 1024 * 1024) { setError("Le fichier dépasse 10 Mo. Choisissez un export plus léger."); return; }
    setImporting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/candidatures/import", { method: "POST", body: form });
      if (!res.ok) throw new Error("Import impossible. Vérifiez que le fichier contient un tableau Excel valide.");
      const fresh = await fetch("/api/candidatures").then((response) => response.json());
      if (Array.isArray(fresh.candidatures)) setRows(fresh.candidatures);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erreur réseau.");
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div>
      <nav aria-label="Étapes des candidatures" className="mb-5 flex gap-2 overflow-x-auto pb-2 sm:grid sm:grid-cols-5 sm:overflow-visible sm:pb-0">
        {STAGES.map((stage) => {
          const active = statusFilter === stage.id;
          const count = rows.filter((row) => matchesStage(row.status, stage.id)).length;
          return <button key={stage.id} type="button" onClick={() => setStatusFilter(stage.id)} aria-current={active ? "true" : undefined} className="glass-panel stage-card min-h-[100px] min-w-[112px] shrink-0 !rounded-[18px] px-4 py-4 text-left transition-colors hover:border-accent/30 sm:min-w-0">
            <span className={`block text-caption font-semibold ${active ? "text-accent" : "text-textSecondary"}`}>{stage.label}</span>
            <span className="mt-3 block font-display text-[30px] font-light leading-none tabular-nums">{count}</span>
          </button>;
        })}
      </nav>
      <section aria-label="Rechercher dans les candidatures" className="glass-panel flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:p-5">
        <label className="relative min-w-[180px] flex-1">
          <span className="sr-only">Rechercher une candidature</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-textSecondary" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Entreprise, poste, contact…" className="h-11 w-full rounded-md border border-border bg-bg pl-10 pr-3 text-body focus:border-accent focus:outline-none" />
        </label>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); }} />
          <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={importing}><Upload className="h-4 w-4" /> {importing ? "Import…" : "Importer"}</Button>
          <Button variant="secondary" asChild><a href="/api/candidatures/export" download><Download className="h-4 w-4" /> Exporter</a></Button>
        </div>
      </section>

      {error && <p role="alert" className="mt-4 rounded-md border border-danger bg-surface px-4 py-3 text-small text-danger">{error}</p>}

      <div className="mb-4 mt-7">
        <h2 className="font-display text-h2">Votre suivi</h2>
        <p className="mt-1 text-small text-textSecondary" aria-live="polite">{filtered.length} candidature{filtered.length > 1 ? "s" : ""} affichée{filtered.length > 1 ? "s" : ""}</p>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-panel px-6 py-14 text-center">
          <FileSpreadsheet className="mx-auto mb-4 h-8 w-8 text-accent" />
          <h3 className="font-display text-h2">{emptyState.title}</h3>
          <p className="mx-auto mt-2 max-w-[44ch] text-body text-textSecondary">{emptyState.description}</p>
          {rows.length === 0 && <Link href="/offres" className="mt-5 inline-flex items-center gap-1 text-small font-semibold text-accent hover:underline">Explorer les offres <ArrowUpRight className="h-4 w-4" /></Link>}
        </div>
      ) : (
        <div className="space-y-3">{filtered.map((row) => <CandidatureCard key={row.id} row={row} onPatch={patch} onRemove={remove} />)}</div>
      )}
    </div>
  );
}

function CandidatureCard({ row, onPatch, onRemove }: { row: CandidatureWithOffre; onPatch: (id: number, body: Record<string, string | null>) => Promise<boolean>; onRemove: (id: number) => Promise<void> }) {
  const [status, setStatus] = useState(row.status);
  const [notes, setNotes] = useState(row.notes ?? "");
  const [contact, setContact] = useState(row.contact ?? "");
  const [deadline, setDeadline] = useState(row.deadline ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const meta = statusMeta(status);
  const title = row.offre_title ?? row.ext_title ?? "Poste non précisé";
  const company = row.offre_company ?? row.ext_company ?? "Entreprise non précisée";
  const url = row.offre_url ?? row.ext_url;
  const dirty = notes !== (row.notes ?? "") || contact !== (row.contact ?? "") || deadline !== (row.deadline ?? "");

  async function saveDetails() {
    setSaving(true);
    const ok = await onPatch(row.id, { notes: notes || null, contact: contact || null, deadline: deadline || null });
    setSaving(false);
    if (ok) { setSaved(true); window.setTimeout(() => setSaved(false), 1800); }
  }

  async function changeStatus(next: string) {
    const previous = status;
    setStatus(next);
    if (!await onPatch(row.id, { status: next })) setStatus(previous);
  }

  return (
    <article className="glass-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-small font-semibold text-textSecondary">{company}</p>
          {row.offre_id ? <Link href={`/offres/${row.offre_id}`} className="font-display text-[21px] font-semibold leading-tight hover:text-accent">{title}</Link> : <h3 className="font-display text-[21px] font-semibold leading-tight">{title}</h3>}
          <p className="mt-2 text-small text-textSecondary">Ajoutée le {displayDate(row.applied_at)}{(row.offre_country ?? row.ext_country) ? ` · ${row.offre_country ?? row.ext_country}` : ""}</p>
        </div>
        <Badge variant={meta.variant} className="mt-0.5">{meta.label}</Badge>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-4 text-small">
        {(row.offre_score ?? row.ext_score) != null && <span><strong className="tabular-nums">{row.offre_score ?? row.ext_score}</strong><span className="text-textSecondary"> / 100 d'adéquation</span></span>}
        <span className="inline-flex items-center gap-1.5 text-textSecondary"><CalendarDays className="h-4 w-4" /> {deadline ? `Échéance : ${displayDate(deadline)}` : "Aucune échéance"}</span>
        {url && <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-accent hover:underline sm:ml-auto">Annonce <ArrowUpRight className="h-4 w-4" /></a>}
      </div>

      <details className="group mt-4 border-t border-border pt-3">
        <summary className="flex min-h-11 list-none items-center gap-1.5 text-small font-semibold text-accent marker:hidden hover:underline">Modifier le suivi <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></summary>
        <div className="grid gap-4 pt-4 sm:grid-cols-2">
          <label className="text-small font-semibold">Statut
            <select value={status} onChange={(event) => void changeStatus(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-border bg-bg px-3 font-normal focus:border-accent focus:outline-none">
              {STATUS_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <label className="text-small font-semibold">Échéance
            <input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-border bg-bg px-3 font-normal focus:border-accent focus:outline-none" />
          </label>
          <label className="text-small font-semibold">Contact
            <input type="text" value={contact} onChange={(event) => setContact(event.target.value)} placeholder="Nom ou adresse email" className="mt-1.5 h-10 w-full rounded-md border border-border bg-bg px-3 font-normal focus:border-accent focus:outline-none" />
          </label>
          <label className="text-small font-semibold sm:col-span-2">Notes
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Prochaine étape, échange, relance…" className="mt-1.5 w-full rounded-md border border-border bg-bg px-3 py-2 font-normal focus:border-accent focus:outline-none" />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><Button size="sm" onClick={() => void saveDetails()} disabled={!dirty || saving}>{saving ? "Enregistrement…" : "Enregistrer les détails"}</Button>{saved && <span className="inline-flex items-center gap-1 text-small text-success"><Check className="h-4 w-4" /> Enregistré</span>}</div>
          {!confirmDelete ? <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1 text-small text-textSecondary hover:text-danger"><Trash2 className="h-4 w-4" /> Supprimer</button> : <span className="flex items-center gap-2 text-small"><span>Supprimer cette candidature ?</span><button type="button" onClick={() => setConfirmDelete(false)} className="font-semibold text-textSecondary hover:underline">Annuler</button><button type="button" onClick={() => void onRemove(row.id)} className="font-semibold text-danger hover:underline">Supprimer</button></span>}
        </div>
      </details>
    </article>
  );
}
