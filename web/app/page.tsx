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
  ["wallet", "Create the project's encrypted Solana wallet, check SOL/USDC balance, transfer SOL"],
  ["launch", "Draft a coin from your repo and deploy it to pump.fun's bonding curve (Solana)"],
  ["evm_wallet", "Create/import the encrypted Robinhood Chain wallet (chain 4663) — the chain Pons launches on"],
  ["pons_pairs", "Live Pons quote assets — ETH plus tokenized stock pairs, index funds and stablecoins, with graduation thresholds"],
  ["pons_launch", "Draft a coin from your repo and launch it on Pons: quote pair, creator tax on top of the 1% standard fee, reward vault, atomic dev buy"],
  ["pons_fees", "Post-launch Pons fee settings: status, transfer the fee recipient, toggle the reward vault"],
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
            your OS keychain, the keys never leave your machine — then deploys the coin. Pick your chain: pump.fun&apos;s
            bonding curve on Solana (the default), or <a href="#pons" className="text-accent">Pons on Robinhood Chain</a>{" "}
            with quotes in ETH or tokenized stock pairs. A coin attached to a real repo is an open prediction market on
            your app: if people believe in what you&apos;re shipping, they buy in early, and you earn a cut of every
            trade from day one.
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

        <Section id="pons" title="Pons on Robinhood Chain">
          <p>
            The second chain: <Chip>pons_launch</Chip> deploys to Pons (ponsfamily.com), the launchpad on Robinhood
            Chain (chain ID 4663 — an Arbitrum L2 with ETH gas). Same flow, same two-phase preview, same local-only
            keys; a separate encrypted EVM wallet is auto-created per project.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-hairline">
                <tr>
                  <Td>Total supply</Td>
                  <Td>1,000,000,000, fixed by the protocol</Td>
                </tr>
                <tr>
                  <Td>Graduation</Td>
                  <Td>Bonding curve → permanently locked Uniswap V4 pool once the threshold is raised (default 4.2 ETH for ETH pairs) — anyone can trigger the sweep, nothing to migrate yourself</Td>
                </tr>
                <tr>
                  <Td>Quote pairs</Td>
                  <Td>Native ETH, or ~23 approved ERC-20s read live with <Chip>pons_pairs</Chip>: tokenized stock pairs (NVDA, TSLA, AAPL, GME…), index funds (SPY, QQQ) and stablecoins. A stock-pair launch collects fees in that stock and graduates into a pool keyed in it</Td>
                </tr>
                <tr>
                  <Td>Creator tax</Td>
                  <Td>Your cut of every trade, <span className="text-accent">added on top of Pons&apos;s standard 1% fee</span> — e.g. 1.5% creator tax means traders pay 2.5% total. Factory-capped (currently 10%), frozen at launch. Always paid to the launch wallet</Td>
                </tr>
                <tr>
                  <Td>Reward vault</Td>
                  <Td>Optional buyback: part of your creator tax buys back the token and releases linearly over 5 years, split with the protocol. Funded from your fees, not a holder distribution. Toggleable post-launch with <Chip>pons_fees</Chip></Td>
                </tr>
                <tr>
                  <Td>Dev buy</Td>
                  <Td>An opening buy atomic with the launch, exempt from the 99% opening snipe tax (decays over 3 seconds). Keep one in — unbought launches have been sniped out within two blocks</Td>
                </tr>
                <tr>
                  <Td>Predicted address</Td>
                  <Td>CREATE2 deployment, so the preview shows the token and curve addresses before anything is sent</Td>
                </tr>
                <tr>
                  <Td>Launch fee</Td>
                  <Td>~0.0005 ETH, read live — the factory demands it exactly</Td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-muted">
            Post-launch, <Chip>pons_fees</Chip> manages what Pons lets a creator change: transfer the fee recipient
            (immediate, also re-points the reward vault) and toggle the reward vault. The tax rate itself is frozen
            forever — there is no setter on the contract. Protocol-side fees are owner-only globals, never per-launch
            settings. Pons is a third-party platform, not a Robinhood product.
          </p>
        </Section>

        <Section id="fees" title="Fees">
          <p>
            Two launchpads, two fee models. Solana first — launching on pump.fun:
          </p>
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
          <h3 className="pt-2 font-semibold text-muted">Pons on Robinhood Chain</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-hairline">
                <tr>
                  <Td>Launch fee</Td>
                  <Td>~0.0005 ETH, read live from the factory and demanded exactly</Td>
                </tr>
                <tr>
                  <Td>Protocol fee</Td>
                  <Td>1% of every trade — the Pons standard, on the curve and after graduation</Td>
                </tr>
                <tr>
                  <Td>Creator tax (you)</Td>
                  <Td>
                    Your chosen percentage <span className="text-accent">on top of the 1%</span> — factory-capped at 10%,
                    frozen at launch, always paid to the launch wallet
                  </Td>
                </tr>
                <tr>
                  <Td>Reward vault</Td>
                  <Td>Optional: a slice of your creator tax funds a buyback vault, 5-year linear release, protocol takes a share of releases</Td>
                </tr>
                <tr>
                  <Td>Opening protection</Td>
                  <Td>99% snipe tax decaying over 3 seconds at launch; your dev buy rides exempt in the same transaction</Td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-muted">
            Gas on Robinhood Chain is paid in ETH and negligible beside the launch fee. Manage the recipient and the
            reward vault afterwards with <Chip>pons_fees</Chip>.
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
