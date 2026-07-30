# Verified external facts — 2026-07-29

Condensed from live-docs research (full reports in the session transcript). Every number below was read from a primary source on this date, not from model memory.

## PumpPortal Local Transaction API (pumpportal.fun)

- Endpoint: `POST https://pumpportal.fun/api/trade-local` — JSON, **no API key**, limit 25 req/s. Response = raw serialized `VersionedTransaction` bytes (`arrayBuffer()` → `VersionedTransaction.deserialize`); on error, non-200 with statusText.
- Create body: `{publicKey, action:"create", tokenMetadata:{name,symbol,uri}, mint:<mint pubkey b58>, denominatedInSol:"true"|"false" (strings), amount:<dev buy SOL>, slippage:<percent>, priorityFee:<SOL>, pool:"pump"}`. Mint keypair is generated locally; sign create with `[mintKeypair, walletKeypair]`, everything else `[walletKeypair]`. Submit with own RPC: `connection.sendTransaction(tx)`.
- Collect creator fees: `{publicKey, action:"collectCreatorFee", priorityFee}` — claims **all** accrued pump.fun creator fees at once (no mint param).
- Buy/sell (not exposed as tools in v1): same endpoint, `action:"buy"|"sell"`, `amount` number or `"100%"`-style string, `pool` ∈ pump | raydium | pump-amm | launchlab | raydium-cpmm | bonk | auto.
- PumpPortal fee: **0.5% per local trade**; **token creation itself has no PumpPortal fee** (the 0.5% applies to the optional dev buy). Solana network fees separate.
- **pump.fun's old `pump.fun/api/ipfs` metadata upload is dead** (docs: direct uploads no longer allowed; their examples now use Pinata `POST https://uploads.pinata.cloud/v3/files` with a personal JWT). Any HTTPS/IPFS URI serving the metadata JSON works on-chain (bonk.fun uses plain workers.dev URLs) → vibecoin.fun hosts metadata at `POST /api/metadata`.
- Metadata JSON shape (Metaplex-style, per PumpPortal examples): `{name, symbol, description, image, twitter?, telegram?, website?}` (+ legacy `showName:"true"`; provenance convention `createdOn`).
- **No devnet/testnet** ("experiment with very small amounts of SOL on Mainnet"). Dry-run substitute: build the unsigned tx, `simulateTransaction` against mainnet, never send.

## pump.fun economics (official pump-public-docs + Help Center; current since 2025-09-01 "Dynamic Fees V1")

- Creation **free**; first buy (~0.025 SOL network cost, ~0.04 SOL with buffer) deploys the coin on-chain. No minimum dev buy.
- Bonding-curve trades: **1.25% total = 0.95% protocol + 0.30% creator** (flat on the curve).
- Graduation: curve sells out 793.1M of 1B supply ≈ **85 SOL raised** (~$69k–100k mcap depending on SOL price) → permissionless migration to **PumpSwap**, fee 0.015 SOL (rent only), **LP tokens burned**. (Raydium migration ended Mar 2025.)
- PumpSwap canonical-pool fees, tiered by mcap in SOL: creator **0.30%** (<420 SOL band) → peak **0.95%** (420–1,470 SOL ≈ $85k–300k) → steps down to **0.05% min** (≥98,240 SOL ≈ $20M+); LP 0.20% (0.02% in lowest band), protocol 0.05% (0.93% in lowest band). Totals 1.25% → 0.30%.
- Creator fees claimable anytime (permissionless on-chain `collect_creator_fee_v2` / AMM collect — what PumpPortal wraps); fee **sharing** to up to 10 wallets configurable once then locked (Jan–Mar 2026 features); optional cashback mode redirects creator fee to traders.
- Copy-safe: "earn 0.30% of every trade on the curve, up to 0.95% after graduation."
- ToS §21(c): no commercial transactions **on behalf of others** without written consent — vibecoin users sign for themselves locally; mind trademark guidelines (nominative use only).

## Market data

