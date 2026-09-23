import { erc20Abi, formatUnits, type Address } from "viem";
import { z } from "zod";
import { DEFAULTS, isDryRun } from "../config.js";
import { EXPLORER_EVM, NATIVE_PAIR_TOKEN, getPublicClient, getWalletClient } from "../evmchain.js";
import { evmWalletExists, loadEvmPrivateKey, readEvmWalletFile } from "../evmkeystore.js";
import { loadKeypair, readWalletFile, walletExists } from "../keystore.js";
import { buildClaimFeesTx, readClaimableFees } from "../pons.js";
import { buildCollectCreatorFeeTx } from "../pumpportal.js";
import { listPonsLaunches } from "../registry.js";
import { EXPLORER, getConnection, getSolBalance, sendSigned, simulate } from "../solana.js";
import { APPROVAL_NOTE, defaultWalletName, errText, parsePubkey, sol, text } from "./common.js";

interface PonsAssetClaim {
  asset?: Address; // undefined = native ETH
  symbol: string;
  decimals: number;
  claimable: bigint;
}

/** What the Pons fee escrow owes this wallet, across ETH and every ERC-20 quote this wallet launched with. */
async function readPonsClaims(evmAddress: Address, walletName: string): Promise<PonsAssetClaim[]> {
  const client = getPublicClient();
  const claims: PonsAssetClaim[] = [];

  const eth = await readClaimableFees(client, evmAddress);
  if (eth > 0n) claims.push({ symbol: "ETH", decimals: 18, claimable: eth });

  // Distinct ERC-20 quote assets this wallet's recorded launches used.
  const assets = new Map<string, { address: Address; symbol: string }>();
  for (const l of listPonsLaunches()) {
    if (l.wallet !== walletName || l.pairToken.toLowerCase() === NATIVE_PAIR_TOKEN) continue;
    if (!assets.has(l.pairToken.toLowerCase())) {
      assets.set(l.pairToken.toLowerCase(), { address: l.pairToken as Address, symbol: l.pair });
    }
  }
  for (const a of assets.values()) {
    try {
      const claimable = await readClaimableFees(client, evmAddress, a.address);
      if (claimable > 0n) {
        const decimals = await client
          .readContract({ address: a.address, abi: erc20Abi, functionName: "decimals" })
          .catch(() => 18);
        claims.push({ asset: a.address, symbol: a.symbol, decimals, claimable });
      }
    } catch {
      // an unreadable asset must not block the rest of the claim
    }
  }
  return claims;
}

