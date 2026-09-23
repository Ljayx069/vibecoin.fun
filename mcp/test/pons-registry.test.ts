import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toFunctionSelector } from "viem";
import { PONS, buildClaimFeesTx } from "../src/pons.js";
import { listPonsLaunches, recordPonsLaunch, type PonsLaunchRecord } from "../src/registry.js";

let home: string;
let oldHome: string | undefined;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "vibecoin-pons-reg-"));
  oldHome = process.env.VIBECOIN_HOME;
  process.env.VIBECOIN_HOME = home;
});

afterEach(() => {
  if (oldHome === undefined) delete process.env.VIBECOIN_HOME;
  else process.env.VIBECOIN_HOME = oldHome;
  fs.rmSync(home, { recursive: true, force: true });
});

const REC: PonsLaunchRecord = {
  chain: "robinhood",
  token: "0x00000000000000000000000000000000000000aa",
  curve: "0x00000000000000000000000000000000000000bb",
  name: "Vibe Coin",
  symbol: "VIBE",
  pair: "ETH",
  pairToken: "0x0000000000000000000000000000000000000000",
  creatorTaxBps: 100,
  buyback: false,
  creator: "0x00000000000000000000000000000000000000cc",
  wallet: "proj",
  signature: "0xdead",
  createdAt: "2026-09-23T00:00:00.000Z",
};

describe("pons launch registry", () => {
  it("roundtrips a launch record", () => {
    expect(listPonsLaunches()).toEqual([]);
    recordPonsLaunch(REC);
    expect(listPonsLaunches()).toEqual([REC]);
    const raw = JSON.parse(fs.readFileSync(path.join(home, "pons-launches.json"), "utf8"));
    expect(raw[0].token).toBe(REC.token);
  });

  it("re-recording the same token replaces, never duplicates", () => {
    recordPonsLaunch(REC);
    recordPonsLaunch({ ...REC, symbol: "VIBE2" });
    recordPonsLaunch({ ...REC, token: REC.token.toUpperCase().replace("0X", "0x") });
    const all = listPonsLaunches();
    expect(all).toHaveLength(1);
    // last write wins: the uppercase-address record replaced everything before it
    expect(all[0]!.symbol).toBe("VIBE");
    expect(all[0]!.token).toBe(REC.token.toUpperCase().replace("0X", "0x"));
  });

  it("keeps records for different tokens", () => {
    recordPonsLaunch(REC);
    recordPonsLaunch({ ...REC, token: "0x00000000000000000000000000000000000000dd" });
    expect(listPonsLaunches()).toHaveLength(2);
  });
});

describe("fee claim transactions", () => {
  it("buildClaimFeesTx claims native ETH from the escrow", () => {
    const tx = buildClaimFeesTx();
    expect(tx.to).toBe(PONS.feeEscrow);
    expect(tx.value).toBe(0n);
    expect(tx.data).toBe(toFunctionSelector("claim()"));
  });

  it("buildClaimFeesTx claims an ERC-20 quote asset", () => {
    const asset = "0x00000000000000000000000000000000000000ee" as const;
    const tx = buildClaimFeesTx(asset);
    expect(tx.data.startsWith(toFunctionSelector("claimToken(address)"))).toBe(true);
    expect(tx.data).toContain(asset.slice(2));
  });
});
