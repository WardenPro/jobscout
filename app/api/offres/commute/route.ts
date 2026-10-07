import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { calculateCommutes } from "@/lib/commute";
import { listOffres } from "@/lib/db/offres";
import { isSwissOffer } from "@/lib/work-permit";
import { CANTON_CODES, matchesCity, resolveSwissCanton } from "@/lib/swiss-geography";
import { getProfile } from "@/lib/db/queries";

export const runtime = "nodejs";
export const maxDuration = 120;
const Input = z.object({
  origin: z.string().trim().min(2).max(100),
  canton: z.string().refine(c => !c || CANTON_CODES.includes(c as typeof CANTON_CODES[number])).default(""),
  city: z.string().trim().max(100).default(""),
  consent: z.literal(true),
});
let running = false;

export async function POST(req: NextRequest) {
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Commune, filtres ou accord d'envoi des lieux invalides." }, { status: 400 });
  if (running) return NextResponse.json({ error: "Un calcul de trajets est déjà en cours." }, { status: 409 });
  running = true;
  try {
    const { origin, canton, city } = parsed.data;
    const locations = listOffres({ targetCountries: getProfile()?.target_countries ?? [] }).filter(o => isSwissOffer(o.country) &&
      (!canton || resolveSwissCanton(o.canton, o.location) === canton) &&
      matchesCity(o.location, city))
      .map(o => o.location).filter((place): place is string => !!place);
    const result = await calculateCommutes(origin, locations);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Calcul des trajets indisponible." }, { status: 503 });
  } finally {
    running = false;
  }
}
