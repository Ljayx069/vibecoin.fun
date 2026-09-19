import { erc20Abi, formatUnits, isAddress, type Address } from "viem";
import { z } from "zod";
import { EXPLORER_EVM, getEthBalance, getPublicClient, robinhoodChain } from "../evmchain.js";
import {
  createEvmWallet,
  evmWalletExists,
  importEvmWallet,
  listEvmWallets,
  readEvmWalletFile,
} from "../evmkeystore.js";
import { defaultWalletName, errText, text } from "./common.js";
function eth(b: bigint): string {
  return `${formatUnits(b, 18)} ETH`;
}

function parseAddress(s: string, label: string): Address {
  if (!isAddress(s, { strict: false })) throw new Error(`${label} is not a valid EVM address: ${s}`);
  return s;
}

export const evmWalletTool = {
  name: "evm_wallet",
  description:
    "Connect and manage the local encrypted EVM wallet for Robinhood Chain (chain 4663), the chain Pons launches on. " +
    "Actions: create (fresh key), import (bring a private key), status (all wallets + balances), balance (one wallet). " +
    "Same encryption as the Solana wallet (scrypt + AES-256-GCM), password auto-stored in the macOS Keychain or a 0600 key file.",
  schema: {
    action: z.enum(["create", "import", "status", "balance"]).describe("What to do"),
    name: z.string().optional().describe("Wallet name — defaults to the current project directory name"),
    private_key: z
      .string()
      .optional()
      .describe("Import only: hex private key (0x…). Discouraged on the wire — prefer creating a fresh key and funding it"),
    password: z
      .string()
      .optional()
      .describe("Optional password override. Discouraged: prefer the auto-generated stored password or VIBECOIN_WALLET_PASSWORD"),
  },
  async handler(args: { action: "create" | "import" | "status" | "balance"; name?: string; private_key?: string; password?: string }) {
    try {
      const name = args.name ?? defaultWalletName();
      switch (args.action) {
        case "create": {
          const { address, passwordMode } = await createEvmWallet(name, args.password);
          const modeNote = {
            keychain: "auto-generated password stored in your macOS Keychain (service: vibecoin)",
            keyfile: "auto-generated password stored in ~/.vibecoin/keys (file mode 0600)",
            env: "encrypted with the password from VIBECOIN_WALLET_PASSWORD",
            param: "encrypted with the password you provided (it will be required for every future action)",
          }[passwordMode];
          return text(`Created Robinhood Chain wallet "${name}".

- Address: ${address}
- Chain: ${robinhoodChain.name} (chain ID ${robinhoodChain.id})
- Encryption: ${modeNote}
- Explorer: ${EXPLORER_EVM.addr(address)}

Fund it with ETH to pay gas — a Pons launch costs the launch fee (read live, ~0.0005 ETH) plus any dev buy.`);
        }
        case "import": {
          if (!args.private_key) throw new Error('import needs "private_key" (hex, 0x…)');
          const key = args.private_key.trim() as `0x${string}`;
          if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("private_key must be 32 bytes of hex (0x + 64 hex chars)");
          const { address, passwordMode } = await importEvmWallet(name, key, args.password);
          return text(`Imported Robinhood Chain wallet "${name}" (${address}).
Encryption password mode: ${passwordMode}.
Explorer: ${EXPLORER_EVM.addr(address)}`);
        }
        case "status": {
          const wallets = listEvmWallets();
          if (wallets.length === 0) {
            return text(`No EVM wallets yet. Create one with evm_wallet {action: "create"} — or run pons_launch; it auto-creates one per project.`);
          }
          const client = getPublicClient();
          const lines = await Promise.all(
            wallets.map(async (w) => {
              let bal = "balance unavailable (RPC unreachable)";
              try {
                bal = eth(await getEthBalance(client, parseAddress(w.address, "wallet")));
              } catch {
                // keep placeholder
              }
              return `- ${w.name}: ${w.address}\n  ${bal} · created ${w.createdAt.slice(0, 10)}`;
            }),
          );
          return text(`Robinhood Chain wallets on this machine:\n\n${lines.join("\n")}`);
        }
        case "balance": {
          if (!evmWalletExists(name)) throw new Error(`EVM wallet "${name}" does not exist yet — run evm_wallet action "create" first`);
          const file = readEvmWalletFile(name);
          const client = getPublicClient();
          const address = parseAddress(file.address, "wallet");
          const balance = await getEthBalance(client, address);
          let wethLine = "";
          try {
            const weth = await client.readContract({
              address: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [address],
            });
            if (weth > 0n) wethLine = `\n- WETH: ${formatUnits(weth, 18)}`;
          } catch {
            // WETH balance is a nicety, not a requirement
          }
          return text(`Wallet "${name}" (${file.address})

- ETH: ${eth(balance)}${wethLine}
- Chain: ${robinhoodChain.name} (chain ID ${robinhoodChain.id})
- Explorer: ${EXPLORER_EVM.addr(file.address)}`);
        }
      }
    } catch (e) {
      return errText(e);
    }
  },
};
