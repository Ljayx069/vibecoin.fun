import fs from "node:fs";
import path from "node:path";
import type { LaunchRecord } from "./validate";

const REGISTRY_PATH = "registry.json";
const DATA_DIR = path.join(process.cwd(), "data");

function blobEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function blob() {
  return import("@vercel/blob");
}

export async function readRegistry(): Promise<LaunchRecord[]> {
  if (blobEnabled()) {
    const { head } = await blob();
    try {
      const meta = await head(REGISTRY_PATH);
      const res = await fetch(meta.url, { cache: "no-store" });
      if (!res.ok) return [];
      const parsed = (await res.json()) as unknown;
      return Array.isArray(parsed) ? (parsed as LaunchRecord[]) : [];
    } catch {
      return []; // no registry blob yet
    }
  }
  const file = path.join(DATA_DIR, "registry.json");
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeRegistry(records: LaunchRecord[]): Promise<void> {
  const json = JSON.stringify(records, null, 2);
  if (blobEnabled()) {
    const { put } = await blob();
    await put(REGISTRY_PATH, json, {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
    });
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, "registry.json"), json);
}

export async function appendRegistry(rec: LaunchRecord): Promise<"created" | "duplicate"> {
  const all = await readRegistry();
  if (all.some((r) => r.mint === rec.mint)) return "duplicate";
  all.push(rec);
  await writeRegistry(all);
  return "created";
}

function extFor(contentType: string): string {
  return { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" }[contentType] ?? "bin";
}

export async function putImageBlob(id: string, bytes: Buffer, contentType: string): Promise<string> {
  const name = `images/${id}.${extFor(contentType)}`;
  if (blobEnabled()) {
    const { put } = await blob();
    const res = await put(name, bytes, { access: "public", contentType, addRandomSuffix: false, allowOverwrite: true });
    return res.url;
  }
  const dir = path.join(DATA_DIR, "images");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.${extFor(contentType)}`);
  fs.writeFileSync(file, bytes);
  return `file://${file}`;
}

export async function putMetadataBlob(id: string, json: object): Promise<string> {
  const name = `metadata/${id}.json`;
  const body = JSON.stringify(json, null, 2);
  if (blobEnabled()) {
    const { put } = await blob();
    const res = await put(name, body, {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return res.url;
  }
  const dir = path.join(DATA_DIR, "metadata");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.json`);
  fs.writeFileSync(file, body);
  return `file://${file}`;
}
