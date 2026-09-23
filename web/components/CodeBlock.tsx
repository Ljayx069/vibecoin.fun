"use client";

import { useState } from "react";

export default function CodeBlock({ code, prompt = false }: { code: string; prompt?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — nothing to do
    }
  }
  return (
    <div className="group relative rounded-md border border-hairline bg-code">
      <button
        onClick={copy}
        aria-label="Copy to clipboard"
        className="absolute top-2 right-2 rounded border border-muted bg-background px-2 py-0.5 text-xs text-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:border-accent hover:text-accent focus:opacity-100"
      >
        {copied ? "copied" : "copy"}
      </button>
      <pre className="p-4 text-xs leading-relaxed break-all whitespace-pre-wrap text-accent">
        <code>{prompt ? `$ ${code}` : code}</code>
      </pre>
    </div>
  );
}
