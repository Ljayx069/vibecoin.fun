# vibecoin.fun — Design

**Date:** 2026-07-29
**Status:** Approved spec provided by user; this doc records the concrete design decisions and verified external facts.

## What we're building

A Claude Code–native token launchpad for Solana, modeled on vibecoins.ai (same narrative and page structure, original copy), piggybacking on pump.fun via the PumpPortal Local Transaction API. No custom on-chain programs, no custody: every transaction is built remotely (unsigned), signed locally with an encrypted keypair that never leaves the machine, and submitted to a configurable Solana RPC.

**Name:** `vibecoin.fun` (site + working dir), MCP server package `vibecoin-mcp`, MCP config name `vibecoin`.

**Audience framing:** builders tokenizing real projects (repo + live URL attached to every launch), not meme degens. No trending feeds, no king-of-the-hill.

## Repo layout (monorepo)

```
vibecoin.fun/
├── mcp/          # TypeScript MCP server (self-contained npm package `vibecoin-mcp`)
│   ├── src/
│   │   ├── index.ts            # entry: stdio server, tool registration
│   │   ├── config.ts           # env + paths (~/.vibecoin/), constants
│   │   ├── keystore.ts         # scrypt + AES-256-GCM encrypted wallet files
│   │   ├── solana.ts           # connection, send+confirm, balance helpers
│   │   ├── pumpportal.ts       # trade-local API client (create/collect fee), IPFS metadata upload
│   │   ├── jupiter.ts          # quote + swap SOL→USDC
│   │   ├── draft.ts            # infer token name/ticker/description from README/package.json/git remote
│   │   ├── registry.ts         # local launches.json + best-effort POST to site registry
│   │   ├── market.ts           # market data lookup per mint (DexScreener/pump.fun public data)
│   │   ├── lock.ts             # creator vesting via third-party locker (feature-flagged)
│   │   └── tools/              # one file per MCP tool
│   └── test/                   # vitest
├── web/          # Next.js site: landing + /projects + registry API
├── docs/superpowers/specs|plans/
└── README.md
```

The MCP package is self-contained inside `mcp/` so it can be pushed to its own repo (`github:<user>/vibecoin-mcp`) for the `npx github:` install path. Local dev install: `claude mcp add vibecoin -- node <abs path>/mcp/dist/index.js`.

## MCP server

**Stack:** TypeScript, `@modelcontextprotocol/sdk` (stdio transport), `zod` schemas, `@solana/web3.js` v1, `bs58`, Node ≥ 18.17 (built-in `fetch`), `node:crypto` for scrypt + AES-256-GCM (zero native deps so `npx github:` installs work everywhere). Build `tsc` → `dist/`, bin with shebang. Tests: vitest.

### Wallet keystore — one-prompt launch, no interactive password

User requirement: launching must work from a single chat prompt with **no `! bash` step and no password typed into the conversation**.

- Files under `~/.vibecoin/` (dir 0700): `wallets/<name>.json` (0600), `launches.json`, `config.json`.
- Encryption: scrypt (N=2^15, r=8, p=1, 32-byte salt) → AES-256-GCM (12-byte IV, auth tag stored). File holds `{version, publicKey, crypto:{kdf, salt, iv, tag, ciphertext}}`, base64 fields.
- **Password resolution order:** (1) `VIBECOIN_WALLET_PASSWORD` env; (2) explicit `password` param (discouraged — it transits the conversation); (3) **auto mode (default):** a cryptographically random passphrase is generated at wallet creation and stored in the macOS Keychain (`security add-generic-password`, service `vibecoin`, account = wallet name), with fallback to `~/.vibecoin/keys/<name>.key` chmod 0600 on non-macOS. Unlock reverses the same order. Net effect: wallet files are encrypted at rest, nothing interactive is ever required, and the password never appears in chat. Users who want a memorized password can set the env var and delete the stored secret; documented honestly (auto mode protects against wallet-file exfiltration, not a fully compromised user account).
- Fresh wallet per project by default: wallet name defaults to the current project directory name (pseudonymous by default). `wallet` tool: create / status / balance (SOL + USDC) / transfer SOL. Decrypted key cached in process memory only.

