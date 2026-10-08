import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";

const schema = fs.readFileSync(path.join(process.cwd(), "lib/db/schema.sql"), "utf8");
let directory: string;
let database: DatabaseSync | undefined;

afterEach(() => {
  database?.close();
  database = undefined;
  vi.unstubAllEnvs();
  vi.resetModules();
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
});

async function openApplicationDatabase() {
  vi.resetModules();
  const { getDb } = await import("@/lib/db");
  database = getDb();
  return database;
}

function isolateDatabase() {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "jobscout-migration-"));
  const filename = path.join(directory, "nested", "jobscout.db");
  vi.stubEnv("JOBSCOUT_DB_PATH", filename);
  return filename;
}

function columns(db: DatabaseSync, table: string) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name);
}

describe("installation et mise à niveau de la base", () => {
  it("crée une base vierge complète dans un dossier absent", async () => {
    const filename = isolateDatabase();
    expect(fs.existsSync(filename)).toBe(false);
    const db = await openApplicationDatabase();
    expect(fs.existsSync(filename)).toBe(true);
    expect(columns(db, "profile")).toEqual(expect.arrayContaining(["work_permit", "workload_range", "photo"]));
    expect(columns(db, "offres")).toContain("canton");
    for (const table of ["profile", "offres", "documents", "commute_geocodes", "commute_routes", "commute_failures"]) {
      expect(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n).toBe(0);
    }
    expect(db.prepare("PRAGMA foreign_keys").get()?.foreign_keys).toBe(1);
    expect(db.prepare("PRAGMA integrity_check").get()?.integrity_check).toBe("ok");
  });

  it("conserve les données d'une base antérieure puis supporte un deuxième démarrage", async () => {
    const filename = isolateDatabase();
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    // État avant les ajouts suisses et la photo ; toutes les tables historiques restent présentes.
    const legacySchema = schema
      .replace(/^  (?:photo|work_permit|workload_range|canton) TEXT,\r?\n/gm, "")
      .replace(/^  preferred_contracts TEXT[^\n]*\n/m, "")
      .replace(/CREATE TABLE IF NOT EXISTS commute_\w+ \([\s\S]*?\);/g, "");
    const legacy = new DatabaseSync(filename);
    legacy.exec(legacySchema);
    legacy.exec(`
      INSERT INTO profile(id, full_name, sectors, sources_enabled) VALUES (1, 'Candidat de test', '["informatique"]', '["jobup"]');
      INSERT INTO experiences(profile_id, title, company) VALUES (1, 'Technicien', 'Entreprise de test');
      INSERT INTO offres(id, source, source_id, url, title, company, country, description_html, description_text)
        VALUES (1, 'jobup', 'migration-test', 'https://example.org/job', 'Technicien', 'Entreprise de test', 'Suisse', '', 'Description conservée');
      INSERT INTO documents(type, offre_id, file_path, format) VALUES ('cv', 1, 'documents/test.pdf', 'pdf');
      INSERT INTO settings(key, value) VALUES ('migration-test', 'conservé');
    `);
    legacy.close();

    for (let startup = 0; startup < 2; startup++) {
      const db = await openApplicationDatabase();
      expect(db.prepare("SELECT * FROM profile WHERE id = 1").get()).toMatchObject({
        full_name: "Candidat de test", sectors: '["informatique"]', sources_enabled: '["jobup"]',
        preferred_contracts: '["cdi","cdd"]', work_permit: null, workload_range: null, photo: null,
      });
      expect(db.prepare("SELECT title FROM experiences WHERE profile_id = 1").get()?.title).toBe("Technicien");
      expect(db.prepare("SELECT description_text, canton FROM offres WHERE id = 1").get()).toMatchObject({ description_text: "Description conservée", canton: null });
      expect(db.prepare("SELECT file_path FROM documents WHERE offre_id = 1").get()?.file_path).toBe("documents/test.pdf");
      expect(db.prepare("SELECT value FROM settings WHERE key = 'migration-test'").get()?.value).toBe("conservé");
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(db.prepare("PRAGMA integrity_check").get()?.integrity_check).toBe("ok");
      db.close();
      database = undefined;
    }
  });
});
