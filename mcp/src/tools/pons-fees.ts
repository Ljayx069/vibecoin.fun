import { formatUnits, isAddress, type Address } from "viem";
import { z } from "zod";
import { isDryRun } from "../config.js";
import { EXPLORER_EVM, NATIVE_PAIR_TOKEN, getPublicClient, getWalletClient } from "../evmchain.js";
import { evmWalletExists, loadEvmPrivateKey, readEvmWalletFile } from "../evmkeystore.js";
import {
  PHASE_NAMES,
  buildSetBuybackTx,
  buildTransferRecipientTx,
  readBuybackVaultInfo,
  readLaunchedToken,
  readPendingRecipientChange,
  type LaunchedToken,
} from "../pons.js";
import { APPROVAL_NOTE, defaultWalletName, errText, text } from "./common.js";

function parseToken(raw: string): Address {
  if (!isAddress(raw, { strict: false })) {
    throw new Error(`token must be the deployed token address (0x…) — shown in the pons_launch preview and result`);
  }
  return raw as Address;
}

function requireLaunched(launch: LaunchedToken, token: Address): LaunchedToken {
  if (!launch.exists) {
    throw new Error(`${token} was not launched through the Pons V2 factory — only V2 launches have manageable fee settings`);
  }
  return launch;
}

function days(n: bigint): string {
  return `${(Number(n) / 86400).toFixed(1)}d`;
}

function bps(n: number): string {
  return `${n} bps (${n / 100}%)`;
}

