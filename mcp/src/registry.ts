import fs from "node:fs";
import path from "node:path";
import { ENDPOINTS, LAUNCHES_FILE, VIBECOIN_HOME } from "./config.js";
import { fetchWithFallback } from "./pumpportal.js";

export interface LaunchRecord {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  image?: string;
  github?: string;
  website?: string;
  creator: string;
  wallet: string;
  signature: string;
  createdAt: string;
}

export function listLaunches(): LaunchRecord[] {
  const file = LAUNCHES_FILE();
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? (parsed as LaunchRecord[]) : [];
  } catch {
    return [];
  }
}

export function recordLaunch(rec: LaunchRecord): void {
  fs.mkdirSync(VIBECOIN_HOME(), { recursive: true, mode: 0o700 });
  const all = listLaunches().filter((r) => r.mint !== rec.mint);
  all.push(rec);
  fs.writeFileSync(LAUNCHES_FILE(), JSON.stringify(all, null, 2), { mode: 0o600 });
}

/** Best-effort publish to the vibecoin.fun /projects registry. Never throws. */
export async function postToSiteRegistry(rec: LaunchRecord): Promise<{ ok: boolean; note?: string }> {
  try {
    const res = await fetchWithFallback(ENDPOINTS.registry, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rec),
    });
    if (res.status === 201 || res.ok) return { ok: true };
    if (res.status === 409) return { ok: true, note: "already registered" };
    return { ok: false, note: `registry responded ${res.status} — your launch is still recorded locally` };
  } catch (e) {
    return {
      ok: false,
      note: `registry unreachable (${e instanceof Error ? e.message : "error"}) — your launch is still recorded locally`,
    };
  }
}

// ---- Pons (Robinhood Chain) launch records ----
// Kept in their own file: LaunchRecord is mint-shaped and drives the
// vibecoin.fun site registry, which is pump.fun-only.

export interface PonsLaunchRecord {
  chain: "robinhood";
  token: string;
  curve: string;
  name: string;
  symbol: string;
  /** Quote asset the launch was priced in ("ETH" for native). */
  pair: string;
  /** Quote asset address (zero address = native ETH). */
  pairToken: string;
  creatorTaxBps: number;
  buyback: boolean;
  creator: string;
  wallet: string;
  signature: string;
  createdAt: string;
}

function PONS_LAUNCHES_FILE(): string {
  return path.join(VIBECOIN_HOME(), "pons-launches.json");
}

export function listPonsLaunches(): PonsLaunchRecord[] {
  const file = PONS_LAUNCHES_FILE();
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? (parsed as PonsLaunchRecord[]) : [];
  } catch {
    return [];
  }
}

export function recordPonsLaunch(rec: PonsLaunchRecord): void {
  fs.mkdirSync(VIBECOIN_HOME(), { recursive: true, mode: 0o700 });
  const all = listPonsLaunches().filter((r) => r.token.toLowerCase() !== rec.token.toLowerCase());
  all.push(rec);
  fs.writeFileSync(PONS_LAUNCHES_FILE(), JSON.stringify(all, null, 2), { mode: 0o600 });
}
