# vibecoin.fun

Tokenize your repo from the same coding session you're building it in. An agent-native launchpad for Solana **and Robinhood Chain**: MCP server + site, wrapping pump.fun via the PumpPortal Local Transaction API on Solana and launching through Pons (ponsfamily.com) on Robinhood Chain — quotes in ETH or tokenized stock pairs, creator tax on top of the 1% standard fee, optional reward vault. Works with Claude Code, Cursor, Codex CLI, or any MCP client. Non-custodial — every transaction is signed locally.

- **Site:** https://vibecoin.fun (landing + /projects + public JSON API)
- **MCP install (Claude Code):** `claude mcp add vibecoin -- npx -y github:thetriggeredkid-spec/vibecoin-mcp`
- **Cursor / Codex CLI / other clients:** see [mcp/README.md](mcp/README.md#install)

## Layout

```
mcp/   TypeScript MCP server (11 tools: pump.fun/Solana + Pons/Robinhood Chain) — self-contained npm package, mirrored to vibecoin-mcp
web/   Next.js 15 site — landing, /projects, /api/{registry,metadata,projects}, Vercel Blob store
docs/  Design spec, implementation plan, verified API research
```

## Dev quickstart

```bash
# MCP
cd mcp && npm install && npm test && npm run build

# Web
cd web && npm install && npm run dev   # http://localhost:3000
```

The web API routes fall back to `web/data/*.json` on disk when `BLOB_READ_WRITE_TOKEN` is unset, so everything runs locally with zero config.

## Deploy

- Web: Vercel (project root `web/`), Vercel Blob for the registry + hosted token metadata, domain `vibecoin.fun`.
- MCP: mirrored to its own repo for `npx github:` installs via `scripts/publish-mcp.sh`.

See `mcp/README.md` for the tool reference, token metadata field guide, fee table and security model.
