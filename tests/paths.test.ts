import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { envPath, homePath } from "@/lib/paths";

describe("chemins du poste (envPath, homePath)", () => {
  const saved = process.env.JOBSCOUT_TEST_PATH;
  afterEach(() => {
    if (saved === undefined) delete process.env.JOBSCOUT_TEST_PATH;
    else process.env.JOBSCOUT_TEST_PATH = saved;
  });

  it("envPath : valeur non vide, sinon undefined", () => {
    process.env.JOBSCOUT_TEST_PATH = "C:\\exemple";
    expect(envPath("JOBSCOUT_TEST_PATH")).toBe("C:\\exemple");
    process.env.JOBSCOUT_TEST_PATH = "   ";
    expect(envPath("JOBSCOUT_TEST_PATH")).toBeUndefined();
    delete process.env.JOBSCOUT_TEST_PATH;
    expect(envPath("JOBSCOUT_TEST_PATH")).toBeUndefined();
  });

  it("homePath : dossier personnel suivi des segments", () => {
    expect(homePath("AppData", "Local")).toBe(path.join(os.homedir(), "AppData", "Local"));
    expect(homePath()).toBe(path.join(os.homedir()));
  });
});

/**
 * Garde-fou du build : le traceur de fichiers de Next évalue au build
 * `process.env.<chemin>` et `os.homedir()`, puis parcourt le dossier obtenu.
 * Projet et profil sur deux lecteurs (runner Windows de la CI, projet sur D:)
 * ⇒ `next build` plante (EPERM sur « Application Data »). Ces lectures doivent
 * passer par envPath() / homePath() de lib/paths.ts.
 */
describe("aucun chemin du poste évaluable au build", () => {
  const root = process.cwd();
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|mts)$/.test(entry.name)) files.push(full);
    }
  };
  for (const dir of ["app", "components", "lib"]) walk(path.join(root, dir));
  files.push(path.join(root, "middleware.ts"));

  it("ni os.homedir() ni process.env.<dossier du poste> hors de lib/paths.ts", () => {
    const pattern = /os\.homedir\s*\(|process\.env\.(LOCALAPPDATA|APPDATA|USERPROFILE|HOME|HOMEPATH|TEMP|TMP|XDG_[A-Z_]+)\b/;
    const offenders = files
      .filter((f) => path.relative(root, f) !== path.join("lib", "paths.ts"))
      .filter((f) => pattern.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(root, f));
    expect(files.length).toBeGreaterThan(50);
    expect(offenders).toEqual([]);
  });
});