### Tools (7)

| Tool | Behavior |
|---|---|
| `wallet` | create / status / balance / transfer. Transfer requires `confirm: true` after a preview. |
| `launch` | Phase 1 (no `confirm`): read README.md, package.json, git remote → return drafted name/ticker/description/links + full cost breakdown, plus image resolution (repo logo file or bundled placeholder). Phase 2 (`confirm: true`): upload image + metadata JSON via `POST https://vibecoin.fun/api/metadata` (Vercel Blob-backed; `PINATA_JWT` env switches to direct Pinata pinning) → PumpPortal `trade-local` `create` (mint keypair generated locally; optional `dev_buy_sol` initial buy, default 0) → sign with mint + creator keys → submit to RPC → record to `~/.vibecoin/launches.json` → best-effort POST to site registry → return pump.fun URL, Solscan link, mint address. Rationale for hosted metadata: pump.fun killed its public `api/ipfs` endpoint in 2026; PumpPortal's examples now require a personal Pinata JWT, which would break zero-setup one-prompt launches. The create instruction accepts any HTTPS metadata URI (bonk.fun uses plain workers.dev URLs), so vibecoin.fun hosts it. |
| `my-coins` | List launches from this machine (all local wallets) + live market data per mint. |
| `collect-fees` | PumpPortal collect-creator-fee local tx → sign → send; report SOL balance delta. Requires `confirm: true`. |
| `fund-agent` | Loop: (optional) collect fees → keep gas reserve (default 0.01 SOL) → Jupiter quote SOL→USDC shown for approval → swap → report USDC budget in the agent wallet. v1 leaves USDC in the wallet. OpenRouter top-up only if research confirms Solana USDC is accepted; otherwise documented as roadmap and **never** promised in copy. |
| `lock` | Creator vesting: lock chosen % of creator-held tokens for a chosen duration via third-party locker (provider per research below; feature-flagged, cut cleanly if the SDK fights back). Returns shareable proof link. Requires `confirm: true`. |
| `info` | Platform overview, fee table, links, config paths. |

### Guardrails (hard rules)

- Every mutating action (`launch`, `transfer`, `collect-fees`, `fund-agent` swap, `lock`) is two-phase: first call returns a human-readable preview incl. costs; nothing is sent until the model calls again with `confirm: true` after the user says yes. Tool descriptions instruct the model to show the preview and get explicit user approval.
- `VIBECOIN_DRY_RUN=1` (or `dry_run: true` param): build everything (metadata upload skipped or simulated, tx built) but never submit; returns the would-be transaction summary. pump.fun/PumpPortal are mainnet-only per research — dry-run is our testnet substitute (confirm in research).
- Copy and tool text never claim fees pay Anthropic/OpenAI bills. Wording: "fund your agent's API budget (USDC in its wallet)".
- Keys never leave the machine; no telemetry; registry POST contains only public launch info (mint, name, ticker, links) and is best-effort.

### External APIs (verified facts)

> Filled from live-docs research on 2026-07-29. See `docs/superpowers/specs/research/` for full reports.