export const ponsFeesTool = {
  name: "pons_fees",
  description:
    "View and change the fee settings of a token launched with pons_launch on Robinhood Chain. " +
    "Actions: status (creator fee recipient, creator tax, reward vault state, pending protocol override), " +
    "transfer_recipient (move the fee receiving address — immediate, also re-points the reward vault beneficiary), " +
    "set_buyback (toggle the reward vault; enabling spends the creator's own fee share). " +
    "The creator tax percentage itself is frozen at launch and cannot be changed by anyone. " +
    "Changes are two-phase: call once without confirm, show the preview, then again with confirm: true after approval.",
  schema: {
    action: z.enum(["status", "transfer_recipient", "set_buyback"]).describe("What to do"),
    token: z.string().describe("The launched token's address (from the pons_launch result)"),
    new_recipient: z
      .string()
      .optional()
      .describe("transfer_recipient only: new fee receiving address (0x…). All future fees and reward-vault releases go here"),
    enabled: z.boolean().optional().describe("set_buyback only: enable (true) or disable (false) the reward vault"),
    wallet: z.string().optional().describe("EVM wallet name signing the change — must be the current fee recipient (default: project directory name)"),
    confirm: z.boolean().optional().describe("Set true ONLY after the user explicitly approved the preview"),
    dry_run: z.boolean().optional().describe("Simulate the change without sending"),
  },
  async handler(args: {
    action: "status" | "transfer_recipient" | "set_buyback";
    token: string;
    new_recipient?: string;
    enabled?: boolean;
    wallet?: string;
    confirm?: boolean;
    dry_run?: boolean;
  }) {
    try {
      const token = parseToken(args.token);
      const client = getPublicClient();
      const launch = requireLaunched(await readLaunchedToken(client, token), token);

      if (args.action === "status") {
        const [pending, policy] = await Promise.all([
          readPendingRecipientChange(client, token),
          client.readContract({
            address: token,
            abi: [
              {
                type: "function",
                name: "symbol",
                inputs: [],
                outputs: [{ type: "string" }],
                stateMutability: "view",
              },
            ] as const,
            functionName: "symbol",
          }).catch(() => null),
        ]);
        let vaultLine = "";
        if (launch.buybackEnabled) {
          const v = await readBuybackVaultInfo(client, token);
          vaultLine = `
- Reward vault: locked ${formatUnits(v.totalLocked, 18)} · vested ${formatUnits(v.vestedAmount, 18)} · released ${formatUnits(v.totalReleased, 18)} · releasable now ${formatUnits(v.releasable, 18)} tokens
- Vesting: starts ${v.vestingStart > 0n ? new Date(Number(v.vestingStart) * 1000).toISOString().slice(0, 10) : "—"}, ${days(v.vestingDuration)} linear`;
        }
        const pendingLine = pending
          ? `\n- ⚠ protocol owner has proposed redirecting fees to ${pending.newRecipient}, effective ${new Date(Number(pending.effectiveAt) * 1000).toISOString()} — anyone may execute it between then and ${new Date(Number(pending.expiresAt) * 1000).toISOString().slice(0, 10)}`
          : "";
        return text(`## Pons fee settings — ${policy ?? token}

- Token: ${token}
- Phase: ${PHASE_NAMES[launch.phase] ?? launch.phase}
- Quote pair: ${launch.pairToken === NATIVE_PAIR_TOKEN ? "ETH (native)" : launch.pairToken}
- Creator tax: ${bps(launch.creatorTaxBps)} of every trade — frozen at launch, cannot be changed
- Fee recipient: ${launch.creatorFeeRecipient}${pendingLine}
- Reward vault (buyback): ${launch.buybackEnabled ? "enabled" : "disabled"}${vaultLine}
- Explorer: ${EXPLORER_EVM.addr(token)}`);
      }

      const walletName = args.wallet ?? defaultWalletName();
      if (!evmWalletExists(walletName)) {
        throw new Error(`EVM wallet "${walletName}" does not exist — the wallet must be the token's current fee recipient (${launch.creatorFeeRecipient})`);
      }
      const file = readEvmWalletFile(walletName);
      if (file.address.toLowerCase() !== launch.creatorFeeRecipient.toLowerCase()) {
        throw new Error(
          `wallet "${walletName}" (${file.address}) is not the fee recipient for this token (${launch.creatorFeeRecipient}) — ` +
            `pass wallet for the recipient address, or transfer from that wallet`,
        );
      }

      const dryRun = isDryRun(args.dry_run);

      if (args.action === "transfer_recipient") {
        if (!args.new_recipient) throw new Error('transfer_recipient needs "new_recipient"');
        if (!isAddress(args.new_recipient, { strict: false }) || args.new_recipient.toLowerCase() === NATIVE_PAIR_TOKEN) {
          throw new Error("new_recipient must be a valid non-zero address");
        }
        const newRecipient = args.new_recipient as Address;
        if (!args.confirm) {
          return text(`## Recipient transfer preview — nothing sent yet

- Token: ${token}
- Current fee recipient: ${launch.creatorFeeRecipient}
- New fee recipient: ${newRecipient}

Effect: every future creator fee (curve now, pool after graduation) and all future reward-vault releases pay ${newRecipient} instead. Immediate and effectively irreversible — only the new recipient can move it again. Fees already accrued are not moved.

${APPROVAL_NOTE}`);
        }
        const tx = buildTransferRecipientTx(token, newRecipient);
        return await sendFeeTx(walletName, tx, dryRun, token, `fee recipient transferred to ${newRecipient}`);
      }

      // set_buyback
      if (args.enabled === undefined) throw new Error('set_buyback needs "enabled" (true/false)');
      if (args.enabled === launch.buybackEnabled) {
        return text(`The reward vault is already ${launch.buybackEnabled ? "enabled" : "disabled"} — nothing to do.`);
      }
      if (!args.confirm) {
        return text(`## Reward vault ${args.enabled ? "enable" : "disable"} preview — nothing sent yet

- Token: ${token}
- Reward vault currently: ${launch.buybackEnabled ? "enabled" : "disabled"}
${
  args.enabled
    ? "Enabling directs part of your creator fee share into the protocol buyback vault: it buys back the token and releases linearly over 5 years, with the protocol taking a share of each release. Funded from YOUR fees — not a holder distribution. The creator tax you keep shrinks accordingly."
    : "Disabling stops funding the buyback vault from your creator fee share; amounts already vested stay on their existing schedule."
}

${APPROVAL_NOTE}`);
      }
      const tx = buildSetBuybackTx(token, args.enabled);
      return await sendFeeTx(walletName, tx, dryRun, token, `reward vault ${args.enabled ? "enabled" : "disabled"}`);
    } catch (e) {
      return errText(e);
    }
  },
};

async function sendFeeTx(
  walletName: string,
  tx: { to: Address; data: `0x${string}`; value: bigint },
  dryRun: boolean,
  token: Address,
  done: string,
) {
  const client = getPublicClient();
  const key = await loadEvmPrivateKey(walletName);
  const { account, client: wallet } = getWalletClient(key);

  if (dryRun) {
    try {
      await client.call({ account: account.address, to: tx.to, data: tx.data, value: tx.value });
      return text(`## Dry run complete — NOTHING was sent

- Change simulated against live mainnet state: ✓ would land
- Token: ${token}

Re-run with dry_run: false (and confirm: true) to apply it.`);
    } catch (e) {
      return text(`## Dry run — change built, mainnet call FAILED (nothing was sent)

- Revert: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const hash = await wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value });
  const receipt = await client.waitForTransactionReceipt({ hash });
  return text(`## ${done}

- Token: ${token}
- Tx: ${EXPLORER_EVM.tx(hash)}${receipt.status !== "success" ? "\n- ⚠ receipt status is not success — check the tx above" : ""}`);
}
