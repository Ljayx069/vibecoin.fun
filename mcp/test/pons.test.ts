import { describe, expect, it } from "vitest";
import { toFunctionSelector } from "viem";
import {
  BASIS_POINTS,
  PHASE_NAMES,
  PONS,
  buildSetBuybackTx,
  buildTransferRecipientTx,
  getAmountIn,
  getAmountOut,
  openingCurveState,
  previewEconomics,
  quoteBuy,
  resolvePairToken,
  saltFor,
  validateLaunch,
  withSlippage,
  type LaunchContext,
  type LaunchIntent,
  type PairToken,
} from "../src/pons.js";

const ETH_PAIR: PairToken = {
  address: "0x0000000000000000000000000000000000000000",
  symbol: "ETH",
  name: "Native ETH",
  decimals: 18,
  native: true,
  phantomQuote: 4_200_000_000_000_000_000n, // 4.2
  graduationThreshold: 4_200_000_000_000_000_000n,
  expectedDecimals: 18,
};

const CONTEXT: LaunchContext = {
  configId: 0n,
  config: {
    supply: 1_000_000_000n,
    curveFeeBps: 100n,
    phantomQuote: 4_200_000_000_000_000_000n,
    graduationThreshold: 4_200_000_000_000_000_000n,
    poolFee: 100,
    tickSpacing: 60,
    enabled: true,
  },
  policy: {
    protocolFeeRecipient: "0x0000000000000000000000000000000000000001",
    protocolFeeShareBps: 500,
    buybackBurnBps: 500,
    hookFeeBps: 100,
    maxInternalPriceImpactBps: 2000,
  },
  launchFee: 500_000_000_000_000n, // 0.0005 ETH
  launchEnabled: true,
  canLaunch: true,
  maxCreatorTaxBps: 1000n,
  snipeTaxStartBps: 9900n,
  snipeTaxSeconds: 3n,
  economics: "0x1234",
  launchDeployer: "0x0000000000000000000000000000000000000002",
  launchForwarder: "0x0000000000000000000000000000000000000003",
};

function intent(overrides: Partial<LaunchIntent> = {}): LaunchIntent {
  return {
    params: {
      name: "Vibe Coin",
      symbol: "VIBE",
      logo: "",
      description: "test",
      socials: { twitter: "", telegram: "", discord: "", website: "", farcaster: "" },
      creatorFeeRecipient: "0x00000000000000000000000000000000000000aa",
      creatorTaxBps: 0,
      buybackEnabled: false,
      expectedEconomics: "0x1234",
      salt: saltFor("Vibe Coin", "VIBE"),
    },
    configId: 0n,
    pair: ETH_PAIR,
    devBuy: 0n,
    slippageBps: 500n,
    recipient: "0x00000000000000000000000000000000000000aa",
    ...overrides,
  };
}

describe("getAmountOut", () => {
  it("matches the constant-product formula with truncation", () => {
    // (100 * 10000) * 5000 / (10000 * 10000 + 100 * 10000) = 5e9/1.01e8 = 49
    expect(getAmountOut(100n, 10_000n, 5_000n, 0n)).toBe(49n);
  });

  it("applies the fee on the input", () => {
    // fee 100bps: effective input 99 → 99*5000/(10000+99) = 49
    expect(getAmountOut(100n, 10_000n, 5_000n, 100n)).toBe(49n);
  });

  it("rejects empty input and drained liquidity", () => {
    expect(() => getAmountOut(0n, 1n, 1n, 0n)).toThrow();
    expect(() => getAmountOut(1n, 0n, 1n, 0n)).toThrow();
    expect(() => getAmountOut(1n, 1n, 1n, 0n)).toThrow(); // zero output
  });
});

