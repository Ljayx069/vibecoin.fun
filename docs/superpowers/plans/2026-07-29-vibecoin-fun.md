# vibecoin.fun Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship vibecoin.fun — a Claude Code–native Solana token launchpad: a 7-tool MCP server that launches pump.fun tokens via PumpPortal local transactions with local-only keys, plus a live Next.js site (landing + /projects + registry/metadata APIs) deployed to Vercel at vibecoin.fun.

**Architecture:** Monorepo. `mcp/` is a self-contained TypeScript ESM npm package (stdio MCP server) with zero native deps; all txs are built by PumpPortal/Jupiter, signed locally, submitted to a configurable RPC. `web/` is Next.js 15 App Router + Tailwind v4, Vercel Blob for the launch registry and hosted token metadata. Spec: `docs/superpowers/specs/2026-07-29-vibecoin-fun-design.md` (single source of truth for external API contracts and fee numbers).

**Tech Stack:** TypeScript, @modelcontextprotocol/sdk, @solana/web3.js v1, bs58, zod, vitest, Next.js 15, Tailwind CSS v4, @vercel/blob, Vercel CLI, gh CLI.

## Global Constraints

- Node ≥ 18.17; `mcp/` package is ESM (`"type": "module"`), builds with `tsc` to `dist/`, bin `vibecoin-mcp`, **no native dependencies** (crypto via `node:crypto`).
- PumpPortal local endpoint: `POST https://pumpportal.fun/api/trade-local` (no API key). Create body: `{publicKey, action:"create", tokenMetadata:{name,symbol,uri}, mint:<mintPubkeyB58>, denominatedInSol:"true"|"false", amount, slippage, priorityFee, pool:"pump"}`. Response: raw serialized VersionedTransaction bytes. Sign create with `[mintKeypair, wallet]`; collectCreatorFee body `{publicKey, action:"collectCreatorFee", priorityFee}` signs `[wallet]` only.
- Jupiter: `GET https://api.jup.ag/swap/v2/order` → sign → `POST https://api.jup.ag/swap/v2/execute`. Optional `JUP_API_KEY` header `x-api-key`. SOL `So11111111111111111111111111111111111111112`, USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.
- Market data: `GET https://api.dexscreener.com/latest/dex/tokens/{mint}`, pick highest-liquidity pair, tolerate empty.
- Wallet security: scrypt(N=2^15,r=8,p=1) + AES-256-GCM; `~/.vibecoin/` 0700, wallet files 0600; auto-generated password stored in macOS Keychain (`security` CLI) or `~/.vibecoin/keys/<name>.key` 0600; resolution order env `VIBECOIN_WALLET_PASSWORD` → `password` param → stored secret. `VIBECOIN_HOME` env overrides base dir (tests + isolation).
- Every mutating tool is two-phase: without `confirm:true` return a preview (details + costs) and instruct the model to get explicit user approval; only send when `confirm:true`. `dry_run` param / `VIBECOIN_DRY_RUN=1` builds + simulates but never sends.
- Copy rules: NEVER claim fees pay Anthropic/OpenAI bills (fiat-only, verified); no OpenRouter automation claims (their crypto API is dead — 410); all site copy ORIGINAL wording, structure mirrors vibecoins.ai; fee numbers come from design doc §External APIs.
- Design tokens: bg `#0d0d0d`, fg `#e0e0e0`, muted `#888`, accent `#00ff88` (hover `#00cc6a`), border `#2a2a2a`, code-bg `#1a1a1a`; Geist Mono everywhere; layout `max-w-3xl mx-auto px-6 py-12`, sections `space-y-12`.
- Deploy: GitHub `thetriggeredkid-spec/vibecoin.fun` (monorepo) + `thetriggeredkid-spec/vibecoin-mcp` (mirror of `mcp/` for `npx github:`); Vercel account `chamanagements-1453`, project root `web/`, Blob store, domain `vibecoin.fun`.
- Commit after every task (`feat:`/`test:`/`docs:`/`chore:` prefixes).

## File Structure

