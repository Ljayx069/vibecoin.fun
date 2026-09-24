"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtPrice, fmtUsd } from "@/lib/format";

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
  creator?: string;
  signature?: string;
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

type SortKey = "mcap" | "newest" | "volume" | "change" | "name";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "mcap", label: "Highest mcap" },
  { key: "volume", label: "Highest volume" },
  { key: "change", label: "24h change" },
  { key: "newest", label: "Newest" },
  { key: "name", label: "Name A–Z" },
];

/** Missing market data always sinks to the bottom, whatever the sort. */
function sortProjects(projects: Project[], key: SortKey): Project[] {
  const num = (v?: number) => (v === undefined || Number.isNaN(v) ? Number.NEGATIVE_INFINITY : v);
  const sorted = [...projects];
  switch (key) {
    case "mcap":
      sorted.sort((a, b) => num(b.market?.marketCapUsd) - num(a.market?.marketCapUsd));
      break;
    case "volume":
      sorted.sort((a, b) => num(b.market?.volume24hUsd) - num(a.market?.volume24hUsd));
      break;
    case "change":
      sorted.sort((a, b) => num(b.market?.priceChange24h) - num(a.market?.priceChange24h));
      break;
    case "newest":
      sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      break;
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
  }
  return sorted;
}

function twitterUrl(raw: string): string {
  return raw.startsWith("http") ? raw : `https://x.com/${raw.replace(/^@/, "")}`;
}
function telegramUrl(raw: string): string {
  return raw.startsWith("http") ? raw : `https://t.me/${raw.replace(/^@/, "")}`;
}

function chainInfo(p: Project) {
  const pons = p.chain === "robinhood";
  return {
    pons,
    label: pons ? "Pons" : "SOL",
    tradeUrl: pons ? `https://www.ponsfamily.com/launchpad/${p.mint}` : `https://pump.fun/coin/${p.mint}`,
    tradeName: pons ? "Pons" : "pump.fun",
    explorerUrl: pons
      ? `https://robinhoodchain.blockscout.com/address/${p.mint}`
      : `https://solscan.io/token/${p.mint}`,
    explorerName: pons ? "Blockscout" : "Solscan",
    txUrl: p.signature
      ? pons
        ? `https://robinhoodchain.blockscout.com/tx/${p.signature}`
        : `https://solscan.io/tx/${p.signature}`
      : undefined,
  };
}

