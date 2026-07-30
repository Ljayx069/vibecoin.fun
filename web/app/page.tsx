import Link from "next/link";
import CodeBlock from "@/components/CodeBlock";
import Footer from "@/components/Footer";
import Masthead from "@/components/Masthead";
import Section from "@/components/Section";

const INSTALL_CMD = "claude mcp add vibecoin -- npx github:thetriggeredkid-spec/vibecoin-mcp";
const INSTALL_JSON = `{
  "mcpServers": {
    "vibecoin": {
      "command": "npx",
      "args": ["github:thetriggeredkid-spec/vibecoin-mcp"]
    }
  }
}`;

const TOOLS: [string, string][] = [
  ["wallet", "Create the project's encrypted wallet, check SOL/USDC balance, transfer SOL"],
  ["launch", "Draft a coin from your repo and deploy it to pump.fun's bonding curve"],
  ["my-coins", "Every coin launched from this machine, with live market data"],
  ["collect-fees", "Claim your accrued pump.fun creator fees"],
  ["fund-agent", "Collect fees and swap SOL→USDC so your agent has a budget"],
  ["lock", "Lock a % of your own tokens via Streamflow and get a proof link"],
  ["info", "Fee table, config, wallets, links"],
];

const METADATA_FIELDS: [string, string, string][] = [
  ["name", "on-chain + metadata JSON", "Token name, 32 chars max. Drafted from your README title or package.json name."],
  ["symbol", "on-chain + metadata JSON", "The $TICKER, 10 chars max (3–8 uppercase is the norm). Drafted from the name."],
  ["description", "metadata JSON", "Shown on the pump.fun coin page. Drafted from your README's first paragraph; keep it under ~500 chars."],
  ["image", "metadata JSON", "Coin avatar. Square png/jpg/gif/webp under 1.5MB. Auto-detected from logo.png and friends, else a placeholder."],
  ["website", "metadata JSON", "Link on the coin page — point it at your live app. This is the whole point."],
  ["twitter / telegram", "metadata JSON", "Optional social links on the coin page. Omitted unless you provide them."],
  ["github", "registry + description", "pump.fun has no native repo field, so the repo URL lives in our registry, on /projects, and gets appended to the description."],
  ["showName", "metadata JSON", "Legacy pump.fun flag, always \"true\" for compatibility."],
  ["createdOn", "metadata JSON", "Provenance stamp. Coins launched here carry https://vibecoin.fun."],
];

