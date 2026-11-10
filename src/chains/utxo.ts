import { CHAIN_CONFIGS, resolveChainRpcs } from '../config/chains.js';
import { fetchJsonWithRetry, HttpError } from '../core/http.js';
import type { AccountBalanceResult, DerivedAccount } from '../types.js';
import {
  type BalanceFetchOptions,
  buildBaseResult,
  buildErrorResult,
  decimalStringToRaw,
  formatUnitsBigInt,
} from './utils.js';

interface EsploraAddressResponse {
  chain_stats?: {
    funded_txo_sum?: number;
    spent_txo_sum?: number;
  };
  mempool_stats?: {
    funded_txo_sum?: number;
    spent_txo_sum?: number;
  };
}

interface BlockbookAddressResponse {
  balance?: string;
  unconfirmedBalance?: string;
}

interface BlockcypherBalanceResponse {
  final_balance?: number;
  balance?: number;
}

interface DogechainBalanceResponse {
  balance?: string;
  confirmed?: string;
  success?: number;
  error?: string;
}

function parseEsploraBalance(data: EsploraAddressResponse): bigint {
  const chainFunded = BigInt(data.chain_stats?.funded_txo_sum ?? 0);
  const chainSpent = BigInt(data.chain_stats?.spent_txo_sum ?? 0);
  const mempoolFunded = BigInt(data.mempool_stats?.funded_txo_sum ?? 0);
  const mempoolSpent = BigInt(data.mempool_stats?.spent_txo_sum ?? 0);

  const total = chainFunded - chainSpent + (mempoolFunded - mempoolSpent);
  return total > 0n ? total : 0n;
}

function parseBlockbookBalance(data: BlockbookAddressResponse): bigint {
  const confirmed = BigInt(data.balance ?? '0');
  const unconfirmed = BigInt(data.unconfirmedBalance ?? '0');
  const total = confirmed + unconfirmed;
  return total > 0n ? total : 0n;
}

function buildUtxoEndpoints(chain: 'bitcoin' | 'litecoin' | 'dogecoin'): string[] {
  const configured = resolveChainRpcs(chain);
  const extras: string[] = [];

  if (chain === 'litecoin') {
    extras.push('https://ltc1.trezor.io/api/v2');
  } else if (chain === 'dogecoin') {
    extras.push('https://doge1.trezor.io/api/v2');
  }

  return Array.from(new Set([...configured, ...extras]));
}

async function queryUtxoEndpoint(
  baseUrl: string,
  address: string,
  decimals: number,
  timeoutMs: number,
): Promise<bigint> {
  const trimmedBase = baseUrl.replace(/\/+$/, '');

  if (trimmedBase.includes('trezor.io') || trimmedBase.includes('/api/v2')) {
    try {
      const data = await fetchJsonWithRetry<BlockbookAddressResponse>(
        `${trimmedBase}/address/${encodeURIComponent(address)}`,
        undefined,
        { timeoutMs, maxRetries: 1 },
      );
      return parseBlockbookBalance(data);
    } catch (err) {
      if (err instanceof HttpError && err.statusCode === 404) {
        return 0n;
      }
      throw err;
    }
  }

  if (trimmedBase.includes('api.blockcypher.com')) {
    try {
      const data = await fetchJsonWithRetry<BlockcypherBalanceResponse>(
        `${trimmedBase}/addrs/${encodeURIComponent(address)}/balance`,
        undefined,
        { timeoutMs, maxRetries: 1 },
      );
      const sats = BigInt(Math.max(0, Math.trunc(data.final_balance ?? data.balance ?? 0)));
      return sats;
    } catch (err) {
      if (err instanceof HttpError && err.statusCode === 404) {
        return 0n;
      }
      throw err;
    }
  }

  if (trimmedBase.includes('dogechain.info')) {
    try {
      const data = await fetchJsonWithRetry<DogechainBalanceResponse>(
        `${trimmedBase}/address/balance/${encodeURIComponent(address)}`,
        undefined,
        { timeoutMs, maxRetries: 1 },
      );
      if (data.success === 0 && /not found|unknown/i.test(data.error ?? '')) {
        return 0n;
      }
      const rawStr = decimalStringToRaw(data.balance ?? '0', decimals);
      const total = BigInt(rawStr);
      return total > 0n ? total : 0n;
    } catch (err) {
      if (err instanceof HttpError && err.statusCode === 404) {
        return 0n;
      }
      throw err;
    }
  }

  // Esplora REST (mempool.space, blockstream.info, litecoinspace.org, etc.)
  try {
    const data = await fetchJsonWithRetry<EsploraAddressResponse>(
      `${trimmedBase}/address/${encodeURIComponent(address)}`,
      undefined,
      { timeoutMs, maxRetries: 1 },
    );
    return parseEsploraBalance(data);
  } catch (err) {
    if (err instanceof HttpError && err.statusCode === 404) {
      return 0n;
    }
    throw err;
  }
}

export async function fetchUtxoBalance(
  account: DerivedAccount,
  options: BalanceFetchOptions,
): Promise<AccountBalanceResult> {
  try {
    if (
      account.chain !== 'bitcoin' &&
      account.chain !== 'litecoin' &&
      account.chain !== 'dogecoin'
    ) {
      throw new Error(`Unsupported UTXO chain: ${account.chain}`);
    }

    const config = CHAIN_CONFIGS[account.chain];
    const endpoints = buildUtxoEndpoints(account.chain);
    if (endpoints.length === 0) {
      throw new Error(`No RPC endpoints configured for ${account.chain}`);
    }

    let lastError: unknown;
    let resolvedSats: bigint | null = null;

    for (const endpoint of endpoints) {
      try {
        resolvedSats = await queryUtxoEndpoint(
          endpoint,
          account.address,
          config.nativeDecimals,
          options.timeoutMs,
        );
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (resolvedSats === null) {
      throw lastError instanceof Error
        ? lastError
        : new Error(`All UTXO endpoints failed for ${account.chain}`);
    }

    const base = buildBaseResult(account);
    return {
      ...base,
      nativeRaw: resolvedSats.toString(),
      nativeBalance: formatUnitsBigInt(resolvedSats, config.nativeDecimals),
    };
  } catch (err) {
    return buildErrorResult(account, err);
  }
}
