import { NextRequest, NextResponse } from "next/server";
import { saveProfile, getProfile } from "@/lib/db/queries";
import { setSetting } from "@/lib/db";
import { ProfileFullSchema } from "@/lib/cv/types";
import { rescoreAllOffres } from "@/lib/scoring/rescore";
import { normalizePhoto } from "@/lib/cv/photo";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  return NextResponse.json({ profile: getProfile() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = ProfileFullSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Profil invalide", details: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.photo && parsed.data.photo !== getProfile()?.photo) {
    try {
      parsed.data.photo = await normalizePhoto(Buffer.from(parsed.data.photo.split(",")[1], "base64"));
    } catch {
      return NextResponse.json({ error: "Photo invalide — importez une nouvelle image." }, { status: 400 });
    }
  }
  const id = saveProfile(parsed.data);
  setSetting("has_completed_onboarding", "true");
  // Contrats, pays, taux d'activité… : les scores des offres déjà en base suivent le profil.
  const rescored = rescoreAllOffres(getProfile()!);
  return NextResponse.json({ id, ok: true, rescored });
}
