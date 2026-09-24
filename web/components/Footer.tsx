export default function Footer() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto max-w-3xl px-6 py-8 text-center text-xs text-muted">
        <p>made for people who ship</p>
        <p className="mt-2 space-x-2">
          <a href="https://x.com/vibecoindotfun" className="transition-colors hover:text-accent">
            X
          </a>
          <span>·</span>
          <a href="https://modelcontextprotocol.io" className="transition-colors hover:text-accent">
            MCP
          </a>
          <span>·</span>
          <a href="https://github.com/ivanbvz/vibecoin-mcp" className="transition-colors hover:text-accent">
            GitHub
          </a>
          <span>·</span>
          <a href="https://pump.fun" className="transition-colors hover:text-accent">
            pump.fun
          </a>
          <span>·</span>
          <a href="https://ponsfamily.com" className="transition-colors hover:text-accent">
            Pons
          </a>
        </p>
      </div>
    </footer>
  );
}
