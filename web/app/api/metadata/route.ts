import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { putImageBlob, putMetadataBlob } from "@/lib/store";
import { MAX_IMAGE_BYTES, validateMetadata } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Light per-instance rate limit — enough to stop copy-paste abuse of the free endpoint.
const hits = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > MAX_PER_WINDOW;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "rate limit: max 10 uploads/minute — retry shortly" }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  try {
    const meta = validateMetadata(body);
    const id = crypto.randomBytes(8).toString("hex");
    let imageUri: string | undefined;
    if (meta.imageBase64 && meta.imageContentType) {
      const bytes = Buffer.from(meta.imageBase64, "base64");
      if (bytes.byteLength > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "image exceeds the 1.5MB limit" }, { status: 400 });
      }
      imageUri = await putImageBlob(id, bytes, meta.imageContentType);
    }
    const metadataJson = {
      name: meta.name,
      symbol: meta.symbol,
      description: meta.description,
      ...(imageUri ? { image: imageUri } : {}),
      ...(meta.website ? { website: meta.website } : {}),
      ...(meta.twitter ? { twitter: meta.twitter } : {}),
      ...(meta.telegram ? { telegram: meta.telegram } : {}),
      showName: "true",
      createdOn: "https://vibecoin.fun",
    };
    const metadataUri = await putMetadataBlob(id, metadataJson);
    if (metadataUri.startsWith("file://")) {
      // Local-dev fallback wrote to disk; a file:// URI can't go on-chain.
      return NextResponse.json(
        { metadataUri, imageUri, warning: "local fallback store — configure BLOB_READ_WRITE_TOKEN in production" },
        { status: 201 },
      );
    }
    return NextResponse.json({ metadataUri, imageUri }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "invalid payload";
    return NextResponse.json({ error: msg.slice(0, 500) }, { status: 400 });
  }
}