- **PumpPortal Local Transaction API** (verified from live docs 2026-07-29): single endpoint `POST https://pumpportal.fun/api/trade-local`, JSON body, **no API key**, 25 req/s limit. Create params: `publicKey`, `action:"create"`, `tokenMetadata:{name,symbol,uri}`, `mint` (locally-generated mint keypair's public key b58), `denominatedInSol:"true"|"false"` (strings), `amount` (dev-buy SOL), `slippage` (percent number), `priorityFee` (SOL decimal), `pool:"pump"`. Response = raw serialized `VersionedTransaction` bytes (`arrayBuffer` → `VersionedTransaction.deserialize`); sign `[mintKeypair, wallet]` for create, `[wallet]` otherwise; submit via own RPC `connection.sendTransaction`. Collect fees: `{publicKey, action:"collectCreatorFee", priorityFee}` — claims all pump.fun creator fees at once, no mint param. PumpPortal fee: **0.5% per local trade; token creation itself has no PumpPortal fee** (trading fee applies to the optional dev buy). **No devnet/testnet exists** — dry-run = build unsigned tx + `simulateTransaction` against mainnet RPC without sending. Metadata: pump.fun's old `api/ipfs` upload is dead; any HTTPS/IPFS URI serving the Metaplex-style JSON works (see `launch` row).
- **pump.fun economics** (verified from official pump-public-docs + Help Center 2026-07-29; current since Sept 1 2025 "Dynamic Fees V1"): creation **free** (first buy ~0.025 SOL network cost puts it on-chain; ~0.04 SOL total recommended incl. buffer). Bonding-curve trades: **1.25% total = 0.95% protocol + 0.30% creator**. Graduation when the curve sells out (793.1M of 1B supply, ≈85 SOL raised, ≈$69k–100k mcap depending on SOL price) → permissionless migration to PumpSwap, **0.015 SOL rent-only fee, LP tokens burned**. Post-graduation creator fee tiered by mcap: 0.30% (<420 SOL mcap band), peak **0.95%** ($85k–$300k), stepping down to **0.05% min** above ~$20M; LP 0.20%, protocol 0.05%. Fees claimable any time (permissionless `collect_creator_fee_v2` / AMM collect — what PumpPortal's `collectCreatorFee` wraps); splittable to up to 10 wallets via pump.fun (set once, then locked). Copy-safe line: "you earn 0.30% of every curve trade and up to 0.95% after graduation." ToS note: pump.fun §21(c) restricts *commercial transactions on behalf of others* — vibecoin is a local tool where creators sign and transact for themselves (we never custody or transact for users); avoid pump.fun branding beyond nominative references.
- **Market data source for `my-coins` + /projects** (tested live 2026-07-29): DexScreener free API `GET https://api.dexscreener.com/latest/dex/tokens/{mint}` — no key, returns `pairs[]` with `priceUsd`, `marketCap`, `fdv`, `volume.h24`, `priceChange`, `liquidity`, `info.imageUrl`, pair `url`; pick the highest-liquidity pair. pump.fun's `frontend-api` is Cloudflare-blocked server-side (HTTP 530 confirmed) — not used. Tokens too new for DexScreener render a "just launched — no market data yet" state.
- **Jupiter swap API** (verified 2026-07-29): Swap API v2 at `https://api.jup.ag/swap/v2` — `GET /order` (`inputMint`, `outputMint`, `amount` in lamports, `taker`, `slippageBps`) returns `{transaction: base64 unsigned v0 tx, requestId, outAmount, feeBps...}` → sign locally (`VersionedTransaction.deserialize` → `tx.sign([wallet])`) → `POST /execute` `{signedTransaction, requestId}`. Keyless tier = 0.5 RPS (plenty for occasional swaps); optional `JUP_API_KEY` env for 1+ RPS. SOL↔USDC carries a 2 bps Jupiter fee on this path — disclosed in the tool preview. Old `swap/v1` + `lite-api.jup.ag` are deprecated — do not use. SOL mint `So111...112`, USDC mint `EPjFW...Dt1v`. Signing stays local; only the signed tx goes through Jupiter's landing pipeline.
- **OpenRouter crypto top-up** (verified 2026-07-29): the programmatic charge API (`POST /api/v1/credits/coinbase`) was **removed — returns 410 Gone**; crypto purchases are web-checkout only (USDC, 5% fee, EVM settlement — Solana USDC not a documented path; crypto can't fund auto-top-up). Therefore `fund-agent` v1 = swap fees → USDC held in the agent wallet as budget; docs may mention manually topping up OpenRouter via their web checkout, and OpenRouter automation stays out of copy entirely. Anthropic + OpenAI confirmed fiat-cards-only → the "never claim it pays your Anthropic bill" guardrail stands verbatim.
- **Lock provider decision** (verified 2026-07-29): **Streamflow** — `@streamflow/stream` v13.x (npm, actively maintained — 3 releases on research day; web3.js v1 stack, Node ≥18). Token-lock recipe: `create()` with `recipient` = creator self, `tokenId` = mint, `start = cliff = unlock ts`, `cliffAmount = amount − 1`, `period = 1`, `amountPerPeriod = 1`, all cancel/transfer/topup flags false → irrevocable lock; returns `metadataId` → proof URL `https://app.streamflow.finance/contract/solana/mainnet/<metadataId>`. Cost: ~0.09–0.16 SOL + 0.19–0.5% of locked tokens (on-chain fee oracle decides; surfaced in the tool preview as a range). Mainnet program `strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m`; devnet program exists for testing. Alternatives rejected: Jupiter Lock (no official SDK — codegen required), "StakePoint" (exists but web-UI only, no SDK/API, negligible usage — debunked as integration target). pump.fun itself has no creator-lock function (it only burns LP at graduation) — third-party locker is the correct architecture, as the spec assumed.

## Website (`web/`)

**Stack:** Next.js 15 (App Router) + Tailwind CSS v4 + Geist Mono. Dark terminal aesthetic mirroring vibecoins.ai's system: `#0d0d0d` background, `#00ff88` accent (hover `#00cc6a`), surfaces `#1a1a1a`, borders `#2a2a2a`, body `#e0e0e0`, muted `#888`. All copy is original wording (spec requirement) — same section structure and spirit as vibecoins.ai, adapted to Solana/pump.fun.

**Pages (mirroring their 2-page structure):**

1. `/` single landing page, sections in order:
   - Nav: install / how it works / bonding curve / fees / projects / API (+ Trade → pump.fun profile link)
   - Hero: `vibecoin.fun` + "Launch your vibe coded app on Solana via Claude Code" + CTA
   - **Installation**: `claude mcp add vibecoin -- npx github:<user>/vibecoin-mcp` + manual `~/.claude.json` JSON block + restart note (copy buttons)
   - **How it works**: prompt-to-launch narrative (encrypted local wallet → pump.fun bonding curve → open-prediction-market framing → creator fees on every trade → fresh wallet per project = pseudonymous → fund your agent with one prompt) + **Available tools** table (our 7 tools)
   - **Bonding curve** (their "Tokenomics" slot): pump.fun mechanics — 1B supply, curve params, graduation threshold, what happens at graduation (numbers from research)
   - **Fees**: launch cost, pump.fun trade fee split, creator share, PumpPortal per-tx fee — table + fee-distribution breakdown (numbers from research)
   - **Projects**: preview grid + link to /projects
   - **API**: our public JSON endpoints (`GET /api/projects`), example request/response, fields table
   - Footer: built-for-vibe-coders line (original wording), Claude Code + GitHub links
2. `/projects` — client-fetched grid: per card → image, name, $TICKER, description, market cap / price / 24h volume, GitHub repo link, live URL, pump.fun trade link. Sorted by market cap. Honest empty state with install CTA when registry is empty.

**Registry + metadata hosting (v1, Vercel-native, no database):**
- Store: **Vercel Blob** (provisioned via CLI; `BLOB_READ_WRITE_TOKEN` in the Vercel project). Local dev falls back to `web/.data/*.json` on disk.
- `POST /api/registry` — validates + appends a launch record `{mint, name, symbol, description, image, github, website, creator, createdAt}` to a `registry.json` blob. Public data only, size caps, basic shape validation, mint-address dedupe.
- `POST /api/metadata` — accepts token image (base64 or multipart, ≤1 MB) + metadata JSON fields, writes both to Blob, returns the public metadata URI used in the pump.fun create call. Rate-limited per IP.
- `GET /api/projects` — registry entries merged with live market data (server-side fetch, cached ~60s).
- MCP `launch` POSTs both best-effort (env `VIBECOIN_REGISTRY_URL` / `VIBECOIN_METADATA_URL`, defaults on vibecoin.fun); local `launches.json` is always the source of truth for `my-coins`.

**Deployment (user requirement — live on vibecoin.fun):**
- GitHub: monorepo pushed to `github.com/thetriggeredkid-spec/vibecoin.fun`; MCP package mirrored to `github.com/thetriggeredkid-spec/vibecoin-mcp` (repo-root package.json so `npx github:thetriggeredkid-spec/vibecoin-mcp` works) via a subtree publish script.
- Vercel: project linked under account `chamanagements-1453`, `web/` as root, Blob store provisioned, production deploy, domain `vibecoin.fun` attached (DNS instructions surfaced if the domain isn't already on Vercel).

## Token metadata field guide (user requirement)

Every metadata field gets documented in three places — the site's API/docs section, the MCP README, and the `launch` tool description — so agents know exactly what to put where. Table (constraints verified against Metaplex/pump.fun behavior during build):

| Field | Where it goes | Function / constraints |
|---|---|---|
| `name` | on-chain via `tokenMetadata.name` + metadata JSON | Display name. On-chain Metaplex limit 32 chars. Drafted from package.json name / README title. |
| `symbol` | on-chain via `tokenMetadata.symbol` + JSON | Ticker shown everywhere ($XXXX). On-chain limit 10 chars; pump.fun convention is 3–8 uppercase. |
| `description` | metadata JSON | Shown on pump.fun coin page + aggregators. Drafted from README; keep ≤ ~500 chars. |
| `image` | metadata JSON (URI) | Coin avatar. Square PNG/JPG/GIF, ≤ ~1 MB recommended; repo logo if found, else bundled placeholder. |
| `website` | metadata JSON | Clickable link on the coin page — **we point this at the project's live URL** (core differentiator). |
| `twitter` / `telegram` | metadata JSON | Social links on the coin page; optional, omitted unless provided. |
| GitHub repo | our registry (+ appended to description) | pump.fun metadata has no first-class `github` field — the repo link lives in the vibecoin.fun registry, on /projects, and in the description string. |
| `showName` | metadata JSON (legacy pump.fun flag) | Historical field from the old upload API; include `"true"` for compatibility. |
| `createdOn` | metadata JSON (provenance tag) | Convention field (e.g. bonk.fun stamps its origin); we stamp `https://vibecoin.fun`. |

## Error handling

- All external calls (PumpPortal, IPFS upload, RPC, Jupiter, DexScreener, registry) get typed error wrapping with actionable messages (e.g. RPC rate-limit → suggest `SOLANA_RPC_URL`).
- Registry POST failures never fail a launch (warn only).
- Wrong wallet password → clean "decryption failed" (GCM auth failure), never a stack trace.
- Partial launch failure after tx confirm (e.g. registry down) still reports success with the mint + links.

## Testing

- Unit (vitest): keystore roundtrip + wrong-password + file perms; draft inference from fixture repos; PumpPortal/Jupiter client request-shape tests against mocked `fetch` (shapes from researched docs); registry client fallback behavior.
- Integration: spawn the built server over stdio → `tools/list` → `info` → `wallet create` (tmp `VIBECOIN_HOME`) → `launch` dry-run end-to-end (mocked network).
- Web: `next build` must pass; `/api/projects` route unit-tested with fixture registry.

## Explicitly out of scope (v1)

- Buy/sell trading tools (launch-time dev-buy only), our own bonding curve or contracts, database, auth, trending/leaderboards, token-gated anything, OpenRouter auto-top-up unless research proves Solana-USDC support.
