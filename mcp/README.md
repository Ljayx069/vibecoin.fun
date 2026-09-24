# vibecoin-mcp

Launch your vibe coded app on Solana **or Robinhood Chain** without leaving your coding agent. This is a standard, self-contained **MCP server** — it works with any LLM agent that speaks MCP (Claude Code, Cursor, Codex CLI, or your own client). On Solana it drafts a coin from your repo and deploys it to pump.fun's bonding curve via the PumpPortal Local Transaction API; on Robinhood Chain it launches on **Pons** (ponsfamily.com) — bonding curve → permanently locked Uniswap V4 pool — with quote pairs in ETH or approved tokenized stocks. Your creator fees recycle into an agent budget either way, with keys that never leave your machine.

Site: https://vibecoin.fun · Projects: https://vibecoin.fun/projects

## Install

The server talks plain stdio MCP — whatever your agent or client is, point it at:

```bash
npx -y github:ivanbvz/vibecoin-mcp
```

### Any MCP client (generic config)

Add this to your client's MCP config (the file name differs per client):

```json
{
  "mcpServers": {
    "vibecoin": {
      "command": "npx",
      "args": ["-y", "github:ivanbvz/vibecoin-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add vibecoin -- npx -y github:ivanbvz/vibecoin-mcp
```

Or add the JSON above to `~/.claude.json` / project `.mcp.json`.

### Cursor

Add the JSON above to `.cursor/mcp.json` in your project (or `~/.cursor/mcp.json` for all projects).

### Codex CLI

```bash
codex mcp add vibecoin -- npx -y github:ivanbvz/vibecoin-mcp
```

Or manually in `~/.codex/config.toml`:

```toml
[mcp_servers.vibecoin]
command = "npx"
args = ["-y", "github:ivanbvz/vibecoin-mcp"]
```

Codex registers MCP servers globally, so the server may start outside your project directory — the `launch` tool takes a `project_dir` override for exactly this case (your agent will pass it when the preview looks off).

### From a clone (any client)

```bash
git clone https://github.com/ivanbvz/vibecoin-mcp.git
cd vibecoin-mcp && npm install && npm run build
```

Then point your client at `node /absolute/path/to/vibecoin-mcp/dist/index.js` instead of the `npx` command.

Restart your client after adding the server.

## One-prompt launch

Open your coding agent in your project and say **"launch this as a coin"**. The flow is fully autonomous — your request is the approval:

1. `launch` reads README.md, package.json and your git remote, then shows a preview: name, ticker, description, image, links, and the full cost breakdown.
2. A wallet is auto-created for this project if none exists. Its encryption password is generated and stored in your macOS Keychain (or a `0600` key file elsewhere), so **no interactive password step ever blocks the launch** — and the password never appears in the chat.
3. Metadata (JSON + image) is uploaded, PumpPortal builds the unsigned create transaction, it's signed locally with the mint + creator keys, and submitted to your RPC.
4. The coin is live on pump.fun; the launch is recorded locally and registered on vibecoin.fun/projects.

Your agent runs all of this itself — it never hands a transaction back for you to sign or submit. (Want to tweak a field first? Just say so — every field is overridable. Want only a rehearsal? Ask for a dry run.) Transfers, fee claims, swaps and locks stay two-phase: preview → your approval → `confirm: true`.

## Tools

| Tool | What it does |
|---|---|
| `wallet` | Create the project's encrypted Solana wallet, check SOL/USDC balances, transfer SOL |
| `launch` | Draft a coin from the repo and deploy it to pump.fun's bonding curve |
| `evm_wallet` | Create/import/status for the encrypted Robinhood Chain wallet (chain 4663), the chain Pons launches on |
| `pons_pairs` | List the live approved Pons quote assets — ETH plus tokenized stock pairs, index funds and stablecoins — with graduation thresholds |
| `pons_launch` | Draft a coin from the repo and launch it on Pons: quote pair, creator tax on top of the 1% standard fee, reward vault (buyback), atomic dev buy, predicted token address |
| `pons_fees` | Post-launch fee settings: status (recipient, tax, reward vault), transfer the fee receiving address, toggle the reward vault |
| `my-coins` | List every coin launched from this machine on both chains — live market data (Solana) and on-chain status (Pons) |
| `collect-fees` | Claim accrued creator fees on both chains in one command — pump.fun payouts (all coins at once) plus the Pons fee escrow (ETH and each stock-pair quote you launched with) |
| `fund-agent` | Collect fees → swap SOL→USDC via Jupiter → hold the budget in the agent's wallet |
| `lock` | Lock a % of your own tokens via Streamflow; returns a shareable proof link |
| `info` | Fee table, config paths, wallet list, links |

