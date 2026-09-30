import { describe, expect, it } from "vitest";
import tailwindConfig from "@/tailwind.config";
import { cn, FONT_SIZE_TOKENS, SHADOW_TOKENS } from "@/lib/utils";

// cn() fusionne les classes avec tailwind-merge. Nos tailles (text-small,
// text-caption…) n'existent pas dans Tailwind par défaut : non déclarées, elles
// étaient prises pour des couleurs et l'une des deux classes disparaissait
// (badges en 16 px, bouton principal sans son texte blanc).
describe("cn() et les jetons du projet", () => {
  it("garde une taille du projet ET une couleur, dans les deux ordres", () => {
    expect(cn("text-small", "text-white")).toBe("text-small text-white");
    expect(cn("text-white", "text-small")).toBe("text-white text-small");
    expect(cn("h-11 px-3 text-small", "button-primary text-onAccent")).toBe("h-11 px-3 text-small button-primary text-onAccent");
    expect(cn("rounded-sm px-2.5 py-0.5 text-caption font-semibold", "bg-accent/[.12] text-accent")).toBe(
      "rounded-sm px-2.5 py-0.5 text-caption font-semibold bg-accent/[.12] text-accent"
    );
  });

  it("remplace une taille par une autre sans toucher à la couleur", () => {
    expect(cn("text-h3 text-text", "text-small")).toBe("text-text text-small");
    expect(cn("text-body text-text", "text-[15px]")).toBe("text-text text-[15px]");
    expect(cn("text-caption", "text-sm")).toBe("text-sm");
  });

  it("remplace une couleur par une autre sans toucher à la taille", () => {
    expect(cn("text-small text-textSecondary", "text-danger")).toBe("text-small text-danger");
  });

  it("traite nos ombres comme des ombres, pas comme des couleurs d'ombre", () => {
    expect(cn("shadow-card", "shadow-elevated")).toBe("shadow-elevated");
    expect(cn("shadow-sm", "shadow-card")).toBe("shadow-card");
  });

  it("déclare exactement les tailles et ombres de tailwind.config.ts", () => {
    const extend = tailwindConfig.theme?.extend ?? {};
    expect([...FONT_SIZE_TOKENS].sort()).toEqual(Object.keys(extend.fontSize ?? {}).sort());
    expect([...SHADOW_TOKENS].sort()).toEqual(Object.keys(extend.boxShadow ?? {}).sort());
  });
});