describe("getAmountIn", () => {
  it("rounds up so the output is achievable", () => {
    const out = 497n;
    const inn = getAmountIn(out, 10_000n, 5_000n, 0n);
    expect(getAmountOut(inn, 10_000n, 5_000n, 0n)).toBeGreaterThanOrEqual(out);
    expect(getAmountOut(inn - 1n, 10_000n, 5_000n, 0n)).toBeLessThan(out);
  });
});

describe("quoteBuy", () => {
  const state = openingCurveState(CONTEXT.config, ETH_PAIR, 0);

  it("matches a hand-computed constant-product buy", () => {
    // reserveIn = phantomQuote, reserveOut = supply, 100 bps (1%) curve fee off input
    const offered = 1_000_000_000_000_000_000n; // 1 ETH
    const net = offered - (offered * 100n) / BASIS_POINTS; // 0.99
    const expected = (net * 1_000_000_000n) / (ETH_PAIR.phantomQuote + net);
    const q = quoteBuy(state, offered);
    expect(q.tokensOut).toBe(expected);
    expect(q.spent).toBe(offered);
    expect(q.clamped).toBe(false);
  });

  it("clamps a buy larger than the sellable allocation and refunds the rest", () => {
    const huge = 100_000_000_000_000_000_000n; // 100 ETH
    const q = quoteBuy(state, huge);
    const sellable = CONTEXT.config.supply - state.reservedTokens;
    expect(q.tokensOut).toBe(sellable);
    expect(q.clamped).toBe(true);
    expect(q.spent).toBeLessThan(huge);
    expect(q.refund).toBe(huge - q.spent);
  });

  it("rejects a non-positive buy", () => {
    expect(() => quoteBuy(state, 0n)).toThrow();
  });
});

describe("validateLaunch", () => {
  it("accepts a minimal valid launch", () => {
    expect(() => validateLaunch(intent(), CONTEXT)).not.toThrow();
  });

  it("rejects empty name or symbol", () => {
    expect(() => validateLaunch(intent({ params: { ...intent().params, name: "  " } }), CONTEXT)).toThrow(/name/);
    expect(() => validateLaunch(intent({ params: { ...intent().params, symbol: "" } }), CONTEXT)).toThrow(/symbol/);
  });

  it("rejects overlong metadata in bytes, not characters", () => {
    const long = "é".repeat(33); // 66 bytes, 33 chars — over the 64-byte name cap
    expect(() => validateLaunch(intent({ params: { ...intent().params, name: long } }), CONTEXT)).toThrow(/bytes/);
  });

  it("rejects a creator tax above the factory cap", () => {
    expect(() =>
      validateLaunch(intent({ params: { ...intent().params, creatorTaxBps: 2000 } }), CONTEXT),
    ).toThrow(/caps it at 1000/);
  });

  it("rejects when combined fees exceed the ceiling", () => {
    // with the factory cap raised, 100 bps curve fee + 1901 bps creator tax > 2000 bps
    const loose = { ...CONTEXT, maxCreatorTaxBps: 2000n };
    expect(() =>
      validateLaunch(intent({ params: { ...intent().params, creatorTaxBps: 1901 } }), loose),
    ).toThrow(/exceeds the 2000 bps/);
  });

  it("rejects when the account cannot launch", () => {
    expect(() => validateLaunch(intent(), { ...CONTEXT, canLaunch: false })).toThrow(/disabled/);
    expect(() =>
      validateLaunch(intent(), { ...CONTEXT, config: { ...CONTEXT.config, enabled: false } }),
    ).toThrow(/disabled/);
  });

  it("rejects a non-native pair whose decimals drifted from the factory's peg", () => {
    const stock: PairToken = { ...ETH_PAIR, native: false, address: "0x00000000000000000000000000000000000000bb", symbol: "NVDA", decimals: 8, expectedDecimals: 18 };
    expect(() => validateLaunch(intent({ pair: stock }), CONTEXT)).toThrow(/decimals/);
  });
});

