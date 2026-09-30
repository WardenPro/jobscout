import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Base SQLite propre à chaque fichier de test (jamais la base de l'utilisateur).
process.env.JOBSCOUT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "jobscout-test-"));

// Aucune clé ni URL réelle ne doit être utilisée par les tests : un appel payant
// ou une clé du poste qui partirait vers un faux serveur serait un bug.
for (const k of [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "JOBSCOUT_PROXY_URL",
  "JOBSCOUT_ANTHROPIC_BASE_URL",
  "JOBSCOUT_MODEL_OPUS",
  "JOBSCOUT_MODEL_SONNET",
]) {
  delete process.env[k];
}
