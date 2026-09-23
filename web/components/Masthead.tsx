import Link from "next/link";

const NAV = [
  { label: "Install", hash: "#install" },
  { label: "How it works", hash: "#how-it-works" },
  { label: "Bonding curve", hash: "#bonding-curve" },
  { label: "Pons", hash: "#pons" },
  { label: "Fees", hash: "#fees" },
  { label: "Fund your agent", hash: "#fund-your-agent" },
  { label: "API", hash: "#api" },
];

export default function Masthead({ onProjects = false }: { onProjects?: boolean }) {
  const prefix = onProjects ? "/" : "";
  return (
    <header className="border-b border-hairline">
      <div className="mx-auto max-w-3xl px-6 pt-10 pb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-accent">
          <Link href="/">vibecoin</Link>
        </h1>
        <p className="mt-2 text-sm text-muted">
          Launch your vibe coded app on Solana or Robinhood Chain from your coding agent
          <span className="cursor-blink" aria-hidden="true" />
        </p>
        <nav className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          {NAV.map((n) => (
            <a key={n.hash} href={`${prefix}${n.hash}`} className="text-muted transition-colors hover:text-accent">
              {n.label}
            </a>
          ))}
          <Link
            href="/projects"
            className={
              onProjects
                ? "text-accent"
                : "rounded-md bg-accent px-3 py-1 font-medium text-background transition-colors hover:bg-accent-hover"
            }
          >
            Projects
          </Link>
        </nav>
      </div>
    </header>
  );
}
