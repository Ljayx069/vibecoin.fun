import { describe, expect, it } from "vitest";
import { fmtPrice, fmtUsd, truncate } from "../lib/format";
import { validateLaunch, validateMetadata } from "../lib/validate";

describe("format", () => {
  it("formats usd magnitudes", () => {
    expect(fmtUsd(1234567)).toBe("$1.23M");
    expect(fmtUsd(45600)).toBe("$45.6K");
    expect(fmtUsd(undefined)).toBe("—");
  });
  it("formats adaptive prices", () => {
    expect(fmtPrice(0.0000001)).toBe("<$0.000001");
    expect(fmtPrice(0.00123)).toBe("$0.00123");
    expect(fmtPrice(0.5)).toBe("$0.5000");
    expect(fmtPrice(12.3456)).toBe("$12.35");
  });
  it("truncates", () => {
    expect(truncate("hello", 10)).toBe("hello");
    expect(truncate("a".repeat(70), 10)).toHaveLength(10);
  });
});

describe("validate", () => {
  const valid = {
    mint: "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump",
    name: "Test",
    symbol: "TEST",
    description: "d",
    creator: "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS",
    signature: "sig",
    createdAt: "2026-07-29T00:00:00.000Z",
  };

  it("accepts a valid launch record", () => {
    expect(validateLaunch(valid).mint).toBe(valid.mint);
  });
  it("rejects a bad mint", () => {
    expect(() => validateLaunch({ ...valid, mint: "not-a-mint" })).toThrow();
  });
  it("accepts a robinhood (EVM) launch record with links and pair", () => {
    const rec = validateLaunch({
      ...valid,
      mint: "0x449BEE1B8344428EC25617d405f22C21410B4fe4",
      creator: "0xd14F2662a9df0e6E15c14882348Ac621da84e099",
      chain: "robinhood",
      pair: "NVDA",
      twitter: "https://x.com/test",
      telegram: "@test",
    });
    expect(rec.chain).toBe("robinhood");
    expect(rec.pair).toBe("NVDA");
    expect(rec.twitter).toBe("https://x.com/test");
  });
  it("rejects an invalid chain value", () => {
    expect(() => validateLaunch({ ...valid, chain: "ethereum" })).toThrow();
  });
  it("rejects javascript: urls", () => {
    expect(() => validateLaunch({ ...valid, website: "javascript:alert(1)" })).toThrow();
  });
  it("requires imageContentType with imageBase64", () => {
    expect(() =>
      validateMetadata({ name: "T", symbol: "T", description: "d", imageBase64: "aGk=" }),
    ).toThrow(/imageContentType/);
    expect(
      validateMetadata({ name: "T", symbol: "T", description: "d", imageBase64: "aGk=", imageContentType: "image/png" })
        .imageContentType,
    ).toBe("image/png");
  });
});
