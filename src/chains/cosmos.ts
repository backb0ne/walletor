import { CHAIN_CONFIGS, resolveChainRpcs } from '../config/chains.js';
import { fetchJsonWithRetry, HttpError } from '../core/http.js';
import type { AccountBalanceResult, DerivedAccount, TokenBalance } from '../types.js';
import {
  type BalanceFetchOptions,
  buildBaseResult,
  buildErrorResult,
  formatUnitsBigInt,
} from './utils.js';

interface CosmosBankBalancesResponse {
  balances?: Array<{
    denom?: string;
    amount?: string;
  }>;
}

interface KnownCosmosDenom {
  symbol: string;
  name: string;
  decimals: number;
}

const KNOWN_COSMOS_DENOMS: Record<string, KnownCosmosDenom> = {
  uatom: { symbol: 'ATOM', name: 'Cosmos Hub', decimals: 6 },
  uosmo: { symbol: 'OSMO', name: 'Osmosis', decimals: 6 },
  utia: { symbol: 'TIA', name: 'Celestia', decimals: 6 },
  uion: { symbol: 'ION', name: 'Ion', decimals: 6 },
  // USDC (Noble) on Osmosis / Cosmos
  'ibc/498A0751C798A0D9A389AA3691123DADA57DAA4FE165D5C75894505B876BA6E4': {
    symbol: 'USDC',
    name: 'USD Coin (Noble)',
    decimals: 6,
  },
  // ATOM on Osmosis
  'ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2': {
    symbol: 'ATOM',
    name: 'Cosmos Hub (IBC)',
    decimals: 6,
  },
  // TIA on Osmosis
  'ibc/D79E7D83AB399BFFF93433E54FAA480C191248FC556924A2A8351AE2638B3877': {
    symbol: 'TIA',
    name: 'Celestia (IBC)',
    decimals: 6,
  },
};

function formatCosmosDenomSymbol(denom: string): string {
  if (denom.startsWith('ibc/')) {
    return `IBC:${denom.slice(4, 10)}..`;
  }
  if (denom.startsWith('factory/')) {
    const parts = denom.split('/');
    return parts[parts.length - 1] || denom.slice(0, 14);
  }
  if (denom.startsWith('u') && denom.length > 2 && denom.length <= 8) {
    return denom.slice(1).toUpperCase();
  }
  return denom.slice(0, 14);
}

export async function fetchCosmosBalance(
  account: DerivedAccount,
  options: BalanceFetchOptions,
): Promise<AccountBalanceResult> {
  try {
    const config = CHAIN_CONFIGS[account.chain];
    const rpcs = resolveChainRpcs(account.chain);
    if (rpcs.length === 0) {
      throw new Error(`No RPC endpoints configured for ${account.chain}`);
    }

    const nativeDenom = config.cosmosDenom;
    const urls = rpcs.map(
      (u) => `${u.replace(/\/+$/, '')}/cosmos/bank/v1beta1/balances/${encodeURIComponent(account.address)}`,
    );

    let data: CosmosBankBalancesResponse;
    try {
      data = await fetchJsonWithRetry<CosmosBankBalancesResponse>(urls, undefined, {
        timeoutMs: options.timeoutMs,
      });
    } catch (err) {
      if (err instanceof HttpError && err.statusCode === 404) {
        return buildBaseResult(account);
      }
      throw err;
    }

    let nativeRaw = 0n;
    const tokens: TokenBalance[] = [];

    for (const entry of data.balances ?? []) {
      const denom = entry.denom;
      if (!denom) {
        continue;
      }

      let raw: bigint;
      try {
        raw = BigInt(entry.amount ?? '0');
      } catch {
        continue;
      }

      if (raw <= 0n) {
        continue;
      }

      if (nativeDenom && denom === nativeDenom) {
        nativeRaw += raw;
      } else if (options.includeTokens) {
        const known = KNOWN_COSMOS_DENOMS[denom];
        const decimals = known?.decimals ?? 6;
        tokens.push({
          symbol: known?.symbol ?? formatCosmosDenomSymbol(denom),
          ...(known?.name ? { name: known.name } : {}),
          contractAddress: denom,
          decimals,
          rawBalance: raw.toString(),
          balance: formatUnitsBigInt(raw, decimals),
        });
      }
    }

    const base = buildBaseResult(account);
    return {
      ...base,
      nativeRaw: nativeRaw.toString(),
      nativeBalance: formatUnitsBigInt(nativeRaw, config.nativeDecimals),
      tokens,
    };
  } catch (err) {
    return buildErrorResult(account, err);
  }
}