- DexScreener free API, no key: `GET https://api.dexscreener.com/latest/dex/tokens/{mint}` (tested live; also documented `GET /tokens/v1/solana/{mint}`, 300 req/min). Pair fields: `priceUsd, marketCap, fdv, volume{h24,...}, priceChange{...}, liquidity{usd}, info{imageUrl,socials,websites}, url, dexId (pumpfun|pumpswap|raydium), pairCreatedAt`. Pick max-liquidity pair; brand-new curve tokens may have no pairs yet.
- pump.fun `frontend-api.pump.fun` = HTTP 530 for servers; `frontend-api-v3.pump.fun/coins/{mint}` worked at research time but is undocumented + Cloudflare-guarded — not a dependency.

## Jupiter Swap v2 (developers.jup.ag; old swap/v1 + lite-api deprecated)

- `GET https://api.jup.ag/swap/v2/order?inputMint=&outputMint=&amount=<lamports>&taker=<pubkey>&slippageBps=` → `{transaction: <b64 unsigned v0 tx | "">, requestId, outAmount, feeBps, router, errorCode?, errorMessage?}`.
- Sign locally (`VersionedTransaction.deserialize(Buffer.from(b64,"base64"))`, `tx.sign([kp])`) → `POST https://api.jup.ag/swap/v2/execute` `{signedTransaction:<b64>, requestId}` → `{status:"Success"|"Failed", signature, outputAmountResult...}`.
- Keyless: 0.5 req/s (enough for fund-agent); `x-api-key` (free plan 1 rps) optional via `JUP_API_KEY`.
- Jupiter fee on this path: SOL↔stables **2 bps** (disclose in preview). Mints: SOL `So11111111111111111111111111111111111111112`, USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.

## OpenRouter / Anthropic / OpenAI payments

- OpenRouter programmatic crypto endpoint `POST /api/v1/credits/coinbase` **removed — 410 Gone**; crypto = web checkout only, USDC, 5% fee, EVM settlement (Base/Ethereum/Polygon); crypto cannot fund auto-top-up. No Solana-native path.
- Anthropic + OpenAI: fiat cards only, no crypto. → Copy must never claim fees pay Anthropic/OpenAI bills; fund-agent v1 = USDC budget held in the agent's wallet.

## Creator lock — Streamflow (chosen)

- `@streamflow/stream` v13.x (npm, very active; web3.js v1 stack, Node ≥18). `new StreamflowSolana.SolanaStreamClient(rpcUrl)`.
- Irrevocable token-lock recipe: `create({recipient:<self>, tokenId:<mint>, start:<unlockTs>, cliff:<unlockTs>, amount:getBN(n,6), cliffAmount:amount-1, period:1, amountPerPeriod:BN(1), name, canTopup:false, cancelableBySender:false, cancelableByRecipient:false, transferableBySender:false, transferableByRecipient:false}, {sender:keypair})` → `{txId, metadataId}`.
- Proof URL: `https://app.streamflow.finance/contract/solana/mainnet/<metadataId>`. Cost: ~0.09–0.16 SOL + 0.19–0.5% of locked tokens (on-chain fee oracle — quote a range in previews). Mainnet program `strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m`; devnet program available.
- Rejected: Jupiter Lock (free + audited but **no official SDK** — Codama codegen on web3.js v2 required), "StakePoint" (real website, **no SDK/API**, ~20 tx/day usage — not an integration target). pump.fun has no native creator lock (only burns LP at graduation).

## vibecoins.ai (structure reference; all our copy is original)

- Two routes only: `/` (anchor-nav sections: Install, $VIBE, How it works, Tokenomics, Fees, API) and `/projects` (client-rendered table: Name+symbol chip+truncated description, Price, Market Cap, Volume, Links [Etherscan/Gecko/Web/GitHub], Trade). Their GraphQL backend (vibecoin.up.railway.app) is currently dead.
- Design: dark-only terminal aesthetic — bg `#0d0d0d`, fg `#e0e0e0`, muted `#888`, accent `#00ff88` (hover `#00cc6a`), border `#2a2a2a`, code-bg `#1a1a1a`; Geist Mono for everything; `max-w-3xl` column; masthead-style header (small green h1 + tagline + inline nav + green "Trade →" pill); footer "built for vibe coders" line + links.
- Economics (theirs, ETH): 2% swap fee split 1%/1%, 1B supply, 49% creator vested 6mo / 51% public, custom Uniswap v4 hook. No "fund your agent" concept anywhere — that section is our differentiator.
