import { NextRequest, NextResponse } from "next/server";
import { appendRegistry, readRegistry } from "@/lib/store";
import { validateLaunch } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function GET() {
  const registry = await readRegistry();
  return NextResponse.json({ count: registry.length, launches: registry });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  try {
    const rec = validateLaunch(body);
    const outcome = await appendRegistry({ ...rec, description: rec.description.slice(0, 1200) });
    if (outcome === "duplicate") {
      return NextResponse.json({ ok: true, note: "mint already registered" }, { status: 409 });
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "invalid payload";
    return NextResponse.json({ error: msg.slice(0, 500) }, { status: 400 });
  }
}
