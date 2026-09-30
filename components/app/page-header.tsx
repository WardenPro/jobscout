import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
  eyebrow = "Votre espace",
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
  eyebrow?: string;
}) {
  return (
    <header className={cn("mb-8 flex flex-col gap-5 sm:mb-9 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <p className="eyebrow mb-3"><span className="signal-dot" aria-hidden="true" />{eyebrow}</p>
        <h1 className="font-display text-h1 text-text text-balance">{title}</h1>
        {subtitle && <p className="mt-2 max-w-[65ch] text-body text-textSecondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </header>
  );
}
