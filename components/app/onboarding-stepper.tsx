import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

const STEPS = [
  { id: "upload", label: "Importer" },
  { id: "verify", label: "Vérifier" },
  { id: "preferences", label: "Préférences" },
];

export function OnboardingStepper({ current }: { current: "upload" | "verify" | "preferences" }) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <nav aria-label="Étapes de configuration" className="grid grid-cols-3 gap-2 border-b border-border">
      {STEPS.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={s.id} aria-current={active ? "step" : undefined} className={cn("flex min-w-0 items-center gap-2 border-b-2 pb-3 sm:gap-3", active ? "border-accent" : "border-transparent")}>
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-small font-semibold transition-colors",
                done
                  ? "bg-accent text-onAccent"
                  : active
                  ? "bg-accent text-onAccent"
                  : "bg-surfaceHover text-textSecondary"
              )}
            >
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span
              className={cn(
                "truncate text-[11px] font-semibold sm:text-small",
                active ? "text-text" : "text-textSecondary"
              )}
            >
              {s.label}
            </span>
          </div>
        );
      })}
    </nav>
  );
}