function Th({ children }: { children: React.ReactNode }) {
  return <th className="py-2 pr-4 text-left text-xs font-semibold tracking-wide text-muted uppercase">{children}</th>;
}
function Td({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) {
  return <td className={`py-3 pr-4 align-top ${mono ? "whitespace-nowrap" : ""}`}>{children}</td>;
}
function Chip({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-code px-2 py-0.5 text-xs">{children}</code>;
}

export default function Home() {
  return (
    <>
      <Masthead />
      <main className="mx-auto max-w-3xl space-y-12 px-6 py-12">
        <Section id="install" title="Installation">
          <p>One command wires the vibecoin MCP into Claude Code:</p>
          <CodeBlock code={INSTALL_CMD} prompt />
          <p className="text-muted">
            Or add it by hand to <Chip>~/.claude.json</Chip>:
          </p>
          <CodeBlock code={INSTALL_JSON} />
          <p className="text-muted">Restart Claude Code and the tools are live in every session.</p>
        </Section>

        <Section id="how-it-works" title="How it works">
          <p>
            Open Claude Code inside whatever you&apos;re building and say{" "}
            <span className="text-accent">&quot;launch this as a coin&quot;</span>. That&apos;s the entire workflow —
            no dashboard, no form, no leaving the terminal.
          </p>
          <p>
            Claude reads your README, package.json and git remote, drafts the coin (name, ticker, description, links),
            and shows you exactly what it wants to deploy and what it costs. Nothing is sent until you say yes.
          </p>
          <p>
            On approval it creates an encrypted wallet for this project — the password is generated for you and kept in
            your OS keychain, the keys never leave your machine — then deploys the coin straight onto pump.fun&apos;s
            bonding curve. A coin attached to a real repo is an open prediction market on your app: if people believe
            in what you&apos;re shipping, they buy in early, and you earn a cut of every trade from day one.
          </p>
          <p>
            Every project gets its own fresh wallet, so launches are pseudonymous by default — nothing links the coin
            to you until you decide to say so. Want extra credibility instead? <Chip>lock</Chip> puts part of your own
            bag in an on-chain time lock with a link you can share.
          </p>
          <h3 className="pt-2 font-semibold text-muted">Available tools</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline">
                  <Th>Tool</Th>
                  <Th>What it does</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {TOOLS.map(([tool, desc]) => (
                  <tr key={tool}>
                    <Td mono>
                      <Chip>{tool}</Chip>
                    </Td>
                    <Td>{desc}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="bonding-curve" title="Bonding curve">
          <p>
            vibecoin deploys standard pump.fun coins — nothing custom, nothing upgradable, no contract of ours in the
            middle:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-hairline">
                <tr>
                  <Td>Total supply</Td>
                  <Td>1,000,000,000 — all of it starts on the curve, zero pre-mine</Td>
                </tr>
                <tr>
                  <Td>Price</Td>
                  <Td>Climbs deterministically as the curve fills; earliest believers get the best price</Td>
                </tr>
                <tr>
                  <Td>Graduation</Td>
                  <Td>When the curve sells out (~85 SOL raised, roughly a $70–100K market cap depending on SOL price)</Td>
                </tr>
                <tr>
                  <Td>After graduation</Td>
                  <Td>Migrates to PumpSwap for 0.015 SOL and the LP tokens are burned — liquidity can&apos;t be pulled</Td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-muted">
            Your creator allocation is whatever you choose to buy — a <Chip>dev_buy_sol</Chip> at launch fills your
            wallet at the very bottom of the curve, and <Chip>lock</Chip> can prove you&apos;re holding it.
          </p>
        </Section>

        <Section id="fees" title="Fees">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-hairline">
                <tr>
                  <Td>Launch fee</Td>
                  <Td>Free — ~0.025 SOL of network cost puts it on-chain</Td>
                </tr>
                <tr>
                  <Td>Trading fee on the curve</Td>
                  <Td>1.25% per trade</Td>
                </tr>
                <tr>
                  <Td>API fee</Td>
                  <Td>0.5% on trades routed through PumpPortal (dev buys included; creating is not charged)</Td>
                </tr>
              </tbody>
            </table>
          </div>
          <h3 className="pt-2 font-semibold text-muted">Where the 1.25% goes</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-hairline">
                <tr>
                  <Td>Creator (you)</Td>
                  <Td>0.30% of every curve trade</Td>
                </tr>
                <tr>
                  <Td>pump.fun protocol</Td>
                  <Td>0.95%</Td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            After graduation the creator share is tiered by market cap: it peaks at <span className="text-accent">0.95%</span>{" "}
            per trade in the $85–300K range and floors at 0.05% above ~$20M, with 0.20% to LPs and 0.05% to the
            protocol. Claim whenever you like with <Chip>collect-fees</Chip> — it costs a network fee, nothing more.
          </p>
        </Section>

        <Section id="fund-your-agent" title="Fund your agent">
          <p>
            The part that closes the loop: your coin&apos;s trading fees can pay for the agent that built the app.
          </p>
          <CodeBlock code={`> collect my fees and fund the agent`} />
          <p>
            One prompt runs <Chip>fund-agent</Chip>: claim pending creator fees, keep a little SOL for gas, swap the
            rest to USDC through Jupiter, and leave the budget sitting in the project&apos;s own wallet. Ship something
            people trade, and the meter runs backwards.
          </p>
          <p className="text-muted">
            Straight talk: the USDC stays in a wallet you control. Anthropic and OpenAI bill fiat cards only, and
            OpenRouter&apos;s crypto top-up is a manual checkout on their site — nothing here auto-pays a provider, and
            we won&apos;t pretend otherwise.
          </p>
        </Section>

        <Section id="projects" title="Projects">
          <p>
            Every coin launched here ships with receipts — the GitHub repo and the live URL are first-class fields, not
            an afterthought. Browse what people are building and trade the ones you believe in.
          </p>
          <p>
            <Link
              href="/projects"
              className="inline-block rounded-md bg-accent px-4 py-1.5 font-medium text-background transition-colors hover:bg-accent-hover"
            >
              Browse projects →
            </Link>
          </p>
        </Section>

        <Section id="api" title="API">
          <p>Everything the site knows is public JSON. Build dashboards, bots, or your own frontend on top.</p>
          <h3 className="pt-2 font-semibold text-muted">Endpoints</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-hairline">
                <tr>
                  <Td mono>
                    <Chip>GET /api/projects</Chip>
                  </Td>
                  <Td>All launched projects with live market data, sorted by market cap</Td>
                </tr>
                <tr>
                  <Td mono>
                    <Chip>POST /api/registry</Chip>
                  </Td>
                  <Td>Called by the MCP after a launch — registers mint, links and metadata</Td>
                </tr>
                <tr>
                  <Td mono>
                    <Chip>POST /api/metadata</Chip>
                  </Td>
                  <Td>Hosts your token&apos;s metadata JSON + image and returns the URI for the create transaction</Td>
                </tr>
              </tbody>
            </table>
          </div>
          <h3 className="pt-2 font-semibold text-muted">Example</h3>
          <CodeBlock code={`curl -s https://vibecoin.fun/api/projects`} prompt />
          <CodeBlock
            code={`{
  "count": 1,
  "projects": [
    {
      "mint": "…pump",
      "name": "Rocket Notes",
      "symbol": "ROCKET",
      "description": "A note-taking app that syncs your thoughts to the moon.",
      "github": "https://github.com/you/rocket-notes",
      "website": "https://rocketnotes.app",
      "creator": "…",
      "createdAt": "2026-07-30T00:00:00.000Z",
      "market": { "priceUsd": 0.0000031, "marketCapUsd": 3100, "volume24hUsd": 950 }
    }
  ]
}`}
          />
          <h3 className="pt-2 font-semibold text-muted">Token metadata — what goes where</h3>
          <p className="text-muted">
            The launch tool fills these for you from the repo; every one can be overridden. This is the full field
            reference your agent works from:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline">
                  <Th>Field</Th>
                  <Th>Lives in</Th>
                  <Th>Function &amp; limits</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {METADATA_FIELDS.map(([field, where, fn]) => (
                  <tr key={field}>
                    <Td mono>
                      <Chip>{field}</Chip>
                    </Td>
                    <Td>{where}</Td>
                    <Td>{fn}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </main>
      <Footer />
    </>
  );
}
