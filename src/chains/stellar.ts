import { CHAIN_CONFIGS, resolveChainRpcs } from '../config/chains.js';
import { fetchJsonWithRetry, HttpError } from '../core/http.js';
import type { AccountBalanceResult, DerivedAccount, TokenBalance } from '../types.js';
import {
  type BalanceFetchOptions,
  buildBaseResult,
  buildErrorResult,
  decimalStringToRaw,
  formatUnitsBigInt,
} from './utils.js';

interface StellarBalanceEntry {
  balance: string;
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
}

interface StellarAccountResponse {
  balances?: StellarBalanceEntry[];
}

export async function fetchStellarBalance(
  account: DerivedAccount,
  options: BalanceFetchOptions,
): Promise<AccountBalanceResult> {
  try {
    const rpcs = resolveChainRpcs('stellar');
    if (rpcs.length === 0) {
      throw new Error('No RPC endpoints configured for stellar');
    }

    const config = CHAIN_CONFIGS.stellar;
    const urls = rpcs.map(
      (u) => `${u.replace(/\/+$/, '')}/accounts/${encodeURIComponent(account.address)}`,
    );

    let data: StellarAccountResponse;
    try {
      data = await fetchJsonWithRetry<StellarAccountResponse>(urls, undefined, {
        timeoutMs: options.timeoutMs,
      });
    } catch (err) {
      if (err instanceof HttpError && err.statusCode === 404) {
        return buildBaseResult(account);
      }
      throw err;
    }

    let nativeRawBigInt = 0n;
    const tokens: TokenBalance[] = [];

    for (const entry of data.balances ?? []) {
      if (entry.asset_type === 'native') {
        const rawStr = decimalStringToRaw(entry.balance, config.nativeDecimals);
        nativeRawBigInt += BigInt(rawStr);
      } else if (options.includeTokens && entry.asset_code) {
        const rawStr = decimalStringToRaw(entry.balance, config.nativeDecimals);
        const rawBigInt = BigInt(rawStr);
        if (rawBigInt <= 0n) {
          continue;
        }
        const contractAddress = entry.asset_issuer
          ? `${entry.asset_code}:${entry.asset_issuer}`
          : entry.asset_code;

        tokens.push({
          symbol: entry.asset_code,
          contractAddress,
          decimals: config.nativeDecimals,
          rawBalance: rawBigInt.toString(),
          balance: formatUnitsBigInt(rawBigInt, config.nativeDecimals),
        });
      }
    }

    const base = buildBaseResult(account);
    return {
      ...base,
      nativeRaw: nativeRawBigInt.toString(),
      nativeBalance: formatUnitsBigInt(nativeRawBigInt, config.nativeDecimals),
      tokens,
    };
  } catch (err) {
    return buildErrorResult(account, err);
  }
}