```
vibecoin.fun/
├── .mcp.json                      # registers built server for this repo's Claude sessions
├── README.md                      # monorepo overview
├── scripts/publish-mcp.sh         # mirror mcp/ → vibecoin-mcp repo (git subtree)
├── mcp/
│   ├── package.json  tsconfig.json  vitest.config.ts  README.md
│   ├── assets/placeholder-{0..3}.png       # bundled fallback token images
│   └── src/
│       ├── index.ts               # server bootstrap + tool registration
│       ├── config.ts              # env, paths, endpoints, constants
│       ├── keystore.ts            # encrypt/decrypt, secret store, wallet files
│       ├── solana.ts              # connection, balances, transfer, send/simulate
│       ├── pumpportal.ts          # trade-local client + metadata upload client
│       ├── jupiter.ts             # order/execute client
│       ├── market.ts              # dexscreener lookup + formatters
│       ├── draft.ts               # repo → token draft inference
│       ├── registry.ts            # launches.json + site registry POST
│       ├── locker.ts              # creator vesting (per research; feature-flagged)
│       └── tools/{info,wallet,launch,my-coins,collect-fees,fund-agent,lock}.ts
│   └── test/{keystore,draft,pumpportal,jupiter,market,registry,integration}.test.ts
└── web/
    ├── package.json  next.config.ts  tsconfig.json  postcss.config.mjs
    ├── app/{layout.tsx, page.tsx, globals.css}
    ├── app/projects/page.tsx
    ├── app/api/{registry,metadata,projects}/route.ts
    ├── components/{Masthead,Section,CodeBlock,ToolsTable,FeeTables,ProjectsTable,Footer}.tsx
    ├── lib/{store.ts, market.ts, validate.ts, format.ts}
    └── data/.gitkeep               # local-dev fallback store dir
```

---

### Task 1: MCP scaffold + config

**Files:** Create `mcp/package.json`, `mcp/tsconfig.json`, `mcp/vitest.config.ts`, `mcp/src/config.ts`, `mcp/.gitignore`, root `.gitignore`.

**Interfaces produced:** `config.ts` exports `VIBECOIN_HOME()`, `WALLETS_DIR()`, `KEYS_DIR()`, `LAUNCHES_FILE()`, `CONFIG_FILE()` (all honoring `process.env.VIBECOIN_HOME` at call time, default `~/.vibecoin`), `ENDPOINTS` (pumpPortal, metadataUpload, registry, dexScreener, jupiterOrder, jupiterExecute — each overridable via env `VIBECOIN_*_URL`/`JUP_*`), `MINTS.SOL/USDC`, `DEFAULTS` (priorityFee 0.00005, slippage 10, pool "pump", gasReserveSol 0.01), `isDryRun(param?)`.

- [ ] Step 1: `mkdir -p mcp/src mcp/test mcp/assets` and write package.json: name `vibecoin-mcp`, version 0.1.0, `"type":"module"`, bin `{"vibecoin-mcp":"dist/index.js"}`, files `[dist, assets, README.md]`, scripts `{build:"tsc", test:"vitest run", prepare:"npm run build"}`, deps `@modelcontextprotocol/sdk`, `@solana/web3.js@^1`, `bs58`, `zod`; devDeps `typescript`, `vitest`, `@types/node`. tsconfig: `module/moduleResolution: NodeNext`, target ES2022, outDir dist, rootDir src, strict, declaration false.
- [ ] Step 2: Write `src/config.ts` per interface above (functions not constants for paths so `VIBECOIN_HOME` env changes take effect in tests).
- [ ] Step 3: `cd mcp && npm install && npm run build` — expect clean compile. Commit `chore: scaffold vibecoin-mcp package`.

### Task 2: keystore (TDD)

**Files:** Create `mcp/src/keystore.ts`, `mcp/test/keystore.test.ts`.

**Interfaces produced:**
```ts
export interface WalletFile { version: 1; name: string; publicKey: string; createdAt: string;
  crypto: { kdf: "scrypt"; N: number; r: number; p: number; salt: string; iv: string; tag: string; ciphertext: string } }
export function encryptSecretKey(secretKey: Uint8Array, password: string): WalletFile["crypto"];
export function decryptSecretKey(c: WalletFile["crypto"], password: string): Uint8Array; // throws Error("wallet decryption failed — wrong password?")
export async function createWallet(name: string, password?: string): Promise<{ publicKey: string; passwordMode: "env"|"param"|"keychain"|"keyfile" }>;
export async function loadKeypair(name: string, password?: string): Promise<Keypair>;
export function listWallets(): { name: string; publicKey: string; createdAt: string }[];
export function walletExists(name: string): boolean;
export function resolveStoredPassword(name: string): string | null;   // keychain (darwin, via execFileSync security) → keyfile → null
export function storeGeneratedPassword(name: string, pw: string): "keychain"|"keyfile";
```