## Launching on Pons (Robinhood Chain)

Pons is a third-party launchpad on Robinhood Chain (chain ID 4663), not a Robinhood product. Its model differs from pump.fun's in ways that matter to the launch config:

- **Fixed 1B supply** bonding curve; graduates into a **permanently locked Uniswap V4 pool** once the quote-asset threshold is raised (default 4.2 ETH for ETH pairs). No migration step — anyone can trigger the graduation sweep.
- **Quote pairs**: native ETH, or any of ~23 approved ERC-20s — tokenized equities (stock pairs like NVDA), index funds and stablecoins. `pons_pairs` reads the live list from the factory; the list is owner-managed so it is never hard-coded. A launch quoted in a stock pair collects that asset's fees and graduates into a pool keyed in it.
- **Creator tax** (`creator_tax_percent`): your cut of every trade, **added on top of the protocol's standard 1% fee** — so 1.5 means traders pay 2.5% total. Capped by the factory (currently 10%, read live). Frozen at launch; zero is allowed but can never be raised later.
- **Fee recipient**: always the launch wallet. It can be moved post-launch with `pons_fees transfer_recipient` if you ever need to.
- **Reward vault** (`buyback: true`): part of your creator fee share funds a protocol buyback vault that releases linearly over 5 years, split with the protocol. Funded from your fees — not a holder distribution.
- **Dev buy** (`dev_buy_eth`): an opening buy atomic with the launch, routed through the factory's trusted forwarder so the recipient is exempt from the 99% opening snipe tax (decays over 3 seconds). Unbought launches have been sniped out within two blocks — keep a dev buy in.
- **Launch fee** (read live, ~0.0005 ETH) must equal `msg.value` exactly; the economics digest (`previewLaunchEconomics`) is pinned in the transaction and any owner re-peg while it is in flight reverts the launch.
- CREATE2 deployment means the **token and curve addresses are predicted in the preview**, before anything is sent. Relaunching identical name+symbol reuses the salt and fails early, as it should.

The flow matches `launch`: the agent previews, signs and submits itself, in one turn. The EVM wallet is auto-created under `~/.vibecoin/wallets-evm/` with the same scrypt + AES-256-GCM envelope and stored-password scheme as the Solana wallet. Stock-pair dev buys are not supported yet (native-ETH pairs only for `dev_buy_eth`); an ERC-20 quote sends an `approve` transaction before the launch when a dev buy is requested without allowance. Pons ABIs under `src/abi/` are the Sourcify-verified contract ABIs (provenance header in each file).

### Fee settings on Pons — what can change and what can't

From the verified factory source (`PonsV2LaunchFactory`):

