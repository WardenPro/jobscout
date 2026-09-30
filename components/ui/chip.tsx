"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export function Chip({
  active,
  onClick,
  onRemove,
  children,
  className,
}: {
  active?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick ?? onRemove}
      aria-pressed={onClick ? !!active : undefined}
      aria-label={onRemove && typeof children === "string" ? `Retirer ${children}` : undefined}
      className={cn(
        "inline-flex h-11 items-center gap-1.5 rounded-full border px-3.5 text-small font-medium transition-colors duration-200",
        active
          ? "bg-accent/[.08] border-accent/40 text-accent"
          : "border-border bg-transparent text-textSecondary hover:bg-surfaceHover hover:text-text",
        className
      )}
    >
      {children}
      {onRemove && <X aria-hidden="true" className="-mr-1 h-3.5 w-3.5 opacity-70" />}
    </button>
  );
}
