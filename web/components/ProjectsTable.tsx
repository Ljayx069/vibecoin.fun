"use client";

import { useEffect, useState } from "react";
import { fmtPrice, fmtUsd, truncate } from "@/lib/format";

interface Project {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  github?: string;
  website?: string;
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
          tell Claude to launch.
        </p>
      </div>
    );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline">
            {["Name", "Price", "Market cap", "Volume 24h", "Links", "Trade"].map((h) => (
              <th key={h} className="py-2 pr-4 text-left text-xs font-semibold tracking-wide text-muted uppercase">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {state.projects.map((p) => (
            <tr key={p.mint} id={p.mint}>
              <td className="py-3 pr-4 align-top">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  <code className="rounded bg-code px-1.5 py-0.5 text-xs">${p.symbol}</code>
                </div>
                {p.description && (
                  <p className="mt-1 max-w-xs text-xs text-muted" title={p.description}>
                    {truncate(p.description.split("\n")[0], 60)}
                  </p>
                )}
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
                  <a href={`https://solscan.io/token/${p.mint}`} className="text-muted hover:text-accent">
                    Solscan
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
                  {p.github && (
                    <a href={p.github} className="text-muted hover:text-accent">
                      GitHub
                    </a>
                  )}
                </div>
              </td>
              <td className="py-3 align-top whitespace-nowrap">
                <a href={`https://pump.fun/coin/${p.mint}`} className="font-medium text-accent hover:text-accent-hover">
                  Trade →
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
