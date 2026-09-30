import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contrastes WCAG 2.x calculés à partir des jetons RÉELS de app/globals.css,
 * en clair et en sombre. Échoue si une paire texte / fond passe sous 4,5:1 :
 * un jeton de couleur ne peut plus dériver sans que la CI le voie.
 */

const css = fs.readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf-8");

function block(selector: string): Record<string, string> {
  const i = css.indexOf(`${selector} {`);
  if (i < 0) throw new Error(`bloc ${selector} introuvable dans globals.css`);
  const body = css.slice(i, css.indexOf("\n}", i));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

type RGB = [number, number, number];

const hex = (h: string): RGB => {
  const m = /^#([0-9a-f]{6})$/i.exec(h.trim());
  if (!m) throw new Error(`couleur non hexadécimale : ${h}`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as RGB;
};
const rgba = (s: string): { c: RGB; a: number } => {
  const m = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?\s*\)$/.exec(s.trim());
  if (!m) throw new Error(`rgba illisible : ${s}`);
  return { c: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] };
};
const lin = (c: number) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: RGB, b: RGB) => {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const over = (fg: RGB, a: number, bg: RGB): RGB => fg.map((c, i) => c * a + bg[i] * (1 - a)) as RGB;

type Row = { theme: string; label: string; r: number; on: string };

function pairs(): Row[] {
  const themes = { clair: block(":root"), sombre: { ...block(":root"), ...block(".dark") } };
  const rows: Row[] = [];
  for (const [name, v] of Object.entries(themes)) {
    const col = (k: string) => hex(v[k]);
    const ink = (k: string) => (v[`${k}-ink`] ? col(`${k}-ink`) : col(k));
    const surface = col("surface");
    const hover = col("surface-hover");
    // Voile de carte (.glass-panel) : --glass-highlight posé sur la surface.
    const hl = rgba(v["glass-highlight"]);
    const bases: Record<string, RGB> = { page: col("bg"), carte: surface, "voile carte": over(hl.c, hl.a, surface) };
    const tint = (k: string, a: number, base: RGB) => over(col(k), a, base);
    const add = (label: string, fg: RGB, bg: RGB | ((b: RGB) => RGB), on = "") => {
      if (typeof bg !== "function") {
        rows.push({ theme: name, label, r: ratio(fg, bg), on });
        return;
      }
      // Pire cas parmi les fonds possibles.
      let worst: { r: number; on: string } | null = null;
      for (const [bn, b] of Object.entries(bases)) {
        const r = ratio(fg, bg(b));
        if (!worst || r < worst.r) worst = { r, on: bn };
      }
      rows.push({ theme: name, label, ...worst! });
    };
    const neutralTint = v["neutral-rgb"].split(/\s+/).map(Number) as RGB;
    add("bouton principal", col("on-accent"), col("accent"), "accent");
    add("bouton principal survolé", col("on-accent"), col("accent-hover"), "accent-hover");
    add("bouton danger", col("on-danger"), col("danger"), "danger");
    add("badge « Envoyée » / V.I.E", ink("accent"), (b) => tint("accent", 0.12, b));
    add("badge succès", ink("success"), (b) => tint("success", 0.12, b));
    add("badge avertissement", ink("warning"), (b) => tint("warning", 0.12, b));
    add("badge danger", ink("danger"), (b) => tint("danger", 0.12, b));
    add("badge neutre", col("text-secondary"), hover, "surface-hover");
    const soft = rgba(v["accent-soft"]);
    add("ligne d'offre sélectionnée (texte secondaire)", col("text-secondary"), (b) => over(soft.c, soft.a, b));
    add("pastille de score faible", col("neutral-ink"), (b) => over(neutralTint, 0.12, b));
    add("onglet de nav actif", ink("accent"), (b) => tint("accent", 0.105, b));
    add("lien sur survol", ink("accent"), hover, "surface-hover");
    add("texte secondaire sur survol", col("text-secondary"), hover, "surface-hover");
    add("text-success", ink("success"), (b) => b);
    add("text-warning", ink("warning"), (b) => b);
    add("text-danger", ink("danger"), (b) => b);
  }
  return rows;
}

describe("contrastes des jetons de couleur (WCAG AA)", () => {
  it("toutes les paires texte / fond atteignent 4,5:1, en clair et en sombre", () => {
    const rows = pairs();
    expect(rows.length).toBeGreaterThanOrEqual(30);
    const failing = rows.filter((r) => r.r < 4.5).map((r) => `${r.theme} · ${r.label} : ${r.r.toFixed(2)}:1 (${r.on})`);
    expect(failing).toEqual([]);
  });
});
