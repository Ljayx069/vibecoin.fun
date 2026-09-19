import { formatUnits } from "viem";
import { z } from "zod";
import { getPublicClient } from "../evmchain.js";
import { readPairTokens } from "../pons.js";
import { errText, text } from "./common.js";

export const ponsPairsTool = {
  name: "pons_pairs",
  description:
    "List the quote assets a Pons launch on Robinhood Chain may be priced in, read live from the factory. " +
    "Native ETH plus the approved ERC-20s — tokenized equities (stock pairs), index funds and stablecoins. " +
    "Also returns each pair's graduation threshold and phantom liquidity, and each token's decimals. " +
    "Pass one of these symbols (or addresses) as `pair` to pons_launch.",
  schema: {
    config_id: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Launch config id (default 0). Only matters if the protocol adds more configs"),
  },
  async handler(args: { config_id?: number }) {
    try {
      const client = getPublicClient();
      const tokens = await readPairTokens(client, BigInt(args.config_id ?? 0));
      const rows = tokens.map((t) => {
        const threshold = formatUnits(t.graduationThreshold, t.decimals);
        const phantom = formatUnits(t.phantomQuote, t.decimals);
        return `| ${t.native ? "ETH (native)" : t.symbol} | ${t.name} | ${t.address} | ${t.decimals} | ${threshold} | ${phantom} |`;
      });
      return text(`## Pons approved quote assets (Robinhood Chain, live from the factory)

| pair | name | address | decimals | graduation threshold | phantom liquidity |
|---|---|---|---|---|---|
${rows.join("\n")}

- Native ETH needs no approval; every ERC-20 row is confirmed on-chain via approvedPairTokens.
- A launch quoted in a stock pair collects that asset's fees and graduates into a pool keyed in it.
- Economics columns are in the pair's own units.`);
    } catch (e) {
      return errText(e);
    }
  },
};