- [ ] Step 1: failing tests in `test/keystore.test.ts` (set `process.env.VIBECOIN_HOME` to a fresh `fs.mkdtempSync` dir in `beforeEach`; set `VIBECOIN_NO_KEYCHAIN=1` so tests use keyfile path deterministically):
```ts
it("roundtrips a secret key", () => {
  const kp = Keypair.generate();
  const enc = encryptSecretKey(kp.secretKey, "hunter2");
  expect(decryptSecretKey(enc, "hunter2")).toEqual(kp.secretKey);
});
it("fails cleanly on wrong password", () => {
  const enc = encryptSecretKey(Keypair.generate().secretKey, "right");
  expect(() => decryptSecretKey(enc, "wrong")).toThrow(/wrong password/);
});
it("creates wallet with auto password, 0600 perms, and loads it back", async () => {
  const { publicKey, passwordMode } = await createWallet("proj");
  expect(passwordMode).toBe("keyfile");
  const st = fs.statSync(path.join(process.env.VIBECOIN_HOME!, "wallets", "proj.json"));
  expect(st.mode & 0o777).toBe(0o600);
  const kp = await loadKeypair("proj");
  expect(kp.publicKey.toBase58()).toBe(publicKey);
});
it("refuses duplicate wallet names", async () => {
  await createWallet("dup");
  await expect(createWallet("dup")).rejects.toThrow(/exists/);
});
```
- [ ] Step 2: `npx vitest run test/keystore.test.ts` → FAIL (module missing).
- [ ] Step 3: implement keystore.ts — scrypt via `crypto.scryptSync(password, salt, 32, {N:32768, r:8, p:1, maxmem:64*1024*1024})`, AES-256-GCM via `createCipheriv`; `mkdirSync(dir,{recursive:true,mode:0o700})`, `writeFileSync(file, json, {mode:0o600})`; password resolution env → param → stored secret; keychain via `execFileSync("security", ["add-generic-password","-s","vibecoin","-a",name,"-w",pw,"-U"])` / `find-generic-password -s vibecoin -a name -w` guarded by `process.platform==="darwin" && !VIBECOIN_NO_KEYCHAIN`, wrapped in try/catch falling back to keyfile; generated password = `randomBytes(32).toString("base64url")`.
- [ ] Step 4: tests PASS. Commit `feat(mcp): encrypted local wallet keystore`.

### Task 3: solana helpers (TDD where meaningful)

**Files:** Create `mcp/src/solana.ts`, `mcp/test/solana.test.ts`.

**Interfaces produced:**
```ts
export function getConnection(): Connection;                       // SOLANA_RPC_URL || mainnet-beta public
export async function getSolBalance(conn, pubkey): Promise<number>;      // SOL (÷1e9)
export async function getUsdcBalance(conn, owner): Promise<number>;      // via ATA (manual PDA derivation, TOKEN_PROGRAM_ID + ASSOCIATED_TOKEN_PROGRAM_ID constants), 0 when no account
export function ataFor(owner: PublicKey, mint: PublicKey): PublicKey;
export async function buildSolTransfer(conn, from: PublicKey, to: PublicKey, sol: number): Promise<VersionedTransaction>; // v0 message
export async function sendSigned(conn, tx: VersionedTransaction): Promise<string>;         // sendTransaction + confirmTransaction, returns signature
export async function simulate(conn, tx): Promise<{ ok: boolean; logs: string[]; err?: string }>;
export const EXPLORER = { tx:(sig)=>`https://solscan.io/tx/${sig}`, addr:(a)=>`https://solscan.io/account/${a}`, token:(m)=>`https://solscan.io/token/${m}` };
```

- [ ] Step 1: tests — `ataFor` derives the canonical USDC ATA for a fixed pubkey (assert against value computed in-test via `PublicKey.findProgramAddressSync`), `buildSolTransfer` produces a v0 tx whose sole instruction is a SystemProgram transfer of the right lamports (deserialize message and assert), `getUsdcBalance` returns 0 for a stub connection whose `getTokenAccountBalance` throws "could not find account".
- [ ] Step 2: run → FAIL. Step 3: implement (constants: TOKEN_PROGRAM `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`, ATA program `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL`). Step 4: PASS. Commit `feat(mcp): solana connection + balance + transfer helpers`.

### Task 4: pumpportal client + hosted metadata upload (TDD, mocked fetch)

**Files:** Create `mcp/src/pumpportal.ts`, `mcp/test/pumpportal.test.ts`.

**Interfaces produced:**
```ts
export interface TokenMeta { name: string; symbol: string; description: string; imagePath?: string;
  website?: string; twitter?: string; telegram?: string; github?: string }
