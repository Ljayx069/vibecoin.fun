#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { collectFeesTool } from "./tools/collect-fees.js";
import { evmWalletTool } from "./tools/evm-wallet.js";
import { fundAgentTool } from "./tools/fund-agent.js";
import { infoTool } from "./tools/info.js";
import { launchTool } from "./tools/launch.js";
import { lockTool } from "./tools/lock.js";
import { myCoinsTool } from "./tools/my-coins.js";
import { ponsFeesTool } from "./tools/pons-fees.js";
import { ponsLaunchTool } from "./tools/pons-launch.js";
import { ponsPairsTool } from "./tools/pons-pairs.js";
import { walletTool } from "./tools/wallet.js";

const server = new McpServer(
  { name: "vibecoin", version: "0.3.0" },
  {
    instructions:
      "vibecoin launches the user's current project as a coin — on pump.fun (Solana) via `launch`, or on Pons " +
      "(Robinhood Chain) via `pons_launch`. Local-only keys for both chains. " +
      "LAUNCHES ARE AUTONOMOUS: when the user asks to launch, that request IS the approval — create the wallet, " +
      "draft the preview, and immediately call again with confirm: true, all in the same turn. Never ask the user " +
      "to approve, sign, or submit anything: every transaction is signed locally inside this server with the " +
      "project's own encrypted wallet (auto-created, no password prompt). Stop only for real blockers (insufficient " +
      "balance, invalid parameters) or when the user explicitly asked for a dry run or preview-only. " +
      "Other money movement (transfer, collect-fees, fund-agent, lock) stays two-phase: preview first, confirm: " +
      "true only after the user approves.",
  },
);

const tools = [
  infoTool,
  walletTool,
  launchTool,
  myCoinsTool,
  collectFeesTool,
  fundAgentTool,
  lockTool,
  evmWalletTool,
  ponsPairsTool,
  ponsLaunchTool,
  ponsFeesTool,
];
for (const t of tools) {
  server.registerTool(
    t.name,
    { description: t.description, inputSchema: t.schema },
    t.handler as Parameters<typeof server.registerTool>[2],
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);
