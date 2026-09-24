"use client";

import { useEffect, useState } from "react";
import { fmtPrice, fmtUsd, truncate } from "@/lib/format";

interface Project {
  mint: string;
  chain?: "solana" | "robinhood";
  name: string;
  symbol: string;
  description: string;
  image?: string;
  github?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  pair?: string;
  createdAt: string;
  market: {
    priceUsd?: number;
    marketCapUsd?: number;
    volume24hUsd?: number;
    priceChange24h?: number;
    dexUrl?: string;
  } | null;
}

type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; projects: Project[] };

function twitterUrl(raw: string): string {
  return raw.startsWith("http") ? raw : `https://x.com/${raw.replace(/^@/, "")}`;
}
function telegramUrl(raw: string): string {
  return raw.startsWith("http") ? raw : `https://t.me/${raw.replace(/^@/, "")}`;
}

function TokenImage({ project }: { project: Project }) {
  const [failed, setFailed] = useState(false);
  if (!project.image || failed) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hairline bg-code text-sm font-semibold text-accent">
        {project.symbol.slice(0, 1)}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={project.image}
      alt=""
      className="h-9 w-9 shrink-0 rounded-full border border-hairline object-cover"
      onError={() => setFailed(true)}
    />
  );
}

function CopyCA({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  }
  return (
    <button
      onClick={copy}
      title={`${address} — click to copy`}
      className="cursor-pointer rounded bg-code px-1.5 py-0.5 font-mono text-xs text-muted transition-colors hover:text-accent"
    >
      {copied ? "copied" : `${address.slice(0, 6)}…${address.slice(-4)}`}
    </button>
  );
}

function ChainBadge({ chain }: { chain?: Project["chain"] }) {
  const pons = chain === "robinhood";
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
        pons ? "border-accent text-accent" : "border-hairline text-muted"
      }`}
      title={pons ? "Pons on Robinhood Chain" : "pump.fun on Solana"}
    >
      {pons ? "Pons" : "SOL"}
    </span>
  );
}

export default function ProjectsTable() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => setState({ kind: "ready", projects: d.projects ?? [] }))
      .catch(() => setState({ kind: "error" }));
  }, []);

  if (state.kind === "loading") return <p className="text-sm text-muted">Loading projects…</p>;
  if (state.kind === "error")
    return <p className="text-sm text-muted">Couldn&apos;t load projects — refresh to try again.</p>;
  if (state.projects.length === 0)
    return (
      <div className="space-y-3 text-sm">
        <p>No coins here yet — the first one could be the thing you&apos;re building right now.</p>
        <p className="text-muted">
          Install the MCP on the <a href="/#install" className="text-accent hover:text-accent-hover">homepage</a> and
          tell your agent to launch.
        </p>
      </div>
    );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline">
            {["Token", "Price", "Market cap", "Volume 24h", "Links", "Trade"].map((h) => (
              <th key={h} className="py-2 pr-4 text-left text-xs font-semibold tracking-wide text-muted uppercase">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {state.projects.map((p) => {
            const pons = p.chain === "robinhood";
            const tradeUrl = pons ? `https://www.ponsfamily.com/launchpad/${p.mint}` : `https://pump.fun/coin/${p.mint}`;
            const explorerUrl = pons
              ? `https://robinhoodchain.blockscout.com/address/${p.mint}`
              : `https://solscan.io/token/${p.mint}`;
            return (
              <tr key={p.mint} id={p.mint}>
                <td className="py-3 pr-4 align-top">
                  <div className="flex items-start gap-2.5">
                    <TokenImage project={p} />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{p.name}</span>
                        <code className="rounded bg-code px-1.5 py-0.5 text-xs">${p.symbol}</code>
                        <ChainBadge chain={p.chain} />
                      </div>
                      <div className="mt-1">
                        <CopyCA address={p.mint} />
                      </div>
                      {p.description && (
                        <p className="mt-1 max-w-xs text-xs text-muted" title={p.description}>
                          {truncate(p.description.split("\n")[0], 80)}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-3 pr-4 align-top whitespace-nowrap">
                  {fmtPrice(p.market?.priceUsd)}
                  {p.market?.priceChange24h !== undefined && (
                    <span className={`ml-1 text-xs ${p.market.priceChange24h >= 0 ? "text-accent" : "text-red-400"}`}>
                      {p.market.priceChange24h >= 0 ? "+" : ""}
                      {p.market.priceChange24h}%
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4 align-top whitespace-nowrap">{fmtUsd(p.market?.marketCapUsd)}</td>
                <td className="py-3 pr-4 align-top whitespace-nowrap">{fmtUsd(p.market?.volume24hUsd)}</td>
                <td className="py-3 pr-4 align-top">
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    <a href={explorerUrl} className="text-muted hover:text-accent">
                      {pons ? "Scout" : "Solscan"}
                    </a>
                    {p.market?.dexUrl && (
                      <a href={p.market.dexUrl} className="text-muted hover:text-accent">
                        Chart
                      </a>
                    )}
                    {p.website && (
                      <a href={p.website} className="text-muted hover:text-accent">
                        Web
                      </a>
                    )}
                    {p.twitter && (
                      <a href={twitterUrl(p.twitter)} className="text-muted hover:text-accent">
                        X
                      </a>
                    )}
                    {p.telegram && (
                      <a href={telegramUrl(p.telegram)} className="text-muted hover:text-accent">
                        TG
                      </a>
                    )}
                    {p.github && (
                      <a href={p.github} className="text-muted hover:text-accent">
                        GitHub
                      </a>
                    )}
                  </div>
                </td>
                <td className="py-3 align-top whitespace-nowrap">
                  <a href={tradeUrl} className="font-medium text-accent hover:text-accent-hover">
                    Trade →
                  </a>
                  {pons && p.pair && p.pair !== "ETH" && <div className="mt-1 text-xs text-muted">quoted in {p.pair}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
