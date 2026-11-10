import { CHAIN_CONFIGS, resolveChainRpcs } from '../config/chains.js';
import { postJsonRpc } from '../core/http.js';
import type { AccountBalanceResult, DerivedAccount, TokenBalance } from '../types.js';
import {
  type BalanceFetchOptions,
  buildBaseResult,
  buildErrorResult,
  formatUnitsBigInt,
} from './utils.js';

interface SuiBalanceEntry {
  coinType: string;
  totalBalance: string;
}

interface SuiCoinMetadata {
  decimals: number;
  name?: string;
  symbol?: string;
}

interface CachedCoinMeta {
  decimals: number;
  symbol: string;
  name?: string;
}

const coinMetadataCache = new Map<string, CachedCoinMeta>();

function isNativeSuiCoinType(coinType: string): boolean {
  const lower = coinType.toLowerCase();
  return (
    lower === '0x2::sui::sui' ||
    lower === '0x0000000000000000000000000000000000000000000000000000000000000002::sui::sui'
  );
}

function fallbackSymbolFromCoinType(coinType: string): string {
  const parts = coinType.split('::');
  const last = parts[parts.length - 1];
  return last || coinType.slice(0, 12);
}

async function resolveCoinMetadata(
  rpcs: string[],
  coinType: string,
  timeoutMs: number,
): Promise<CachedCoinMeta> {
  const cached = coinMetadataCache.get(coinType);
  if (cached) {
    return cached;
  }

  try {
    const meta = await postJsonRpc<SuiCoinMetadata | null>(
      rpcs,
      'suix_getCoinMetadata',
      [coinType],
      undefined,
      timeoutMs,
    );

    const resolved: CachedCoinMeta = {
      decimals: typeof meta?.decimals === 'number' ? meta.decimals : 9,
      symbol: meta?.symbol || fallbackSymbolFromCoinType(coinType),
      ...(meta?.name ? { name: meta.name } : {}),
    };
    coinMetadataCache.set(coinType, resolved);
    return resolved;
  } catch {
    const fallback: CachedCoinMeta = {
      decimals: 9,
      symbol: fallbackSymbolFromCoinType(coinType),
    };
    coinMetadataCache.set(coinType, fallback);
    return fallback;
  }
}

export async function fetchSuiBalance(
  account: DerivedAccount,
  options: BalanceFetchOptions,
): Promise<AccountBalanceResult> {
  try {
    const rpcs = resolveChainRpcs('sui');
    if (rpcs.length === 0) {
      throw new Error('No RPC endpoints configured for sui');
    }

    const config = CHAIN_CONFIGS.sui;
    const balances = await postJsonRpc<SuiBalanceEntry[]>(
      rpcs,
      'suix_getAllBalances',
      [account.address],
      undefined,
      options.timeoutMs,
    );

    let nativeMist = 0n;
    const otherCoins: Array<{ coinType: string; raw: bigint }> = [];

    for (const entry of balances) {
      let raw: bigint;
      try {
        raw = BigInt(entry.totalBalance ?? '0');
      } catch {
        continue;
      }
      if (raw <= 0n) {
        continue;
      }

      if (isNativeSuiCoinType(entry.coinType)) {
        nativeMist += raw;
      } else if (options.includeTokens) {
        otherCoins.push({ coinType: entry.coinType, raw });
      }
    }

    const tokens: TokenBalance[] = [];
    if (options.includeTokens && otherCoins.length > 0) {
      const metas = await Promise.all(
        otherCoins.map((c) => resolveCoinMetadata(rpcs, c.coinType, options.timeoutMs)),
      );

      for (let i = 0; i < otherCoins.length; i++) {
        const { coinType, raw } = otherCoins[i];
        const meta = metas[i];
        tokens.push({
          symbol: meta.symbol,
          ...(meta.name ? { name: meta.name } : {}),
          contractAddress: coinType,
          decimals: meta.decimals,
          rawBalance: raw.toString(),
          balance: formatUnitsBigInt(raw, meta.decimals),
        });
      }
    }

    const base = buildBaseResult(account);
    return {
      ...base,
      nativeRaw: nativeMist.toString(),
      nativeBalance: formatUnitsBigInt(nativeMist, config.nativeDecimals),
      tokens,
    };
  } catch (err) {
    return buildErrorResult(account, err);
  }
}
