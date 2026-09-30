import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  const variants: Record<BadgeVariant, string> = {
    // Fond = couleur vive à 12 %, texte = encre du thème (text-* → --*-ink) :
    // ≥ 4,5:1 en clair et en sombre (« Envoyée » tombait à 3,9:1).
    // Neutre : fond plus soutenu que la carte + filet, sinon le badge se fond dans la carte.
    default: "bg-surfaceHover text-textSecondary ring-1 ring-inset ring-border",
    success: "bg-success/[.12] text-success",
    warning: "bg-warning/[.12] text-warning",
    danger: "bg-danger/[.12] text-danger",
    info: "bg-accent/[.12] text-accent",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-2.5 py-0.5 text-caption font-semibold",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
