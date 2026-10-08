import { NextRequest, NextResponse } from "next/server";
import { clearScrapingProxyKey, publicScrapingProxyConfig, saveScrapingProxySettings } from "@/lib/scrapers/proxy-config";
import { verifyBrightData } from "@/lib/scrapers/source-fetch";
import { ZodError } from "zod";

export const runtime = "nodejs";
export const maxDuration = 210;

export async function GET() {
  return NextResponse.json(publicScrapingProxyConfig(), { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Paramètres Bright Data invalides." }, { status: 400 });
  const action = body.action ?? "save";
  if (!["save", "clear-key", "verify"].includes(action)) return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  try {
    if (action === "verify") {
      await verifyBrightData();
      return NextResponse.json({ ok: true, message: "Connexion Bright Data vérifiée (1 appel)." });
    }
    if (action === "clear-key") clearScrapingProxyKey();
    else {
      if (body.apiKey !== undefined && typeof body.apiKey !== "string") throw new Error("Clé API Bright Data invalide.");
      saveScrapingProxySettings(body, body.apiKey);
    }
    return NextResponse.json({ ok: true, ...publicScrapingProxyConfig() });
  } catch (e) {
    const error = e instanceof ZodError ? "Paramètres Bright Data invalides : vérifiez le mode, la zone, les sources et le plafond (1 à 100)." : e instanceof Error ? e.message : "Bright Data indisponible.";
    return NextResponse.json({ error }, { status: action === "verify" ? 502 : 400 });
  }
}
