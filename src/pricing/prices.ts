import { CHAIN_CONFIGS } from '../config/chains.js';
import { fetchJsonWithRetry } from '../core/http.js';
import type { AccountBalanceResult, ChainId, TokenBalance } from '../types.js';

const DEFILLAMA_PRICES_URL = 'https://coins.llama.fi/prices/current';
const COINGECKO_SIMPLE_PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price';
const DEFILLAMA_CHUNK_SIZE = 80;
const DEFAULT_PRICING_TIMEOUT_MS = 10_000;

const EVM_LLAMA_CHAIN: Partial<Record<ChainId, string>> = {
  ethereum: 'ethereum',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  base: 'base',
  polygon: 'polygon',
  bsc: 'bsc',
  avalanche: 'avax',
  linea: 'linea',
  scroll: 'scroll',
  blast: 'blast',
  gnosis: 'xdai',
};

interface DefiLlamaCoinPrice {
  price?: number;
  symbol?: string;
  timestamp?: number;
  confidence?: number;
}

interface DefiLlamaPricesResponse {
  coins?: Record<string, DefiLlamaCoinPrice>;
}

type CoinGeckoSimplePriceResponse = Record<string, { usd?: number } | undefined>;

export function toDefiLlamaTokenKey(chain: ChainId, contractAddress: string): string | null {
  const contract = contractAddress.trim();
  if (!contract) {
    return null;
  }

  const evmPrefix = EVM_LLAMA_CHAIN[chain];
  if (evmPrefix) {
    return `${evmPrefix}:${contract}`;
  }

  switch (chain) {
    case 'solana':
      return `solana:${contract}`;
    case 'tron':
      return `tron:${contract}`;
    case 'ton':
      return `ton:${contract}`;
    case 'sui':
      return `sui:${contract}`;
    case 'aptos':
      return `aptos:${contract}`;
    default:
      return null;
  }
}

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchDefiLlamaPrices(
  keys: string[],
  timeoutMs: number,
): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();
  if (keys.length === 0) {
    return priceMap;
  }

  const chunks = chunkArray(keys, DEFILLAMA_CHUNK_SIZE);
  const settled = await Promise.allSettled(
    chunks.map(async (chunk) => {
      const encodedKeys = chunk.map((k) => encodeURIComponent(k)).join(',');
      const url = `${DEFILLAMA_PRICES_URL}/${encodedKeys}`;
      return fetchJsonWithRetry<DefiLlamaPricesResponse>(url, undefined, {
        timeoutMs,
        maxRetries: 1,
      });
    }),
  );

  for (const outcome of settled) {
    if (outcome.status !== 'fulfilled') {
      continue;
    }
    const coins = outcome.value.coins;
    if (!coins || typeof coins !== 'object') {
      continue;
    }
    for (const [key, entry] of Object.entries(coins)) {
      if (typeof entry?.price === 'number' && Number.isFinite(entry.price) && entry.price >= 0) {
        priceMap.set(key, entry.price);
        priceMap.set(key.toLowerCase(), entry.price);
      }
    }
  }

  return priceMap;
}

async function fetchCoinGeckoFallbackPrices(
  coingeckoIds: string[],
  timeoutMs: number,
): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();
  if (coingeckoIds.length === 0) {
    return priceMap;
  }

  const apiKey = process.env.COINGECKO_API_KEY?.trim();
  const headers = apiKey ? { 'x-cg-demo-api-key': apiKey } : undefined;
  const chunks = chunkArray(coingeckoIds, DEFILLAMA_CHUNK_SIZE);

  const settled = await Promise.allSettled(
    chunks.map(async (chunk) => {
      const idsParam = encodeURIComponent(chunk.join(','));
      const url = `${COINGECKO_SIMPLE_PRICE_URL}?ids=${idsParam}&vs_currencies=usd`;
      return fetchJsonWithRetry<CoinGeckoSimplePriceResponse>(url, undefined, {
        timeoutMs,
        maxRetries: 1,
        headers,
      });
    }),
  );

  for (const outcome of settled) {
    if (outcome.status !== 'fulfilled') {
      continue;
    }
    const payload = outcome.value;
    if (!payload || typeof payload !== 'object') {
      continue;
    }
    for (const [id, entry] of Object.entries(payload)) {
      if (typeof entry?.usd === 'number' && Number.isFinite(entry.usd) && entry.usd >= 0) {
        priceMap.set(id, entry.usd);
        priceMap.set(id.toLowerCase(), entry.usd);
      }
    }
  }

  return priceMap;
}

