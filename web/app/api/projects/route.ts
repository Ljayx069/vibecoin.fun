import { NextResponse } from "next/server";
import { fetchMarket } from "@/lib/market";
import { readRegistry } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const registry = await readRegistry();
  const projects = await Promise.all(
    registry.map(async (rec) => ({
      ...rec,
      market: await fetchMarket(rec.mint),
    })),
  );
  projects.sort((a, b) => (b.market?.marketCapUsd ?? 0) - (a.market?.marketCapUsd ?? 0));
  return NextResponse.json(
    { count: projects.length, projects },
    { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } },
  );
}
