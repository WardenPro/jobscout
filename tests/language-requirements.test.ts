import { describe, expect, it } from "vitest";
import { assessLanguages, extractLanguageRequirements, detectTextLanguage } from "@/lib/language-requirements";

describe("langues explicitement demandées", () => {
  it("ne déduit pas d'exigence de la langue de rédaction", () => {
    const description = "Wir suchen Sie fur unser Unternehmen. Ihre Aufgaben sind mit unserem Team zu planen und umzusetzen.";
    expect(detectTextLanguage(description)).toBe("de");
    expect(extractLanguageRequirements(description)).toEqual([]);
  });

  it("sépare une obligation d'un atout et compare les niveaux déclarés", () => {
    const result = assessLanguages("Allemand B2 obligatoire. Français courant et anglais un atout.", [{ name: "Français", level: "C2" }, { name: "Allemand", level: "A2" }]);
    expect(result.checks).toEqual([
      expect.objectContaining({ languages: ["de"], importance: "required", level: "B2", status: "gap", profileLevels: ["Allemand : A2"] }),
      expect.objectContaining({ languages: ["fr"], importance: "required", level: "Courant", status: "compatible" }),
      expect.objectContaining({ languages: ["en"], importance: "preferred", status: "gap" }),
    ]);
  });

  it("français ou allemand est une alternative ; français et allemand sont deux obligations", () => {
    const profile = [{ name: "Français", level: "C1" }];
    expect(assessLanguages("Français ou allemand B2 obligatoire.", profile).checks).toEqual([
      expect.objectContaining({ languages: ["fr", "de"], status: "compatible" }),
    ]);
    expect(assessLanguages("Français et allemand B2 obligatoires.", profile).checks.map(c => c.status)).toEqual(["compatible", "gap"]);
    expect(extractLanguageRequirements("Maîtrise du français et de l'allemand.").map(c => c.languages)).toEqual([["fr"], ["de"]]);
  });

  it("reconnaît allemand, anglais et les exigences rédigées en allemand/anglais", () => {
    expect(extractLanguageRequirements("Deutschkenntnisse zwingend. Englisch wünschenswert.")).toEqual([
      expect.objectContaining({ languages: ["de"], importance: "required" }),
      expect.objectContaining({ languages: ["en"], importance: "preferred" }),
    ]);
    expect(assessLanguages("Business English required.", [{ name: "Anglais", level: "B2" }]).checks[0]).toMatchObject({ level: "Professionnel", status: "compatible" });
    expect(extractLanguageRequirements("Fließende Deutschkenntnisse erforderlich.")[0]).toMatchObject({ level: "Courant" });
  });

  it("conserve les alternatives qualifiées sans inventer un niveau commun", () => {
    expect(assessLanguages("Français courant ou allemand courant obligatoire.", [{ name: "Français", level: "C1" }]).checks).toEqual([
      expect.objectContaining({ languages: ["fr", "de"], level: "Courant", status: "compatible" }),
    ]);
    expect(assessLanguages("Français C1 ou allemand B2 obligatoire.", [{ name: "Allemand", level: "B2" }]).checks).toEqual([
      expect.objectContaining({ languages: ["fr", "de"], level: null, status: "unknown" }),
    ]);
    expect(extractLanguageRequirements("Français ou allemand souhaité.")[0]).toMatchObject({ languages: ["fr", "de"], importance: "preferred" });
  });

  it.each(["Allemand pas nécessaire.", "German not required.", "Deutsch ist nicht erforderlich.", "No German required.", "Allemand non obligatoire.", "German is not essential.", "Pas de connaissances en allemand requises.", "Nous n'exigeons pas d'allemand."])("ignore une exigence niée : %s", (description) => {
    expect(extractLanguageRequirements(description)).toEqual([]);
  });

  it("la connaissance déclarée sans niveau ne garantit pas B2 ; C2 ne signifie pas langue maternelle", () => {
    expect(assessLanguages("Allemand B2 obligatoire.", [{ name: "Allemand", level: null }]).checks[0].status).toBe("unknown");
    expect(assessLanguages("Français langue maternelle.", [{ name: "Français", level: "C2" }]).checks[0].status).toBe("unknown");
    expect(assessLanguages("Français suffisant.", [{ name: "Français", level: "C2" }]).checks[0].status).toBe("unknown");
    expect(assessLanguages("Allemand obligatoire.", null).checks[0].status).toBe("unknown");
  });

  it("retient la plus forte exigence répétée sans multiplier les écarts", () => {
    const result = extractLanguageRequirements("Allemand un atout. Allemand B1 requis. Allemand C1 obligatoire.");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ importance: "required", level: "C1" });
  });
});