export const collectFeesTool = {
  name: "collect-fees",
  description:
    "Claim your accrued creator fees on BOTH chains in one command: pump.fun (Solana — 0.30% of curve trades, tiered " +
    "after graduation, pays out across all your coins at once) and Pons (Robinhood Chain — your creator tax, held in " +
    "the shared fee escrow, claimed in ETH plus each stock-pair quote you launched with). " +
    "Preview first (no confirm), then call with confirm: true after the user approves.",
  schema: {
    wallet: z.string().optional().describe("Wallet name (default: project directory name) — used for both chains"),
    chain: z.enum(["both", "solana", "robinhood"]).optional().describe("Restrict the claim to one chain (default: both)"),
    priority_fee: z.number().min(0).optional().describe("Solana only: priority fee in SOL (default 0.00005)"),
    confirm: z.boolean().optional().describe("Set true only after the user approved"),
    dry_run: z.boolean().optional().describe("Build + simulate the claims without sending"),
  },
  async handler(args: { wallet?: string; chain?: "both" | "solana" | "robinhood"; priority_fee?: number; confirm?: boolean; dry_run?: boolean }) {
    try {
      const name = args.wallet ?? defaultWalletName();
      const chain = args.chain ?? "both";

      const hasSol = walletExists(name);
      const hasEvm = evmWalletExists(name);
      const doSol = chain !== "robinhood" && hasSol;
      const doEvm = chain !== "solana" && hasEvm;
      if (!doSol && !doEvm) {
        throw new Error(
          hasSol || hasEvm
            ? `no wallet named "${name}" on the requested chain`
            : `no wallet named "${name}" on either chain — launch creates one automatically`,
        );
      }

      // Read claimable amounts up front (needed for the preview, and the Pons
      // escrow reverts on an empty claim, so the send path skips zeroes).
      let ponsClaims: PonsAssetClaim[] = [];
      let evmAddress: Address | null = null;
      if (doEvm) {
        evmAddress = readEvmWalletFile(name).address;
        try {
          ponsClaims = await readPonsClaims(evmAddress, name);
        } catch {
          ponsClaims = [];
        }
      }

      if (!args.confirm) {
        const sections: string[] = [];
        if (doSol) {
          const file = readWalletFile(name);
          sections.push(`### pump.fun (Solana)
- Wallet: ${file.publicKey}
- Claims ALL pending creator fees for this wallet in one transaction (per-coin selection isn't a thing —
  pump.fun pays everything owed to the creator address at once).
- Cost: network fee only (~${sol(0.000005 + (args.priority_fee ?? DEFAULTS.priorityFee))}). PumpPortal does not charge for fee claims.`);
        }
        if (doEvm) {
          sections.push(`### Pons (Robinhood Chain)
- Wallet: ${evmAddress}
- Claimable now: ${
            ponsClaims.length > 0
              ? ponsClaims.map((c) => `${formatUnits(c.claimable, c.decimals)} ${c.symbol}`).join(" + ")
              : "nothing (fees are swept into the escrow on a schedule, not per trade — check back after some volume)"
          }
- One claim pays everything owed to you across all your Pons coins, curve and graduated pools alike.
- Cost: gas only (a fraction of a cent on this chain).`);
        }
        return text(`## Collect creator fees — preview

${sections.join("\n\n")}

${APPROVAL_NOTE}`);
      }

      const dryRun = isDryRun(args.dry_run);
      const results: string[] = [];

      if (doSol) {
        const file = readWalletFile(name);
        const pk = parsePubkey(file.publicKey, "wallet");
        const conn = getConnection();
        const before = await getSolBalance(conn, pk);
        const tx = await buildCollectCreatorFeeTx({ creator: pk, priorityFee: args.priority_fee });
        const kp = await loadKeypair(name);
        tx.sign([kp]);
        if (dryRun) {
          const sim = await simulate(conn, tx);
          results.push(`### pump.fun (Solana) — dry run, NOT sent\nSimulation: ${sim.ok ? "✓ ok" : `✗ ${sim.err}`}`);
        } else {
          const sig = await sendSigned(conn, tx);
          const after = await getSolBalance(conn, pk);
          const delta = after - before;
          results.push(`### pump.fun (Solana)\n- Claimed: ${delta > 0 ? sol(delta) : `≈0 (nothing pending; tx fee ${sol(Math.abs(delta))})`}\n- Balance: ${sol(after)}\n- Tx: ${EXPLORER.tx(sig)}`);
        }
      }

      if (doEvm && evmAddress) {
        if (ponsClaims.length === 0) {
          results.push("### Pons (Robinhood Chain)\n- Nothing claimable right now — no claim sent (the escrow reverts on zero).");
        } else if (dryRun) {
          results.push(
            `### Pons (Robinhood Chain) — dry run, NOT sent\n- Would claim: ${ponsClaims.map((c) => `${formatUnits(c.claimable, c.decimals)} ${c.symbol}`).join(" + ")}`,
          );
        } else {
          const client = getPublicClient();
          const key = await loadEvmPrivateKey(name);
          const { account, client: wallet } = getWalletClient(key);
          const lines: string[] = [];
          for (const c of ponsClaims) {
            const tx = buildClaimFeesTx(c.asset);
            const hash = await wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value });
            const receipt = await client.waitForTransactionReceipt({ hash });
            lines.push(
              `- Claimed ${formatUnits(c.claimable, c.decimals)} ${c.symbol} — ${EXPLORER_EVM.tx(hash)}${receipt.status !== "success" ? " (⚠ receipt not success — check)" : ""}`,
            );
          }
          const ethAfter = await client.getBalance({ address: account.address });
          results.push(`### Pons (Robinhood Chain)\n${lines.join("\n")}\n- ETH balance: ${formatUnits(ethAfter, 18)} ETH`);
        }
      }

      return text(`## Fees collected\n\n${results.join("\n\n")}\n\nTip: run fund-agent to convert Solana fees into a USDC budget for your agent.`);
    } catch (e) {
      return errText(e);
    }
  },
};