describe("resolvePairToken", () => {
  const pairs: PairToken[] = [
    ETH_PAIR,
    { ...ETH_PAIR, native: false, address: "0x00000000000000000000000000000000000000bb", symbol: "NVDA", name: "NVIDIA" },
  ];

  it("resolves the native default by symbol", () => {
    expect(resolvePairToken(pairs, "eth").native).toBe(true);
  });

  it("resolves a stock pair by symbol case-insensitively", () => {
    expect(resolvePairToken(pairs, "nvda").symbol).toBe("NVDA");
  });

  it("resolves by address and rejects unknown assets", () => {
    expect(resolvePairToken(pairs, "0x00000000000000000000000000000000000000BB").symbol).toBe("NVDA");
    expect(() => resolvePairToken(pairs, "DOGE")).toThrow(/no approved quote asset/);
    expect(() => resolvePairToken(pairs, "0x00000000000000000000000000000000000000cc")).toThrow(/not an approved/);
  });
});

describe("previewEconomics", () => {
  it("costs exactly the launch fee with no dev buy", () => {
    const e = previewEconomics(intent(), CONTEXT);
    expect(e.launchFee).toBe(CONTEXT.launchFee);
    expect(e.value).toBe(CONTEXT.launchFee);
    expect(e.tokensOut).toBe(0n);
  });

  it("adds the dev buy to msg.value on a native pair", () => {
    const dev = 1_000_000_000_000_000_000n;
    const e = previewEconomics(intent({ devBuy: dev }), CONTEXT);
    expect(e.value).toBe(CONTEXT.launchFee + dev);
    expect(e.tokensOut).toBeGreaterThan(0n);
    expect(e.minTokensOut).toBe(withSlippage(e.tokensOut, 500n));
  });

  it("carries only the fee as value on an ERC-20 pair (buy rides transferFrom)", () => {
    const stock: PairToken = { ...ETH_PAIR, native: false, address: "0x00000000000000000000000000000000000000bb", symbol: "NVDA" };
    const e = previewEconomics(intent({ pair: stock }), CONTEXT);
    expect(e.value).toBe(CONTEXT.launchFee);
  });
});

describe("saltFor", () => {
  it("is deterministic and distinct per launch terms", () => {
    expect(saltFor("A", "A")).toBe(saltFor("A", "A"));
    expect(saltFor("A", "A")).not.toBe(saltFor("A", "B"));
    expect(saltFor("A", "A", "1")).not.toBe(saltFor("A", "A", "2"));
    expect(saltFor("A", "A")).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("fee management transactions", () => {
  const token = "0x00000000000000000000000000000000000000cc" as const;
  const recipient = "0x00000000000000000000000000000000000000dd" as const;

  it("buildTransferRecipientTx targets the factory with the right calldata", () => {
    const tx = buildTransferRecipientTx(token, recipient);
    expect(tx.to).toBe(PONS.v2Factory);
    expect(tx.value).toBe(0n);
    expect(tx.data.startsWith(toFunctionSelector("transferCreatorFeeRecipient(address,address)"))).toBe(true);
    expect(tx.data).toContain(token.slice(2));
    expect(tx.data).toContain(recipient.slice(2));
  });

  it("buildSetBuybackTx encodes the enable/disable flag", () => {
    const on = buildSetBuybackTx(token, true);
    const off = buildSetBuybackTx(token, false);
    expect(on.to).toBe(PONS.v2Factory);
    expect(on.data.startsWith(toFunctionSelector("setBuybackEnabled(address,bool)"))).toBe(true);
    expect(on.data.endsWith("1".padStart(64, "0"))).toBe(true);
    expect(off.data.endsWith("0".repeat(64))).toBe(true);
  });

  it("phase names cover the on-chain enum", () => {
    expect(PHASE_NAMES).toHaveLength(4);
    expect(PHASE_NAMES[0]).toContain("not graduated");
    expect(PHASE_NAMES[2]).toContain("V4");
  });
});
