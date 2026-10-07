import { NextRequest, NextResponse } from "next/server";
import { CONTRACT_ORDER, type ContractCategory } from "@/lib/contracts";
import { parseMinScore, searchOffres, type OffersSort } from "@/lib/db/offres";
import { normalizeCanton } from "@/lib/swiss-geography";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const allowedContracts = new Set<string>(CONTRACT_ORDER);
  const contracts = (params.get("contracts") ?? "").split(",")
    .filter((value): value is ContractCategory => allowedContracts.has(value));
  const sort = params.get("sort");
  const sortBy: OffersSort = sort === "newest" || sort === "oldest" || sort === "score" ? sort : "smart";
  const page = Number(params.get("page") ?? "1");
  const rawCanton = (params.get("canton") ?? "").trim();
  const canton = normalizeCanton(rawCanton);
  if (rawCanton && !canton) return NextResponse.json({ error: "Canton suisse invalide." }, { status: 400 });
  const origin = (params.get("origin") ?? "").trim();
  const maxMinutes = Number(params.get("maxMinutes"));
  if (origin && (origin.length < 2 || origin.length > 100 || !Number.isInteger(maxMinutes) || maxMinutes < 1 || maxMinutes > 240)) {
    return NextResponse.json({ error: "Commune ou durée maximale invalide." }, { status: 400 });
  }
  const result = searchOffres({
    query: (params.get("q") ?? "").slice(0, 200),
    source: params.get("source") ?? "",
    country: params.get("country") ?? "",
    canton: canton ?? undefined,
    city: (params.get("city") ?? "").slice(0, 100),
    commute: origin ? { origin, maxMinutes, includeUnknown: params.get("includeUnknown") !== "0" } : undefined,
    contracts,
    minScore: parseMinScore(params.get("minScore")),
    // ?vie=1 (lien de l'accueil) : même règle que la puce contrat « V.I.E ».
    vieOnly: params.get("vie") === "1",
    sortBy,
    page: Number.isFinite(page) ? page : 1,
  });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