export async function uploadMetadata(meta: TokenMeta): Promise<{ metadataUri: string; imageUri?: string }>;
  // default: POST ENDPOINTS.metadataUpload (vibecoin.fun/api/metadata) with JSON {name,symbol,description,website,twitter,telegram,github,imageBase64,imageContentType}
  // if PINATA_JWT set: two uploads to https://uploads.pinata.cloud/v3/files (image then metadata JSON w/ {name,symbol,description,image,website,twitter,telegram,showName:"true",createdOn:"https://vibecoin.fun"}), uri = https://ipfs.io/ipfs/<cid>
export async function buildCreateTx(a: { creator: PublicKey; mintPubkey: PublicKey; meta:{name,symbol}; metadataUri: string;
  devBuySol: number; slippage?: number; priorityFee?: number }): Promise<VersionedTransaction>;
export async function buildCollectCreatorFeeTx(a: { creator: PublicKey; priorityFee?: number }): Promise<VersionedTransaction>;
```

- [ ] Step 1: tests stub `globalThis.fetch`. For buildCreateTx: assert URL `https://pumpportal.fun/api/trade-local`, method POST, header content-type json, and body exactly `{publicKey:<b58>, action:"create", tokenMetadata:{name,symbol,uri}, mint:<b58>, denominatedInSol:"true", amount:0.001, slippage:10, priorityFee:0.00005, pool:"pump"}`; mock 200 response whose arrayBuffer is a real serialized `VersionedTransaction` (build one in-test from a dummy TransferInstruction) and assert deserialization returns a VersionedTransaction. Non-200 → throws message containing status text + hint. collectCreatorFee body exactly `{publicKey, action:"collectCreatorFee", priorityFee}`. uploadMetadata default path: assert single POST to metadata endpoint with base64 image + fields; Pinata path (set `PINATA_JWT`): two POSTs to `uploads.pinata.cloud/v3/files` with `Authorization: Bearer`, metadata JSON includes `showName:"true"` and `createdOn:"https://vibecoin.fun"`.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS. Commit `feat(mcp): pumpportal trade-local client + metadata upload`.

### Task 5: draft inference (TDD, fixture repos)

**Files:** Create `mcp/src/draft.ts`, `mcp/test/draft.test.ts`, fixtures under `mcp/test/fixtures/{full-repo,bare-repo}/`.

**Interfaces produced:**
```ts
export interface TokenDraft { name: string; symbol: string; description: string; website?: string; github?: string;
  imagePath?: string; imageSource: "repo"|"placeholder"; sources: string[] }
export async function draftFromProject(cwd: string): Promise<TokenDraft>;
export function suggestSymbol(name: string): string;  // uppercase, alnum only, 3–8 chars
```
Rules: name ← README `# Title` → package.json `name` (de-kebabed, title-cased) → dir name. description ← first non-badge README paragraph (≤500 chars) → package.json description → "Launched from a Claude Code session with vibecoin." website ← package.json `homepage`. github ← `git config --get remote.origin.url` normalized (`git@github.com:u/r.git` and `https://github.com/u/r.git` → `https://github.com/u/r`). image ← first existing of `logo.png|logo.svg|icon.png|assets/logo.png|public/logo.png|public/icon.png` else bundled placeholder chosen by `hash(name) % 4` from `mcp/assets/`. `sources` lists which files informed the draft.

- [ ] Step 1: fixture `full-repo` (README with title+paragraph, package.json with homepage, fake `.git/config` with origin — read via `git -C` fallback to parsing `.git/config` when git absent; simplest: implement `readGitRemote(cwd)` that parses `.git/config` text directly, no subprocess). Tests: full-repo yields all fields with `imageSource:"repo"` when logo.png present; bare-repo (empty dir) yields dir-name draft, placeholder image, fallback description; `suggestSymbol("My Cool App") === "MCA"`-style behavior (assert `/^[A-Z0-9]{3,8}$/` and specific value "MYCOOL" per implemented rule: strip non-alnum, if ≥2 words use initials padded from first word, else first 6 chars).
- [ ] Step 2: FAIL. Step 3: implement exactly the documented precedence; symbol rule: words = name split on non-alnum; if words.length ≥ 3 → initials; else first word's first 6 letters; uppercase; pad with second word letters to reach 3 if short. Step 4: PASS. Commit `feat(mcp): token draft inference from project files`.

