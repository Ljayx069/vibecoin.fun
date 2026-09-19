import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://vibecoin.fun"),
  title: "vibecoin — launch coins on Solana or Robinhood Chain",
  description:
    "Tokenize your repo from a Claude Code session. SPL tokens on pump.fun's bonding curve or Pons launches on Robinhood Chain with stock-pair quotes — keys that never leave your machine, creator fees that fund your agent.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
