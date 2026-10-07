"use client";
import { useId } from "react";
import { Chip } from "@/components/ui/chip";
import { WORK_PERMITS, WORK_PERMIT_LABELS, type WorkPermit } from "@/lib/work-permit";

const STEPS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const selectClass =
  "h-9 rounded-md border border-border bg-bg px-3 text-small text-text focus:border-accent focus:outline-none";

/**
 * Réglages propres au marché suisse : statut de travail (repris dans la lettre et
 * l'en-tête du CV des offres suisses) et taux d'activité souhaité (critère du score).
 * Affiché par le parent quand la Suisse fait partie des pays cibles.
 */
export function SwissSettings({
  workPermit,
  workloadRange,
  onChange,
}: {
  workPermit: WorkPermit | null | undefined;
  workloadRange: [number, number] | null | undefined;
  onChange: (patch: { work_permit?: WorkPermit | null; workload_range?: [number, number] | null }) => void;
}) {
  const minId = useId();
  const maxId = useId();
  const [min, max] = workloadRange ?? [80, 100];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-caption uppercase text-textSecondary mb-1">Statut de travail en Suisse</p>
        <p className="text-small text-textSecondary mb-2">
          Repris dans la lettre et l'en-tête du CV des offres suisses. Un frontalier n'est jamais présenté comme prêt à déménager.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={!workPermit} onClick={() => onChange({ work_permit: null })}>
            Non précisé
          </Chip>
          {WORK_PERMITS.map((p) => (
            <Chip key={p} active={workPermit === p} onClick={() => onChange({ work_permit: p })}>
              {WORK_PERMIT_LABELS[p]}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="text-caption uppercase text-textSecondary mb-1">Taux d'activité souhaité</p>
        <p className="text-small text-textSecondary mb-2">
          Une offre hors de cette fourchette (ex. 40 % quand vous cherchez 80–100 %) perd des points ; une offre sans taux indiqué n'est pas pénalisée.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-small">
          <Chip active={!workloadRange} onClick={() => onChange({ workload_range: null })}>
            Indifférent
          </Chip>
          <Chip active={!!workloadRange} onClick={() => !workloadRange && onChange({ workload_range: [80, 100] })}>
            Fourchette
          </Chip>
          {workloadRange && (
            <>
              <label htmlFor={minId} className="text-textSecondary">de</label>
              <select
                id={minId}
                className={selectClass}
                value={min}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  onChange({ workload_range: [v, Math.max(v, max)] });
                }}
              >
                {STEPS.map((s) => <option key={s} value={s}>{s} %</option>)}
              </select>
              <label htmlFor={maxId} className="text-textSecondary">à</label>
              <select
                id={maxId}
                className={selectClass}
                value={max}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  onChange({ workload_range: [Math.min(min, v), v] });
                }}
              >
                {STEPS.map((s) => <option key={s} value={s}>{s} %</option>)}
              </select>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