### Task 6: registry + market clients (TDD, mocked fetch)

**Files:** Create `mcp/src/registry.ts`, `mcp/src/market.ts`, `mcp/test/{registry,market}.test.ts`.

**Interfaces produced:**
```ts
// registry.ts
export interface LaunchRecord { mint: string; name: string; symbol: string; description: string;
  image?: string; github?: string; website?: string; creator: string; wallet: string; signature: string; createdAt: string }
export function recordLaunch(rec: LaunchRecord): void;             // append ~/.vibecoin/launches.json (create if missing)
export function listLaunches(): LaunchRecord[];
export async function postToSiteRegistry(rec: LaunchRecord): Promise<{ ok: boolean; note?: string }>; // never throws
// market.ts
export interface MarketData { priceUsd?: number; marketCapUsd?: number; volume24hUsd?: number; priceChange24h?: number;
  liquidityUsd?: number; dexUrl?: string; pairAddress?: string }
export async function fetchMarket(mint: string): Promise<MarketData | null>;  // null when no pairs yet
export function fmtUsd(n?: number): string;   // $1.23M / $45.6K / $0.0012 / "—"
```

- [ ] Step 1: tests — recordLaunch/listLaunches roundtrip in tmp VIBECOIN_HOME; postToSiteRegistry returns `{ok:false,note}` (not throw) when fetch rejects; fetchMarket picks the pair with max `liquidity.usd` from a 2-pair fixture and maps fields; returns null for `{pairs:null}`; fmtUsd cases: `1234567→"$1.23M"`, `45600→"$45.6K"`, `0.00123→"$0.00123"`, `undefined→"—"`.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS. Commit `feat(mcp): launch registry + dexscreener market data`.

### Task 7: jupiter client (TDD, mocked fetch)

**Files:** Create `mcp/src/jupiter.ts`, `mcp/test/jupiter.test.ts`.

**Interfaces produced:**
```ts
export interface SwapQuote { requestId: string; txBase64: string; inLamports: number; outUsdcMinor: number; feeBps: number; router: string }
export async function quoteSolToUsdc(a: { taker: PublicKey; sol: number; slippageBps?: number }): Promise<SwapQuote>;   // GET /order; throws with errorMessage when transaction empty
export async function executeSwap(a: { signedTx: VersionedTransaction; requestId: string }): Promise<{ signature: string; outUsdc: number }>; // POST /execute; throws unless status==="Success"
```

- [ ] Step 1: tests assert order URL/query (`inputMint` SOL, `outputMint` USDC, `amount` lamports, `taker`, `slippageBps`), optional `x-api-key` only when `JUP_API_KEY` set; execute body `{signedTransaction:<b64>, requestId}`; error paths (empty `transaction` → throw errorMessage; `status:"Failed"` → throw error).
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS. Commit `feat(mcp): jupiter swap v2 client`.

### Task 8: MCP tools + server + integration test

**Files:** Create `mcp/src/index.ts`, `mcp/src/tools/*.ts` (7 files), `mcp/test/integration.test.ts`, `mcp/assets/placeholder-{0..3}.png` (generate 64×64 solid-color PNGs via a small script using raw zlib PNG encoding in-test-free script `scripts/gen-placeholders.mjs` run once), `.mcp.json` at repo root pointing at `node mcp/dist/index.js`.

