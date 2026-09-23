import { LINKS } from "../config.js";
import { EXPLORER_EVM, NATIVE_PAIR_TOKEN, getPublicClient } from "../evmchain.js";
import { fetchMarket, fmtUsd } from "../market.js";
import { PHASE_NAMES, readLaunchedToken } from "../pons.js";
import { listLaunches, listPonsLaunches } from "../registry.js";
import { errText, text } from "./common.js";

export const myCoinsTool = {
  name: "my-coins",
  description:
    "List every coin launched from this machine on both chains — pump.fun (Solana) with live market data, and Pons " +
    "(Robinhood Chain) with live on-chain status (curve/graduated phase, quote pair, creator tax).",
  schema: {},
  async handler() {
    try {
      const launches = listLaunches();
      const ponsLaunches = listPonsLaunches();
      if (launches.length === 0 && ponsLaunches.length === 0) {
        return text("No coins launched from this machine yet. Run launch (Solana) or pons_launch (Robinhood Chain) in a project to create one.");
      }

      const sections: string[] = [];

      if (launches.length > 0) {
        const rows = await Promise.all(
          launches.map(async (l) => {
            let market = "no market data yet (just launched?)";
            try {
              const m = await fetchMarket(l.mint);
              if (m) {
                const chg = m.priceChange24h !== undefined ? ` (${m.priceChange24h > 0 ? "+" : ""}${m.priceChange24h}% 24h)` : "";
                market = `${fmtUsd(m.priceUsd)}${chg} · mcap ${fmtUsd(m.marketCapUsd)} · vol24h ${fmtUsd(m.volume24hUsd)}`;
              }
            } catch {
              market = "market data unavailable";
            }
            return `### $${l.symbol} — ${l.name}
- ${market}
- Mint: ${l.mint}
- Trade: ${LINKS.pumpCoin(l.mint)}
- ${[l.github, l.website].filter(Boolean).join(" · ") || "no links"}
- Launched ${l.createdAt.slice(0, 10)} from wallet "${l.wallet}"`;
          }),
        );
        sections.push(`## Solana — pump.fun (${launches.length})\n\n${rows.join("\n\n")}`);
      }

      if (ponsLaunches.length > 0) {
        const client = getPublicClient();
        const rows = await Promise.all(
          ponsLaunches.map(async (l) => {
            let status = "on-chain status unavailable (RPC unreachable)";
            try {
              const t = await readLaunchedToken(client, l.token as `0x${string}`);
              if (t.exists) status = PHASE_NAMES[t.phase] ?? `phase ${t.phase}`;
            } catch {
              // keep placeholder
            }
            return `### $${l.symbol} — ${l.name}
- ${status}
- Quote pair: ${l.pairToken.toLowerCase() === NATIVE_PAIR_TOKEN ? "ETH" : l.pair} · creator tax ${l.creatorTaxBps / 100}%${l.buyback ? " · reward vault on" : ""}
- Token: ${l.token}
- Explorer: ${EXPLORER_EVM.addr(l.token)}
- Launched ${l.createdAt.slice(0, 10)} from wallet "${l.wallet}"`;
          }),
        );
        sections.push(`## Robinhood Chain — Pons (${ponsLaunches.length})\n\n${rows.join("\n\n")}`);
      }

      return text(`# Your coins (${launches.length + ponsLaunches.length})\n\n${sections.join("\n\n")}`);
    } catch (e) {
      return errText(e);
    }
  },
};
