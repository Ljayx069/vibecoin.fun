export default function Footer() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto max-w-3xl px-6 py-8 text-center text-xs text-muted">
        <p>made for people who ship</p>
        <p className="mt-2 space-x-2">
          <a href="https://github.com/anthropics/claude-code" className="transition-colors hover:text-accent">
            Claude Code
          </a>
          <span>·</span>
          <a href="https://github.com/thetriggeredkid-spec/vibecoin-mcp" className="transition-colors hover:text-accent">
            GitHub
          </a>
          <span>·</span>
          <a href="https://pump.fun" className="transition-colors hover:text-accent">
            pump.fun
          </a>
        </p>
      </div>
    </footer>
  );
}