**Interfaces consumed:** everything above.
**Tool contracts (registered via `McpServer.registerTool`, zod schemas, every handler returns `{content:[{type:"text",text}]}`):**
- `info` `{}` → platform overview, fee table (numbers from design doc), endpoints, paths, wallet list, links.
- `wallet` `{action:"create"|"status"|"balance"|"transfer", name?, to?, sol?, password?, confirm?}` — create defaults name→`path.basename(process.cwd())`; transfer previews (to, amount, balance after, ~fee) unless `confirm:true`.
- `launch` `{name?, symbol?, description?, website?, twitter?, telegram?, image_path?, dev_buy_sol?=0, wallet?, slippage?, priority_fee?, confirm?, dry_run?}` — phase 1 (no confirm): draft via `draftFromProject(cwd)` merged with overrides → preview block: token card, metadata field table (what goes where), costs (network fee est, dev buy, PumpPortal 0.5% on dev buy only, rent ~0.02 SOL), wallet + balance check, "reply yes → call again with confirm:true". Phase 2: ensure wallet (auto-create), `uploadMetadata` → `buildCreateTx` → sign `[mint, wallet]` → dry_run? simulate+report : `sendSigned` → `recordLaunch` → `postToSiteRegistry` → links (pump.fun/coin/<mint>, solscan, site project page). Mint keypair `Keypair.generate()`.
- `my-coins` `{}` → table of `listLaunches()` + `fetchMarket` each (Promise.allSettled).
- `collect-fees` `{wallet?, priority_fee?, confirm?, dry_run?}` — preview: wallet, claim-all note; confirm: build → sign → send → SOL delta (balance before/after).
- `fund-agent` `{wallet?, sol_amount?, keep_sol?=0.01, collect_first?=true, slippage_bps?=100, confirm?, dry_run?}` — preview: optional collect, swap quote (out USDC, feeBps, router) + reserve; confirm: (collect) → quote fresh → sign → execute → report USDC budget + honest note ("budget stays in your wallet; top up providers manually").
- `lock` — per Task 12 (research-gated).
- [ ] Step 1: `scripts/gen-placeholders.mjs` writes 4 valid PNGs (encode IHDR/IDAT via `zlib.deflateSync`; 64×64 solid colors #00ff88/#00cc6a/#0d0d0d-green-border variants); run it; commit assets.
- [ ] Step 2: integration test: build server, connect via `@modelcontextprotocol/sdk` `Client` + `StdioClientTransport` spawning `node dist/index.js` with `VIBECOIN_HOME=<tmp>`, `VIBECOIN_NO_KEYCHAIN=1`: `tools/list` returns 7 tools; `info` text contains "pump.fun"; `wallet {action:"create"}` returns a base58 pubkey and file exists 0600; `wallet {action:"transfer", to:<pk>, sol:0.001}` WITHOUT confirm returns preview containing "confirm"; `launch {}` (no confirm) against fixture cwd returns draft preview containing name + symbol + "confirm: true". (Network-free: phase 1 does no fetch; balance sub-call tolerates RPC failure by reporting "unavailable".)
- [ ] Step 3: FAIL → implement index.ts + tools. Step 4: integration test PASS. Commit `feat(mcp): 7 MCP tools + stdio server`.

### Task 9: web scaffold + design system

**Files:** Create `web/` via `npx create-next-app@latest web --ts --app --tailwind --no-eslint --src-dir=false --import-alias "@/*" --use-npm --yes`, then rewrite `app/globals.css` (CSS vars = design tokens; `body { font-family: var(--font-mono); background: var(--background); color: var(--foreground) }`), `app/layout.tsx` (Geist Mono via `next/font/google` `Geist_Mono`, metadata: title `vibecoin - Launch coins on Solana`, description `Launch SPL tokens on pump.fun's bonding curve from Claude Code — an MCP-native launchpad`), shared components `components/{Section,CodeBlock,Masthead,Footer}.tsx`.

**Interfaces produced:** `Section({id,title,children})` anchor-linkable `h2` sections; `CodeBlock({children, lang?})` dark panel w/ green mono text + copy button (client comp); `Masthead({active}: {active?: "projects"})` — h1 wordmark `vibecoin` in `#00ff88` + tagline + anchor nav (install/how-it-works/bonding-curve/fees/fund-your-agent/api) + `Projects` link + solid-green `Trade →` pill → /projects; `Footer` — original line + links to Claude Code GitHub + our GitHub repo.

- [ ] Steps: scaffold → replace styles/layout → `npm run build` green → commit `feat(web): scaffold + design system`.

### Task 10: registry/metadata/projects APIs + lib

**Files:** Create `web/lib/{store.ts,validate.ts,market.ts,format.ts}`, `web/app/api/registry/route.ts`, `web/app/api/metadata/route.ts`, `web/app/api/projects/route.ts`, `web/test/*.test.ts` (vitest for lib), `web/data/.gitkeep`.

**Interfaces produced:**
```ts
// store.ts — Blob when BLOB_READ_WRITE_TOKEN set, else web/data/*.json files
export async function readRegistry(): Promise<LaunchRecord[]>;
export async function appendRegistry(rec: LaunchRecord): Promise<void>;      // dedupe by mint
export async function putMetadataBlob(id: string, json: object): Promise<string>;  // returns public URL
export async function putImageBlob(id: string, bytes: Buffer, contentType: string): Promise<string>;
// validate.ts
export function validateLaunch(body: unknown): LaunchRecord;     // zod: mint b58 32–44, name ≤32, symbol ≤10 uppercase-ok, description ≤1000, urls http(s), else 400
export function validateMetadata(body: unknown): { name; symbol; description; website?; twitter?; telegram?; github?; imageBase64?; imageContentType? }; // image ≤ 1.5MB decoded, type png/jpe?g/gif/webp
```
Routes: `POST /api/registry` → 201 `{ok:true}` (409 on dupe mint); `POST /api/metadata` → stores image (if any) + Metaplex-style JSON `{name,symbol,description,image,website,twitter,telegram,showName:"true",createdOn:"https://vibecoin.fun"}` → `{metadataUri, imageUri}`; `GET /api/projects` → registry merged with DexScreener (`lib/market.ts`, 60s in-memory + `revalidate=60`), shape `{projects:[{...rec, market:{priceUsd,marketCapUsd,volume24hUsd,priceChange24h,dexUrl}}]}`, sorted marketCap desc.

- [ ] Steps: vitest for validate + store file-fallback + format (same fmtUsd cases as Task 6) → FAIL → implement → PASS → `npm run build` → commit `feat(web): registry, metadata hosting, projects API`.

### Task 11: landing page + /projects page (original copy)

**Files:** Create `components/{ToolsTable,FeeTables,ProjectsTable}.tsx`, rewrite `app/page.tsx`, create `app/projects/page.tsx`.

Landing sections in order (all copy ORIGINAL wording, structure mirrors vibecoins.ai; every numeric fact from design doc §External APIs): Masthead → `#install` Installation (claude mcp add snippet + manual `~/.claude.json` JSON + restart note) → `#how-it-works` (4 short paragraphs: one-prompt launch; encrypted local wallet, keys never leave machine, auto-password = no interactive steps; pump.fun bonding curve as open prediction market on your app, creator fees on every trade; fresh wallet per project = pseudonymous by default. Then "Available tools" table: 7 tools) → `#bonding-curve` (pump.fun mechanics: 1B supply, curve → graduation threshold → PumpSwap migration, LP handling; numbers from design doc) → `#fees` (tables: launch cost / trade fees; distribution: creator share vs pump.fun protocol vs PumpPortal 0.5% API fee on trades; "creation itself is free — you pay network rent + optional dev buy") → `#fund-your-agent` (differentiator section: collect-fees → Jupiter SOL→USDC → budget lives in the agent's wallet; explicit honesty note: does NOT pay Anthropic/OpenAI bills — those are fiat-only; OpenRouter top-up is manual via their site) → `#projects` (short pitch: every coin ships with repo + live URL; link/preview → /projects) → `#api` (endpoints GET /api/projects + POST /api/registry + POST /api/metadata with example curl + response JSON + fields table INCLUDING the full token-metadata field guide table from the design doc) → Footer.
`/projects`: `"use client"` table fetching `/api/projects` — columns Name (name + symbol chip + truncated description w/ title tooltip), Price, Market Cap, Volume, Links (Solscan / DexScreener / Web / GitHub — tiny gray→green), Trade (green `Trade →` → `https://pump.fun/coin/<mint>`); states: loading / error / "No projects launched yet — be the first" + install CTA; sorted by marketCap desc client-side.

- [ ] Steps: implement → `npm run build` green → commit `feat(web): landing + projects pages`.

### Task 12: lock tool (research-gated)

**Files:** Create `mcp/src/locker.ts`, `mcp/src/tools/lock.ts`, `mcp/test/locker.test.ts`.

Branch on the lock-SDK research verdict recorded in the design doc:
- **If Streamflow SDK is usable** (`@streamflow/stream` current, TS, mainnet): `lock {percent, months, wallet?, confirm?, dry_run?}` — phase 1 preview: token balance, amount = balance×percent, unlock date, Streamflow protocol fee, proof URL format; phase 2: SDK `create` vesting stream to self (cliff = full duration, no partial unlocks), return `https://app.streamflow.finance/contract/solana/mainnet/<id>`. Unit test mocks the SDK client (inject via constructor param) asserting params; no network.
- **If not usable**: `lock` returns a clear "not available in v1" message with manual lock instructions (Streamflow app URL) and the roadmap note; site copy mentions locking as optional manual step. Keep tool registered so the surface is stable.
- [ ] Steps: per branch → tests → commit `feat(mcp): creator vesting lock` or `feat(mcp): lock tool (manual-flow v1)`.

### Task 13: docs — MCP README + monorepo README + metadata guide

**Files:** Create `mcp/README.md`, `README.md`, `scripts/publish-mcp.sh`.

mcp/README: what it is, install (claude mcp add + JSON + git-clone variant), tools table, **Token metadata field guide** (full table from design doc: field → where it goes → constraints → who fills it), env var table (`SOLANA_RPC_URL`, `VIBECOIN_WALLET_PASSWORD`, `VIBECOIN_HOME`, `VIBECOIN_DRY_RUN`, `PINATA_JWT`, `JUP_API_KEY`, `VIBECOIN_REGISTRY_URL`, `VIBECOIN_METADATA_URL`, `VIBECOIN_NO_KEYCHAIN`), security section (scrypt+GCM, 0600, keychain, keys never leave machine, what auto-password does/doesn't protect), fees section (from design doc), honest fund-agent note. Root README: monorepo map, dev quickstart, deploy notes. publish-mcp.sh: `git subtree split -P mcp -b mcp-publish && git push <mcp-repo> mcp-publish:main --force`.
- [ ] Steps: write → commit `docs: READMEs + metadata field guide + publish script`.

### Task 14: GitHub push + Vercel production deploy + domain

- [ ] `gh repo create thetriggeredkid-spec/vibecoin.fun --public --source . --push` (monorepo) and `gh repo create thetriggeredkid-spec/vibecoin-mcp --public` + run `scripts/publish-mcp.sh`; verify `npx github:thetriggeredkid-spec/vibecoin-mcp --help`-style resolution locally (npx installs + prepare builds).
- [ ] Update install snippets across site/READMEs to the real repo path (already `thetriggeredkid-spec/vibecoin-mcp`); recommit if changed.
- [ ] `cd web && vercel link --yes` (project `vibecoin-fun`, scope `chamanagements-1453`) → `vercel blob store add vibecoin-registry` + connect env (`BLOB_READ_WRITE_TOKEN`) → `vercel deploy --prod` → `vercel domains add vibecoin.fun` + `vercel alias`/project domain attach (+ `www.vibecoin.fun` redirect). If the domain isn't in the account: print required DNS records (A 76.76.21.21 / CNAME cname.vercel-dns.com) and continue on the `.vercel.app` URL, flagging it in the final report.
- [ ] Commit any config artifacts (`web/.vercel/` is gitignored; `vercel.json` if created).

### Task 15: end-to-end verification (evidence, no unfunded sends)

- [ ] MCP: full `vitest run` green; integration suite green.
- [ ] Live site: `curl -sI https://vibecoin.fun` (or .vercel.app) → 200; `GET /api/projects` → `{projects:[]}`; `POST /api/metadata` with a tiny test payload → returns working `metadataUri` whose GET returns the JSON (then note test blob); `POST /api/registry` with an invalid body → 400.
- [ ] Launch-path proof without spending: `VIBECOIN_HOME=<tmp>` wallet create (real keychain path on this Mac), `launch` phase-1 preview on a fixture project, then phase-2 with `dry_run:true` pointed at the LIVE metadata endpoint + real PumpPortal: metadata uploads for real, trade-local returns a real unsigned create tx, we sign with throwaway keys and `simulateTransaction` on mainnet RPC — expect simulation reaches the program and fails ONLY on insufficient funds for the empty wallet (proves the whole pipeline). Record tx summary in report.
- [ ] `collect-fees` + `fund-agent` previews with the empty wallet → clean actionable errors (no stack traces).
- [ ] Register `.mcp.json` in repo root; note that a real funded launch is one prompt away (fund wallet → `launch` → confirm).
- [ ] Final commit + push; update task list; write memory file for the project.

## Self-Review Notes

- Spec coverage: 7 tools (T8, T12), keystore/no-interactive-password (T2), PumpPortal contract (T4), draft+approval (T5, T8), registry+metadata hosting (T10), landing+projects w/ structure mirror + original copy (T9, T11), fees honesty + fund-agent honesty (T11, T13), metadata field guide in three places (T8 preview, T11 API section, T13 README), deploy+domain (T14), verification incl. launch-path simulation (T15). Lock = T12 research-gated per spec.
- Types consistent: `LaunchRecord` defined once in registry.ts and mirrored in web/lib (kept structurally identical; web validates with zod).
- No placeholders: fee NUMBERS intentionally referenced to design doc §External APIs (single source of truth, filled from live research) rather than duplicated here.