function TokenImage({ p, size = "md" }: { p: Project; size?: "md" | "lg" }) {
  const [failed, setFailed] = useState(false);
  const cls = size === "lg" ? "h-12 w-12 text-lg" : "h-9 w-9 text-sm";
  if (!p.image || failed) {
    return (
      <div
        className={`flex ${cls} shrink-0 items-center justify-center rounded-full border border-hairline bg-code font-semibold text-accent`}
      >
        {p.symbol.slice(0, 1)}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={p.image}
      alt=""
      className={`${cls} shrink-0 rounded-full border border-hairline object-cover`}
      onError={() => setFailed(true)}
    />
  );
}

function CopyCA({ address, full = false }: { address: string; full?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
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
      className="cursor-pointer rounded bg-code px-1.5 py-0.5 font-mono text-xs break-all text-muted transition-colors hover:text-accent"
    >
      {copied ? "copied ✓" : full ? address : `${address.slice(0, 6)}…${address.slice(-4)}`}
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
    >
      {pons ? "Pons" : "SOL"}
    </span>
  );
}

function Change({ value }: { value?: number }) {
  if (value === undefined) return null;
  return (
    <span className={`text-xs ${value >= 0 ? "text-accent" : "text-red-400"}`}>
      {value >= 0 ? "+" : ""}
      {value}%
    </span>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-hairline bg-code px-3 py-2">
      <div className="text-[10px] tracking-wide text-muted uppercase">{label}</div>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}

function LinkSet({ p, className = "" }: { p: Project; className?: string }) {
  const c = chainInfo(p);
  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-1.5 text-xs ${className}`}>
      <a href={c.tradeUrl} className="text-accent hover:text-accent-hover" onClick={(e) => e.stopPropagation()}>
        Trade on {c.tradeName} →
      </a>
      <a href={c.explorerUrl} className="text-muted hover:text-accent" onClick={(e) => e.stopPropagation()}>
        {c.explorerName}
      </a>
      {p.market?.dexUrl && (
        <a href={p.market.dexUrl} className="text-muted hover:text-accent" onClick={(e) => e.stopPropagation()}>
          Chart
        </a>
      )}
      {p.website && (
        <a href={p.website} className="text-muted hover:text-accent" onClick={(e) => e.stopPropagation()}>
          Website
        </a>
      )}
      {p.twitter && (
        <a href={twitterUrl(p.twitter)} className="text-muted hover:text-accent" onClick={(e) => e.stopPropagation()}>
          X
        </a>
      )}
      {p.telegram && (
        <a href={telegramUrl(p.telegram)} className="text-muted hover:text-accent" onClick={(e) => e.stopPropagation()}>
          Telegram
        </a>
      )}
      {p.github && (
        <a href={p.github} className="text-muted hover:text-accent" onClick={(e) => e.stopPropagation()}>
          GitHub
        </a>
      )}
      {c.txUrl && (
        <a href={c.txUrl} className="text-muted hover:text-accent" onClick={(e) => e.stopPropagation()}>
          Launch tx
        </a>
      )}
    </div>
  );
}

function ProjectCard({
  p,
  expanded,
  onToggle,
}: {
  p: Project;
  expanded: boolean;
  onToggle: () => void;
}) {
  const c = chainInfo(p);
  return (
    <div
      id={p.mint}
      className={`rounded-lg border transition-colors ${expanded ? "border-accent" : "border-hairline hover:border-muted"}`}
    >
      <button onClick={onToggle} className="block w-full cursor-pointer px-4 py-4 text-left sm:px-5">
        <div className="flex items-center gap-3">
          <TokenImage p={p} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium">{p.name}</span>
              <code className="rounded bg-code px-1.5 py-0.5 text-xs">${p.symbol}</code>
              <ChainBadge chain={p.chain} />
              {c.pons && p.pair && p.pair !== "ETH" && <span className="text-xs text-muted">quoted in {p.pair}</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-muted">
              <span>
                {fmtPrice(p.market?.priceUsd)} <Change value={p.market?.priceChange24h} />
              </span>
              <span>mcap {fmtUsd(p.market?.marketCapUsd)}</span>
              <span className="hidden sm:inline">vol {fmtUsd(p.market?.volume24hUsd)}</span>
            </div>
          </div>
          <span
            className={`shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden="true"
          >
            ▾
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-hairline px-4 py-4 sm:px-5">
          {p.description && <p className="max-w-2xl text-sm leading-relaxed">{p.description}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <TokenImage p={p} size="lg" />
            <div className="flex flex-col gap-1">
              <CopyCA address={p.mint} full />
              <span className="text-xs text-muted">
                launched {new Date(p.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                {c.pons ? " · Pons on Robinhood Chain" : " · pump.fun on Solana"}
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Price">
              {fmtPrice(p.market?.priceUsd)} <Change value={p.market?.priceChange24h} />
            </Stat>
            <Stat label="Market cap">{fmtUsd(p.market?.marketCapUsd)}</Stat>
            <Stat label="Volume 24h">{fmtUsd(p.market?.volume24hUsd)}</Stat>
            <Stat label={c.pons ? "Quote pair" : "Chain"}>{c.pons ? (p.pair ?? "ETH") : "Solana"}</Stat>
          </div>

          <LinkSet p={p} className="mt-4" />
        </div>
      )}
    </div>
  );
}

export default function ProjectsTable() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [sort, setSort] = useState<SortKey>("mcap");
  const [openMint, setOpenMint] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        const projects: Project[] = d.projects ?? [];
        setState({ kind: "ready", projects });
        // /projects#<token> links (e.g. from the MCP launch result) open that card.
        const hash = window.location.hash.slice(1);
        if (hash && projects.some((p) => p.mint === hash)) setOpenMint(hash);
      })
      .catch(() => setState({ kind: "error" }));
  }, []);

  const projects = useMemo(
    () => (state.kind === "ready" ? sortProjects(state.projects, sort) : []),
    [state, sort],
  );

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
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-xs">
        <span className="mr-1 text-muted">Sort:</span>
        {SORTS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSort(s.key)}
            className={`rounded border px-2 py-0.5 transition-colors ${
              sort === s.key
                ? "border-accent text-accent"
                : "border-hairline text-muted hover:border-muted hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {projects.map((p) => (
          <ProjectCard
            key={p.mint}
            p={p}
            expanded={openMint === p.mint}
            onToggle={() => setOpenMint(openMint === p.mint ? null : p.mint)}
          />
        ))}
      </div>
    </div>
  );
}
