import { erc20Abi, formatUnits, zeroAddress, type Address } from "viem";
import { z } from "zod";
import { isDryRun } from "../config.js";
import { draftFromProject } from "../draft.js";
import { EXPLORER_EVM, getPublicClient, getWalletClient } from "../evmchain.js";
import { createEvmWallet, evmWalletExists, loadEvmPrivateKey, readEvmWalletFile } from "../evmkeystore.js";
import {
  EMPTY_SOCIALS,
  buildLaunchTx,
  predictLaunchAddresses,
  previewEconomics,
  readEconomicsGuard,
  readLaunchContext,
  readPairTokens,
  resolvePairToken,
  saltFor,
  validateLaunch,
  type LaunchIntent,
} from "../pons.js";
import { APPROVAL_NOTE, defaultWalletName, errText, text } from "./common.js";

function eth(n: bigint): string {
  return `${formatUnits(n, 18)} ETH`;
}

/** Basis points → a percent string (150 → "1.5", 100 → "1"). */
function pct(bps: bigint | number): string {
  const p = Number(bps) / 100;
  return Number.isInteger(p) ? String(p) : p.toFixed(2);
}

export const ponsLaunchTool = {
  name: "pons_launch",
  description:
    "Launch the current project as a coin on Pons (ponsfamily.com), the launchpad on Robinhood Chain (chain 4663). " +
    "Fixed 1B supply bonding curve that graduates into a permanently locked Uniswap V4 pool — no separate migration step. " +
    "Every trade carries Pons's standard 1% protocol fee; creator_tax_percent adds your own cut on top of it, always " +
    "paid to the launch wallet. First call WITHOUT confirm: drafts name/symbol/description/links from the repo and " +
    "returns a full preview — predicted token address, launch fee, quote pair economics, total trade fee, reward vault " +
    "(buyback) terms. Show it to the user, apply edits via the override params, and only after they explicitly approve " +
    "call again with confirm: true. The EVM wallet is auto-created if missing (encrypted, password stored in Keychain — " +
    "no interactive step). dry_run simulates without sending.",
  schema: {
    name: z.string().max(64).optional().describe("Override token name (contract limit 64 bytes UTF-8)"),
    symbol: z.string().max(16).optional().describe("Override ticker (contract limit 16 bytes)"),
    description: z.string().max(2048).optional().describe("Override description shown on the Pons token page"),
    website: z.string().url().optional().describe("Project URL — stored in the token's on-chain socials"),
    twitter: z.string().max(256).optional().describe("Twitter/X URL for the token page"),
    telegram: z.string().max(256).optional().describe("Telegram URL for the token page"),
    logo_url: z.string().max(512).optional().describe("Logo URL, up to 512 bytes. Defaults to empty (set it later on the Pons page)"),
    pair: z
      .string()
      .optional()
      .describe("Quote asset: symbol or address from pons_pairs (e.g. ETH, or a tokenized stock like NVDA). Default: ETH"),
    creator_tax_percent: z
      .number()
      .min(0)
      .max(10)
      .optional()
      .describe(
        "Creator tax on every trade, in percent (e.g. 1.5 = 1.5%%). This is ADDED ON TOP of the protocol's standard 1%% fee — " +
          "so 0 means traders pay just the 1%% protocol fee, 1 means 2%% total. Capped by the factory (currently 10%%) — see the preview. Default 0",
      ),
    buyback: z
      .boolean()
      .optional()
      .describe(
        "Fund the Pons reward vault (buyback): part of your creator fee share buys back the token over 5 years, " +
          "split with the protocol. Funded from YOUR fees — not a holder distribution. Default false",
      ),
    dev_buy_eth: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe(
        "Opening buy in ETH, atomic with the launch and exempt from the 99%% opening snipe tax. Strongly recommended — " +
          "unbought launches have been sniped out within two blocks. Native-ETH pairs only. Default 0",
      ),
    slippage_bps: z.number().int().min(0).max(5000).optional().describe("Slippage floor for the opening buy (default 500 = 5%)"),
    salt: z
      .string()
      .optional()
      .describe("Optional CREATE2 salt (0x + 64 hex). Default derives from name+symbol, so relaunching identical terms fails early"),
    wallet: z.string().optional().describe("EVM wallet name (default: project directory name)"),
    project_dir: z.string().optional().describe("Project directory to draft from (default: current working directory)"),
    confirm: z.boolean().optional().describe("Set true ONLY after the user explicitly approved the preview"),
    dry_run: z.boolean().optional().describe("Simulate the launch transaction without sending"),
  },
  async handler(args: {
    name?: string;
    symbol?: string;
    description?: string;
    website?: string;
    twitter?: string;
    telegram?: string;
    logo_url?: string;
    pair?: string;
    creator_tax_percent?: number;
    buyback?: boolean;
    dev_buy_eth?: number;
    slippage_bps?: number;
    salt?: string;
    wallet?: string;
    project_dir?: string;
    confirm?: boolean;
    dry_run?: boolean;
  }) {
    try {
      const projectDir = args.project_dir ?? process.cwd();
      const walletName = args.wallet ?? defaultWalletName(projectDir);
      const draft = await draftFromProject(projectDir);
      const name = args.name ?? draft.name;
      const symbol = (args.symbol ?? draft.symbol).toUpperCase();
      const description = args.description ?? draft.description;
      const website = args.website ?? draft.website ?? "";
      // Percent → basis points; stacked on top of the protocol's standard 1% curve fee.
      const creatorTaxBps = Math.round((args.creator_tax_percent ?? 0) * 100);
      const buyback = args.buyback ?? false;
      const devBuyEth = args.dev_buy_eth ?? 0;
      const slippageBps = BigInt(args.slippage_bps ?? 500);
      const dryRun = isDryRun(args.dry_run);
      const configId = 0n;

      if (args.salt !== undefined && !/^0x[0-9a-fA-F]{64}$/.test(args.salt)) {
        throw new Error('salt must be 32 bytes of hex (0x + 64 hex chars)');
      }

      const client = getPublicClient();

      // Resolve the wallet address up front: the factory's canLaunch check and
      // the CREATE2 prediction both need it, and a preview should show where
      // the token will land even before a wallet exists.
      const walletAddress: Address = evmWalletExists(walletName)
        ? readEvmWalletFile(walletName).address
        : zeroAddress;
      // Creator fees always go to the launch wallet.
      const feeRecipient: Address = walletAddress;

      const [context, pairs] = await Promise.all([readLaunchContext(client, configId, walletAddress), readPairTokens(client, configId)]);
      const pair = resolvePairToken(pairs, args.pair ?? "ETH");

      if (devBuyEth > 0 && !pair.native) {
        throw new Error("dev_buy_eth is only supported on native-ETH pairs — stock-pair opening buys need the ERC-20 in the wallet");
      }
      const devBuy = pair.native ? BigInt(Math.round(devBuyEth * 1e18)) : 0n;

      const economicsGuard = await readEconomicsGuard(client, configId, pair.address);
      const intent: LaunchIntent = {
        params: {
          name,
          symbol,
          logo: args.logo_url ?? "",
          description,
          socials: { ...EMPTY_SOCIALS, website, twitter: args.twitter ?? "", telegram: args.telegram ?? "" },
          creatorFeeRecipient: feeRecipient,
          creatorTaxBps,
          buybackEnabled: buyback,
          expectedEconomics: economicsGuard,
          salt: (args.salt as `0x${string}` | undefined) ?? saltFor(name, symbol),
        },
        configId,
        pair,
        devBuy,
        slippageBps,
        recipient: walletAddress,
      };
      validateLaunch(intent, context);
      let predicted = await predictLaunchAddresses(client, intent, context, walletAddress);
      if (predicted.taken) {
        throw new Error(
          `the CREATE2 slot for these launch terms is already taken (curve ${predicted.curve}) — ` +
            "change the name/symbol or pass a different salt",
        );
      }
      const economics = previewEconomics(intent, context);

      if (!args.confirm) {
        const walletLine = evmWalletExists(walletName)
          ? `"${walletName}" (exists — ${readEvmWalletFile(walletName).address})`
          : `"${walletName}" (will be auto-created and encrypted; no password prompt needed)`;
        const need = economics.value + (pair.native ? 0n : devBuy);
        let balanceLine = "unknown until the wallet exists (fund it before confirming)";
        if (evmWalletExists(walletName)) {
          const bal = await client.getBalance({ address: walletAddress });
          balanceLine = `${eth(bal)}${bal < need ? ` — ⚠ needs ~${eth(need)} before launch` : " ✓ sufficient"}`;
        }
        const threshold = pair.native
          ? context.config.graduationThreshold
          : pair.graduationThreshold;
        const warnings: string[] = [];
        if (buyback) {
          warnings.push(
            `- ⚠ reward vault: funded entirely from your creator fee share (protocol takes ${context.policy.protocolFeeShareBps} bps of the fee), ` +
              "releases linearly over 5 years, and is not a holder distribution",
          );
        }
        if (creatorTaxBps === 0) warnings.push("- ℹ creator tax is 0 and can never be added after launch");
        if (devBuy === 0n) {
          warnings.push(
            `- ⚠ no dev buy: the opening window carries a ${context.snipeTaxStartBps / 100n}% snipe tax decaying over ` +
              `${context.snipeTaxSeconds}s — unbought launches have been bought out within two blocks`,
          );
        }
        if (!pair.native) {
          warnings.push(`- ℹ quoted in ${pair.symbol}: trades collect ${pair.symbol} and the pool graduates keyed in it`);
        }

        return text(`## Pons launch preview — nothing sent yet

| field | value |
|---|---|
| name | ${name} |
| symbol | $${symbol} |
| description | ${description.slice(0, 160)}${description.length > 160 ? "…" : ""} |
| website / twitter / telegram | ${website || "—"} / ${args.twitter ?? "—"} / ${args.telegram ?? "—"} |
| quote pair | ${pair.native ? "ETH (native)" : `${pair.symbol} (${pair.address})`} |
| predicted token | ${predicted.token} |
| predicted curve | ${predicted.curve} |
| supply | ${context.config.supply.toLocaleString("en-US")} (fixed by the protocol) |
| trade fees | ${pct(context.config.curveFeeBps)}% protocol (Pons standard) + ${pct(creatorTaxBps)}% creator tax = ${pct(context.config.curveFeeBps + BigInt(creatorTaxBps))}% total on every trade${buyback ? " — part of the creator tax funds the reward vault" : ""} |
| fee recipient | ${walletAddress === zeroAddress ? "the launch wallet (auto-created)" : walletAddress} |
| reward vault (buyback) | ${buyback ? "enabled" : "disabled"} |
| graduation | at ${formatUnits(threshold, pair.decimals)} ${pair.native ? "ETH" : pair.symbol} raised → permanently locked Uniswap V4 pool |

## Costs
- Launch fee: ${eth(economics.launchFee)} (exact — the factory reverts on any other msg.value)
${
  devBuy > 0n
    ? `- Dev buy: ${eth(devBuy)} → ~${economics.tokensOut.toLocaleString("en-US")} $${symbol} (${economics.supplyShareBps / 100n}.${(economics.supplyShareBps % 100n).toString().padStart(2, "0")}% of supply${intent.devBuy !== economics.devBuy ? ", clamped at the reserved allocation — the rest is refunded in the same tx" : ""})`
    : "- Dev buy: none"
}
- Total to send: ${eth(economics.value)}${pair.native ? "" : ` + ${formatUnits(devBuy, pair.decimals)} ${pair.symbol} allowance (an ERC-20 approve transaction lands first)`}

## Wallet
- ${walletLine}
- Balance: ${balanceLine}

${warnings.length > 0 ? `## Warnings\n${warnings.join("\n")}\n\n` : ""}${APPROVAL_NOTE} Overrides: name, symbol, description, website, twitter, telegram, logo_url, pair, creator_tax_percent, buyback, dev_buy_eth, slippage_bps, salt.${dryRun ? "\n(dry_run is on: confirming will simulate without sending.)" : ""}`);
      }

      // ---- confirmed ----
      let created = false;
      if (!evmWalletExists(walletName)) {
        await createEvmWallet(walletName);
        created = true;
      }
      const file = readEvmWalletFile(walletName);
      const key = await loadEvmPrivateKey(walletName);
      const { account, client: wallet } = getWalletClient(key);

      const bal = await client.getBalance({ address: account.address });
      if (bal < economics.value) {
        throw new Error(
          `wallet "${walletName}" holds ${eth(bal)} but this launch needs ${eth(economics.value)}. ` +
            `Send ETH to ${account.address} and run pons_launch again.`,
        );
      }

      // The CREATE2 prediction, fee recipient and recipient were computed
      // against the zero-address placeholder if the wallet was just created;
      // rebuild them with the real address. Terms identical, addresses
      // corrected, then re-check the slot is free.
      // The CREATE2 prediction, dev-buy recipient and fee recipient were
      // computed against the zero-address placeholder if the wallet was just
      // created; rebuild them with the real address. Creator fees always go
      // to the launch wallet, so the recipient is the wallet too.
      if (intent.params.creatorFeeRecipient !== account.address || intent.recipient !== account.address) {
        intent.params.creatorFeeRecipient = account.address;
        intent.recipient = account.address;
        intent.params.expectedEconomics = await readEconomicsGuard(client, configId, pair.address);
        validateLaunch(intent, context);
        const rePredicted = await predictLaunchAddresses(client, intent, context, account.address);
        if (rePredicted.taken) {
          throw new Error(`the CREATE2 slot for these launch terms is already taken (curve ${rePredicted.curve})`);
        }
        predicted = rePredicted;
      }

      const tx = buildLaunchTx(intent, context, economics);

      // ERC-20 quote (stock pair): the router pulls the buy with transferFrom,
      // so the approve must land first, in its own transaction.
      let approveHash: `0x${string}` | undefined;
      if (tx.approveTo && tx.approveAmount) {
        const allowance = await client.readContract({
          address: tx.approveTo,
          abi: erc20Abi,
          functionName: "allowance",
          args: [account.address, tx.to],
        });
        if (allowance < tx.approveAmount) {
          if (dryRun) {
            return text(`## Dry run complete — NOTHING was sent

- Would send ERC-20 approve first: ${tx.approveTo} approves the launch router (${tx.to}) for ${formatUnits(tx.approveAmount, pair.decimals)} ${pair.symbol}
- Then the launch+dev-buy: ${eth(tx.value)} to ${tx.to}
- Predicted token: ${predicted.token}
- Predicted curve: ${predicted.curve}

Re-run with dry_run: false (and confirm: true) to launch for real.`);
          }
          approveHash = await wallet.writeContract({
            address: tx.approveTo,
            abi: erc20Abi,
            functionName: "approve",
            args: [tx.to, tx.approveAmount],
          });
          await client.waitForTransactionReceipt({ hash: approveHash });
        }
      }

      if (dryRun) {
        try {
          await client.call({ account: account.address, to: tx.to, data: tx.data, value: tx.value });
        } catch (e) {
          return text(`## Dry run — transaction built, mainnet call FAILED (nothing was sent)

- Predicted token: ${predicted.token}
- Revert: ${e instanceof Error ? e.message : String(e)}

If the wallet was just created it holds no ETH, so the launch fee cannot be paid — the same transaction succeeds once funded.`);
        }
        return text(`## Dry run complete — NOTHING was sent

- Launch tx simulated against live mainnet state via eth_call: ✓ would land
- Predicted token: ${predicted.token}
- Predicted curve: ${predicted.curve}

Re-run with dry_run: false (and confirm: true) to launch for real.`);
      }

      const hash = await wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value });
      const receipt = await client.waitForTransactionReceipt({ hash });

      return text(`## 🚀 $${symbol} is live on Pons (Robinhood Chain)

- Token: ${predicted.token}
- Curve: ${predicted.curve}
- Tx: ${EXPLORER_EVM.tx(hash)}${approveHash ? `\n- Approve tx: ${EXPLORER_EVM.tx(approveHash)}` : ""}
- Explorer: ${EXPLORER_EVM.addr(predicted.token)}
${created ? `\nWallet "${walletName}" was auto-created for this launch — its address is ${account.address}.` : ""}
- You earn ${pct(creatorTaxBps)}% of every curve trade (on top of the protocol's ${pct(context.config.curveFeeBps)}%), paid to your launch wallet${buyback ? " — part of it funds the reward vault" : ""}.
- Fee settings (recipient, reward vault) are managed afterwards with pons_fees — the tax rate itself is frozen.
- Graduation to a permanently locked Uniswap V4 pool happens at ${formatUnits(pair.native ? context.config.graduationThreshold : pair.graduationThreshold, pair.decimals)} ${pair.native ? "ETH" : pair.symbol} raised — anyone can trigger the sweep.${receipt.status !== "success" ? "\n- ⚠ receipt status is not success — check the tx above" : ""}`);
    } catch (e) {
      return errText(e);
    }
  },
};
