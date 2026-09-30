import { NextRequest, NextResponse } from "next/server";
import { CONTRACT_ORDER, type ContractCategory } from "@/lib/contracts";
import { searchOffres } from "@/lib/db/offres";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const allowedContracts = new Set<string>(CONTRACT_ORDER);
  const contracts = (params.get("contracts") ?? "").split(",")
    .filter((value): value is ContractCategory => allowedContracts.has(value));
  const sort = params.get("sort");
  const sortBy = sort === "newest" || sort === "score" ? sort : "smart";
  const page = Number(params.get("page") ?? "1");
  const result = searchOffres({
    query: (params.get("q") ?? "").slice(0, 200),
    source: params.get("source") ?? "",
    country: params.get("country") ?? "",
    contracts,
    minScore: params.get("minScore") === "1",
    vieOnly: params.get("vie") === "1",
    sortBy,
    page: Number.isFinite(page) ? page : 1,
  });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