| Setting | At launch | After launch |
|---|---|---|
| Creator tax (`creator_tax_percent`, on top of the protocol's 1% standard) | set at launch | **frozen forever** — no setter exists |
| Fee receiving address | the launch wallet | transferable by the current recipient, immediate (`pons_fees transfer_recipient`) — also re-points the reward vault beneficiary. The protocol owner can propose a redirect behind a timelock (a recovery path for lost wallets); `pons_fees status` shows any pending proposal |
| Reward vault (`buyback`) | set at launch | toggleable (`pons_fees set_buyback`) — enabling is creator-only since it spends the creator's own fee bucket; the owner may only disable |
| Protocol fees (1% curve fee, pool hook fee, 30% protocol share of the creator fee bucket, snipe tax params, factory cap) | fixed globally | owner-only, never per-launch |

Pons has no native multi-wallet fee splitting — launch, then move the recipient to a multisig or split contract with `pons_fees transfer_recipient` to share fees across wallets.

## Token metadata field guide

What each field does, where it ends up, and who fills it. The `launch` preview shows this mapping before anything is sent; your agent can override any field via the tool parameters of the same name.

| Field | Ends up in | Function & limits | Default source |
|---|---|---|---|
| `name` | on-chain + metadata JSON | Display name everywhere. Hard on-chain limit 32 chars. | README `# Title` → package.json name → directory name |
| `symbol` | on-chain + metadata JSON | The $TICKER. Hard on-chain limit 10 chars; 3–8 uppercase is the convention. | Derived from name (initials for 3+ words, blended otherwise) |
| `description` | metadata JSON | Body text on the pump.fun coin page and aggregators. Keep ≤ ~500 chars. | First real README paragraph → package.json description |
| `image` (`image_path` param) | metadata JSON | Coin avatar. Square png/jpg/gif/webp, ≤ 1.5 MB. | `logo.png`/`icon.png`/`public/logo.png` etc., else a bundled placeholder |
| `website` | metadata JSON | Link box on the coin page — point it at the live app. | package.json `homepage` |
| `twitter` | metadata JSON | Optional social link on the coin page. | omitted unless provided |
| `telegram` | metadata JSON | Optional social link on the coin page. | omitted unless provided |
| `github` | vibecoin registry + appended to description | pump.fun metadata has no native repo field, so the repo URL lives in the vibecoin.fun registry (and /projects), and is appended to the description for visibility on pump.fun itself. | git `remote.origin.url`, normalized |
| `showName` | metadata JSON | Legacy pump.fun display flag; always `"true"` for compatibility. | fixed |
| `createdOn` | metadata JSON | Provenance stamp; coins launched here carry `https://vibecoin.fun`. | fixed |
| `dev_buy_sol` | create transaction | Optional initial buy at the very bottom of the curve (your creator bag). PumpPortal takes 0.5% of it. | `0` |

## Fees (verified from official docs, July 2026)

- Creating a coin is **free**; ~0.025 SOL of network cost puts it on-chain (~0.04 SOL recommended balance incl. buffer).
- Bonding-curve trades cost 1.25%: **0.30% to you**, 0.95% to pump.fun.
- After graduation (~85 SOL raised → PumpSwap, LP burned) your share is tiered by market cap: up to **0.95%**, floor 0.05% above ~$20M.
- PumpPortal adds 0.5% on trades routed through its API (dev buys included; creation itself is not charged).
- `fund-agent` swaps via Jupiter (2 bps on SOL→USDC) and keeps the USDC **in your wallet**. It does not auto-pay any provider — Anthropic/OpenAI bill fiat cards only, and OpenRouter crypto top-ups are a manual checkout on their site.
- `lock` uses Streamflow: ~0.09–0.16 SOL + 0.19–0.5% of the locked tokens (their on-chain fee oracle sets the exact value).

## Security model

- Keypairs are generated locally and stored encrypted (scrypt N=2^15 + AES-256-GCM) under `~/.vibecoin/wallets/` with `0600` permissions.
- The encryption password is resolved in order: `VIBECOIN_WALLET_PASSWORD` env → explicit `password` param → auto-generated secret in the macOS Keychain (service `vibecoin`) or `~/.vibecoin/keys/<name>.key` (`0600`).
- Auto mode protects the wallet file at rest (a stolen `wallets/*.json` alone is useless). It does not protect against an attacker with full control of your logged-in user account — set `VIBECOIN_WALLET_PASSWORD` yourself and delete the stored secret if you want password-only custody.
- Transactions are built by PumpPortal/Jupiter as **unsigned** payloads, signed locally, and submitted to the RPC you configure. Private keys are never transmitted, logged, or included in tool output.
- Launches are autonomous (the launch request is the approval); other value-moving actions require an explicit user-approved `confirm: true` second call. `dry_run` builds and simulates without sending.
- One fresh wallet per project by default — launches are pseudonymous until you link them.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `SOLANA_RPC_URL` | `https://api.mainnet-beta.solana.com` | RPC for submission/balances. Use a paid endpoint (Helius, Triton…) for reliability. |
| `VIBECOIN_ROBINHOOD_RPC` | `https://rpc.mainnet.chain.robinhood.com` | Robinhood Chain RPC (Pons). |
| `VIBECOIN_HOME` | `~/.vibecoin` | Where wallets/launches live. |
| `VIBECOIN_WALLET_PASSWORD` | — | Bring-your-own wallet password (skips the stored secret). |
| `VIBECOIN_DRY_RUN` | — | `1` = every action builds + simulates but never sends. |
| `PINATA_JWT` | — | Pin metadata to IPFS via your own Pinata account instead of vibecoin.fun's hosted endpoint. |
| `JUP_API_KEY` | — | Jupiter API key (keyless works at 0.5 req/s). |
| `VIBECOIN_METADATA_URL` | `https://vibecoin.fun/api/metadata` | Hosted metadata endpoint. |
| `VIBECOIN_REGISTRY_URL` | `https://vibecoin.fun/api/registry` | Launch registry endpoint. |
| `VIBECOIN_NO_KEYCHAIN` | — | `1` = skip macOS Keychain, use key files. |

## Notes

- pump.fun and PumpPortal have **no devnet** — `dry_run` (build + mainnet simulation, no send) is the safe rehearsal.
- pump.fun's terms restrict commercial transacting *on behalf of others*; vibecoin is a local tool — you sign for yourself, we never custody anything.
- Not financial advice; launching a token is not an investment contract with your users. Ship something real.

MIT
