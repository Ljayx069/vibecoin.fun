import { createPublicClient, createWalletClient, defineChain, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env } from "./config.js";

/**
 * Robinhood Chain mainnet — the chain Pons (ponsfamily.com) launches on.
 * Arbitrum Nitro Orbit L2, ETH is the native gas asset.
 */
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [env("VIBECOIN_ROBINHOOD_RPC", "https://rpc.mainnet.chain.robinhood.com")] },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
      blockCreated: 0,
    },
  },
});

export const EXPLORER_EVM = {
  addr: (a: string) => `https://robinhoodchain.blockscout.com/address/${a}`,
  tx: (h: string) => `https://robinhoodchain.blockscout.com/tx/${h}`,
};

/** Block Pons V2's factory first emitted a log; the lower bound for pair-approval scans. */
export const V2_FACTORY_FIRST_LOG_BLOCK = 26_841_846n;

/** Sentinel meaning "the native asset" in Pons pair-token slots. */
export const NATIVE_PAIR_TOKEN: Address = "0x0000000000000000000000000000000000000000";

export function getPublicClient() {
  return createPublicClient({ chain: robinhoodChain, transport: http() });
}

export function getWalletClient(privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  return {
    account,
    client: createWalletClient({ account, chain: robinhoodChain, transport: http() }),
  };
}

export async function getEthBalance(client: ReturnType<typeof getPublicClient>, address: Address) {
  return client.getBalance({ address });
}