function lookupPrice(priceMap: Map<string, number>, key: string): number | undefined {
  return priceMap.get(key) ?? priceMap.get(key.toLowerCase());
}

export async function enrichWithPrices(
  results: AccountBalanceResult[],
  timeoutMs: number = DEFAULT_PRICING_TIMEOUT_MS,
): Promise<AccountBalanceResult[]> {
  if (results.length === 0) {
    return [];
  }

  const llamaKeysSet = new Set<string>();
  const chainsInResults = new Set<ChainId>();

  for (const result of results) {
    chainsInResults.add(result.chain);
    const config = CHAIN_CONFIGS[result.chain];
    if (config?.llamaNativeId) {
      llamaKeysSet.add(config.llamaNativeId);
    }

    for (const token of result.tokens) {
      if (token.balance <= 0) {
        continue;
      }
      const key = toDefiLlamaTokenKey(result.chain, token.contractAddress);
      if (key) {
        llamaKeysSet.add(key);
      }
    }
  }

  let llamaPrices = new Map<string, number>();
  try {
    llamaPrices = await fetchDefiLlamaPrices(Array.from(llamaKeysSet), timeoutMs);
  } catch {
    llamaPrices = new Map<string, number>();
  }

  const missingCoingeckoIds = new Set<string>();
  for (const chain of chainsInResults) {
    const config = CHAIN_CONFIGS[chain];
    if (!config?.coingeckoId) {
      continue;
    }
    if (lookupPrice(llamaPrices, config.llamaNativeId) === undefined) {
      missingCoingeckoIds.add(config.coingeckoId);
    }
  }

  let coingeckoPrices = new Map<string, number>();
  if (missingCoingeckoIds.size > 0) {
    try {
      coingeckoPrices = await fetchCoinGeckoFallbackPrices(
        Array.from(missingCoingeckoIds),
        timeoutMs,
      );
    } catch {
      coingeckoPrices = new Map<string, number>();
    }
  }

  return results.map((result) => {
    const config = CHAIN_CONFIGS[result.chain];
    const nativePrice =
      (config?.llamaNativeId ? lookupPrice(llamaPrices, config.llamaNativeId) : undefined) ??
      (config?.coingeckoId ? lookupPrice(coingeckoPrices, config.coingeckoId) : undefined);

    const nativeValueUsd =
      nativePrice !== undefined ? result.nativeBalance * nativePrice : undefined;

    let totalUsd = nativeValueUsd ?? 0;

    const enrichedTokens: TokenBalance[] = result.tokens.map((token) => {
      if (token.balance <= 0) {
        return { ...token };
      }

      const key = toDefiLlamaTokenKey(result.chain, token.contractAddress);
      const tokenPrice = key ? lookupPrice(llamaPrices, key) : undefined;
      if (tokenPrice !== undefined) {
        const valueUsd = token.balance * tokenPrice;
        totalUsd += valueUsd;
        return {
          ...token,
          priceUsd: tokenPrice,
          valueUsd,
        };
      }

      return { ...token };
    });

    return {
      ...result,
      ...(nativePrice !== undefined ? { nativePriceUsd: nativePrice } : {}),
      ...(nativeValueUsd !== undefined ? { nativeValueUsd } : {}),
      tokens: enrichedTokens,
      totalUsd,
    };
  });
}
