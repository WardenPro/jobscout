/**
 * Récupération d'un objet JSON dans une réponse de modèle imparfaite.
 *
 * Les fournisseurs n'honorent pas tous les sorties structurées de la même
 * façon : arguments d'outil en chaîne JSON, JSON entouré de texte ou de
 * balises ```json, bloc de réflexion <think>…</think> (modèles de raisonnement
 * locaux), sous-objets renvoyés sous forme de chaîne JSON (observé même avec
 * Opus sur `sections`). Ces fonctions sont pures et testées (tests/json-extract.test.ts).
 */

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
};

/** Retire les blocs de réflexion et les clôtures Markdown. */
export function stripNoise(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/```(?:json|JSON)?\s*/g, "")
    .replace(/```/g, "")
    .trim();
}

/**
 * Premier objet JSON équilibré trouvé dans le texte (les accolades à
 * l'intérieur des chaînes sont ignorées). Renvoie null si aucun n'est valide.
 */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const s = stripNoise(text);
  for (let start = s.indexOf("{"); start !== -1; start = s.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < s.length; i++) {
      const c = s[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          try {
            const v = JSON.parse(s.slice(start, i + 1));
            if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
          } catch {
            // objet mal formé : on tente l'accolade ouvrante suivante
          }
          break;
        }
      }
    }
  }
  return null;
}

/** Arguments d'appel de fonction : JSON direct, sinon extraction tolérante. */
export function parseToolArguments(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    // on retombe sur l'extraction tolérante
  }
  return extractJsonObject(raw);
}

const wants = (schema: JsonSchema | undefined, t: string): boolean => {
  const type = schema?.type;
  return Array.isArray(type) ? type.includes(t) : type === t;
};

/**
 * Remet en forme, d'après le schéma de l'outil, les sous-objets et tableaux que
 * le modèle a renvoyés sous forme de chaîne JSON. Ne crée ni ne supprime aucun
 * champ : la validation métier reste celle de l'appelant.
 */
export function coerceToSchema(value: unknown, schema: JsonSchema | undefined): unknown {
  if (!schema) return value;
  let v = value;
  if (typeof v === "string" && (wants(schema, "object") || wants(schema, "array"))) {
    const t = v.trim();
    if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
      try {
        v = JSON.parse(t);
      } catch {
        return value;
      }
    }
  }
  if (v && typeof v === "object" && !Array.isArray(v) && schema.properties) {
    const out: Record<string, unknown> = { ...(v as Record<string, unknown>) };
    for (const [k, sub] of Object.entries(schema.properties)) {
      if (k in out) out[k] = coerceToSchema(out[k], sub);
    }
    return out;
  }
  if (Array.isArray(v) && schema.items) return v.map((item) => coerceToSchema(item, schema.items));
  return v;
}
