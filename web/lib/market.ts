export interface MarketData {
  priceUsd?: number;
  marketCapUsd?: number;
  volume24hUsd?: number;
  priceChange24h?: number;
  dexUrl?: string;
}

interface DexPair {
  url?: string;
  priceUsd?: string;
  marketCap?: number;
  fdv?: number;
  volume?: { h24?: number };
  priceChange?: { h24?: number };
  liquidity?: { usd?: number };
}

const cache = new Map<string, { at: number; data: MarketData | null }>();
const TTL_MS = 60_000;

export async function fetchMarket(mint: string): Promise<MarketData | null> {
  const hit = cache.get(mint);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  let data: MarketData | null = null;
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const body = (await res.json()) as { pairs?: DexPair[] | null };
      const pairs = body.pairs ?? [];
      if (pairs.length > 0) {
        const best = pairs.reduce((a, b) => ((a.liquidity?.usd ?? 0) >= (b.liquidity?.usd ?? 0) ? a : b));
        data = {
          priceUsd: best.priceUsd !== undefined ? Number(best.priceUsd) : undefined,
          marketCapUsd: best.marketCap ?? best.fdv,
          volume24hUsd: best.volume?.h24,
          priceChange24h: best.priceChange?.h24,
          dexUrl: best.url,
        };
      }
    }
  } catch {
    data = null;
  }
  cache.set(mint, { at: Date.now(), data });
  return data;
}
