import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { generatePrivateKey, privateKeyToAccount, type Address } from "viem/accounts";
import { VIBECOIN_HOME } from "./config.js";
import {
  decryptSecretKey,
  encryptSecretKey,
  storeGeneratedPassword,
  type PasswordMode,
  type WalletCrypto,
} from "./keystore.js";

/**
 * EVM wallets (Robinhood Chain) use the same scrypt + AES-256-GCM envelope and
 * the same password storage (macOS Keychain / 0600 key file / env) as the
 * Solana wallets, but live in their own directory and hold a 32-byte EVM key.
 */

export interface EvmWalletFile {
  version: 1;
  chain: "robinhood";
  name: string;
  address: Address;
  createdAt: string;
  crypto: WalletCrypto;
}

const sessionKeys = new Map<string, `0x${string}`>();

export function evmWalletDir(): string {
  return path.join(VIBECOIN_HOME(), "wallets-evm");
}

function walletPath(name: string): string {
  return path.join(evmWalletDir(), `${name}.json`);
}

export function evmWalletExists(name: string): boolean {
  return /^[a-zA-Z0-9._-]{1,64}$/.test(name) && fs.existsSync(walletPath(name));
}

export async function createEvmWallet(
  name: string,
  password?: string,
): Promise<{ address: Address; passwordMode: PasswordMode }> {
  return importEvmWallet(name, generatePrivateKey(), password);
}

export async function importEvmWallet(
  name: string,
  privateKey: `0x${string}`,
  password?: string,
): Promise<{ address: Address; passwordMode: PasswordMode }> {
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(name)) {
    throw new Error(`invalid wallet name "${name}" — use 1-64 letters, digits, dot, dash or underscore`);
  }
  if (evmWalletExists(name)) {
    throw new Error(`EVM wallet "${name}" already exists at ${walletPath(name)}`);
  }
  const account = privateKeyToAccount(privateKey);

  // Same resolution ladder as the Solana keystore: env, explicit param, stored.
  let pw: string;
  let mode: PasswordMode;
  const envPw = process.env.VIBECOIN_WALLET_PASSWORD;
  if (envPw) {
    [pw, mode] = [envPw, "env"];
  } else if (password) {
    [pw, mode] = [password, "param"];
  } else {
    const stored = storedPassword(name);
    if (stored) {
      [pw, mode] = stored;
    } else {
      pw = crypto.randomBytes(32).toString("base64url");
      mode = storeGeneratedPassword(name, pw);
    }
  }

  const file: EvmWalletFile = {
    version: 1,
    chain: "robinhood",
    name,
    address: account.address,
    createdAt: new Date().toISOString(),
    crypto: encryptSecretKey(privateKeyToBytes(privateKey), pw),
  };
  fs.mkdirSync(VIBECOIN_HOME(), { recursive: true, mode: 0o700 });
  fs.mkdirSync(evmWalletDir(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(walletPath(name), JSON.stringify(file, null, 2), { mode: 0o600 });
  sessionKeys.set(name, privateKey);
  return { address: account.address, passwordMode: mode };
}

function privateKeyToBytes(key: `0x${string}`): Uint8Array {
  return new Uint8Array(Buffer.from(key.slice(2), "hex"));
}

/** Re-read a stored password without decrypting anything, mirroring keystore.ts. */
function storedPassword(name: string): [string, PasswordMode] | null {
  if (process.platform === "darwin" && !process.env.VIBECOIN_NO_KEYCHAIN) {
    try {
      const out = execFileSync("security", ["find-generic-password", "-s", "vibecoin", "-a", name, "-w"], {
        stdio: ["ignore", "pipe", "ignore"],
      });
      const pw = out.toString("utf8").replace(/\n$/, "");
      if (pw.length > 0) return [pw, "keychain"];
    } catch {
      // fall through to key file
    }
  }
  const kf = path.join(VIBECOIN_HOME(), "keys", `${name}.key`);
  if (fs.existsSync(kf)) return [fs.readFileSync(kf, "utf8"), "keyfile"];
  return null;
}

export function readEvmWalletFile(name: string): EvmWalletFile {
  if (!evmWalletExists(name)) {
    throw new Error(`EVM wallet "${name}" not found — create one with evm_wallet (action: "create")`);
  }
  return JSON.parse(fs.readFileSync(walletPath(name), "utf8")) as EvmWalletFile;
}

export async function loadEvmPrivateKey(name: string, password?: string): Promise<`0x${string}`> {
  const cached = sessionKeys.get(name);
  if (cached) return cached;
  const file = readEvmWalletFile(name);
  let pw: string;
  const envPw = process.env.VIBECOIN_WALLET_PASSWORD;
  if (envPw) pw = envPw;
  else if (password) pw = password;
  else {
    const stored = storedPassword(name);
    if (!stored) {
      throw new Error(
        `no password available for wallet "${name}" — set VIBECOIN_WALLET_PASSWORD, pass a password, or restore its stored secret`,
      );
    }
    pw = stored[0];
  }
  const secret = decryptSecretKey(file.crypto, pw);
  const key = `0x${Buffer.from(secret).toString("hex")}` as `0x${string}`;
  if (privateKeyToAccount(key).address !== file.address) {
    throw new Error(`wallet "${name}" decrypted to an unexpected key — file may be corrupted`);
  }
  sessionKeys.set(name, key);
  return key;
}

export function listEvmWallets(): { name: string; address: string; createdAt: string }[] {
  const dir = evmWalletDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const file = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as EvmWalletFile;
      return { name: file.name, address: file.address, createdAt: file.createdAt };
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
