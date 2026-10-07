import { describe, expect, it } from "vitest";
import { extractWorkload, formatWorkload, stripWorkload } from "@/lib/workload";
import { scoreOffreLocal } from "@/lib/scoring/local";
import { formatLdSalary } from "@/lib/scrapers/dom";
import { getProfile, saveProfile } from "@/lib/db/queries";
import { ProfileFullSchema } from "@/lib/cv/types";
import { profile } from "./fixtures";

/**
 * Marché suisse hors sources : taux d'activité (extraction, score), salaire en CHF,
 * statut de travail enregistré dans le profil.
 */

describe("taux d'activité — extraction", () => {
  const w = (o: Parameters<typeof extractWorkload>[0]) => {
    const r = extractWorkload(o);
    return r ? formatWorkload(r) : null;
  };

  it("contrat et titre", () => {
    expect(w({ contract_type: "Durée indéterminée · 80 – 100 %" })).toBe("80 – 100 %");
    expect(w({ title: "Comptable 60-80%" })).toBe("60 – 80 %");
    expect(w({ title: "Netzwerk Ingenieur 100% (m/w/d)" })).toBe("100 %");
    expect(w({ title: "Comptable (80 bis 100 %)" })).toBe("80 – 100 %");
  });

  it("description : seulement après un mot-clé", () => {
    expect(w({ title: "Comptable", description_text: "Taux d'activité : 70%. Poste à Genève." })).toBe("70 %");
    expect(w({ title: "Buchhalter", description_text: "Pensum 80 - 100 %, Start nach Vereinbarung." })).toBe("80 – 100 %");
    expect(w({ title: "Comptable", description_text: "Une croissance de 20 % par an, 100 % télétravail possible." })).toBeNull();
  });

  it("« 100 % remote » dans un titre n'est pas un taux", () => {
    expect(w({ title: "Développeur 100% remote" })).toBeNull();
  });

  it("valeurs aberrantes ignorées", () => {
    expect(w({ title: "Commercial 5%" })).toBeNull();
    expect(w({ title: "Poste 100-60 %" })).toBeNull();
  });

  it("libellé de contrat sans le taux", () => {
    expect(stripWorkload("Durée indéterminée · 80 – 100 %")).toBe("Durée indéterminée");
    expect(stripWorkload("Durée déterminée · 100 %")).toBe("Durée déterminée");
    expect(stripWorkload("CDI")).toBe("CDI");
  });
});

describe("taux d'activité — score", () => {
  const offre = (contract_type: string) => ({
    title: "Responsable administratif",
    company: "Exemple SA",
    country: "Suisse",
    description_text: "Gestion administrative et suivi de projet.",
    contract_type,
  });
  const p = (range: [number, number] | null) => ({ ...profile, target_countries: ["Suisse"], workload_range: range });

  it("compatible : bonus ; hors fourchette : malus ; inconnu ou sans fourchette : neutre", () => {
    const ok = scoreOffreLocal(p([80, 100]), offre("Durée indéterminée · 80 – 100 %"));
    const low = scoreOffreLocal(p([80, 100]), offre("Durée indéterminée · 40 %"));
    const unknown = scoreOffreLocal(p([80, 100]), offre("Durée indéterminée"));
    const noPref = scoreOffreLocal(p(null), offre("Durée indéterminée · 40 %"));
    expect(ok.breakdown.workload).toBe(100);
    expect(low.breakdown.workload).toBe(0);
    expect(unknown.breakdown.workload).toBeNull();
    expect(noPref.breakdown.workload).toBeNull();
    expect(ok.score).toBeGreaterThan(unknown.score);
    expect(low.score).toBeLessThan(unknown.score);
    expect(noPref.score).toBe(unknown.score);
    expect(low.reason).toContain("taux 40 % hors souhait");
  });
});

describe("salaire JSON-LD", () => {
  it("fourchette CHF annuelle arrondie, montant unique, absent", () => {
    const chf = formatLdSalary({ currency: "CHF", value: { minValue: 77672.22, maxValue: 117672.22, unitText: "YEAR" } });
    expect(chf?.replace(/\s/g, " ")).toBe("77 672 – 117 672 CHF / an");
    expect(formatLdSalary({ currency: "EUR", value: { value: 3200, unitText: "MONTH" } })?.replace(/\s/g, " ")).toBe("3 200 EUR / mois");
    expect(formatLdSalary({ currency: "CHF", value: { "@type": "QuantitativeValue" } })).toBeNull();
    expect(formatLdSalary(undefined)).toBeNull();
  });
});

describe("profil — statut de travail et taux souhaité", () => {
  it("enregistrés puis relus", () => {
    const input = ProfileFullSchema.parse({ ...profile, work_permit: "g", workload_range: [80, 100] });
    saveProfile(input);
    const back = getProfile()!;
    expect(back.work_permit).toBe("g");
    expect(back.workload_range).toEqual([80, 100]);
  });

  it("valeurs par défaut et validation", () => {
    const parsed = ProfileFullSchema.parse({ ...profile });
    expect(parsed.work_permit).toBeNull();
    expect(parsed.workload_range).toBeNull();
    expect(ProfileFullSchema.safeParse({ ...profile, workload_range: [100, 60] }).success).toBe(false);
    expect(ProfileFullSchema.safeParse({ ...profile, work_permit: "x" }).success).toBe(false);
  });
});
