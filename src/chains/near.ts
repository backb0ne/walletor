import { CHAIN_CONFIGS, resolveChainRpcs } from '../config/chains.js';
import { fetchJsonWithRetry } from '../core/http.js';
import type { AccountBalanceResult, DerivedAccount } from '../types.js';
import {
  type BalanceFetchOptions,
  buildBaseResult,
  buildErrorResult,
  formatUnitsBigInt,
} from './utils.js';

interface NearViewAccountResult {
  amount?: string;
  error?: string;
}

interface NearRpcError {
  code?: number;
  message?: string;
  data?: unknown;
  cause?: {
    name?: string;
  };
}

interface NearJsonRpcResponse {
  result?: NearViewAccountResult;
  error?: NearRpcError;
}

function isUnknownNearAccountError(response: NearJsonRpcResponse): boolean {
  if (response.result?.error && /does not exist|UNKNOWN_ACCOUNT/i.test(response.result.error)) {
    return true;
  }
  if (response.error) {
    if (response.error.cause?.name === 'UNKNOWN_ACCOUNT') {
      return true;
    }
    const serialized = `${response.error.message ?? ''} ${JSON.stringify(response.error.data ?? '')}`;
    if (/UNKNOWN_ACCOUNT|does not exist/i.test(serialized)) {
      return true;
    }
  }
  return false;
}

export async function fetchNearBalance(
  account: DerivedAccount,
  options: BalanceFetchOptions,
): Promise<AccountBalanceResult> {
  try {
    const rpcs = resolveChainRpcs('near');
    if (rpcs.length === 0) {
      throw new Error('No RPC endpoints configured for near');
    }

    const config = CHAIN_CONFIGS.near;
    const response = await fetchJsonWithRetry<NearJsonRpcResponse>(
      rpcs,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'query',
          params: {
            request_type: 'view_account',
            finality: 'final',
            account_id: account.address,
          },
        }),
      },
      { timeoutMs: options.timeoutMs },
    );

    if (isUnknownNearAccountError(response)) {
      return buildBaseResult(account);
    }

    if (response.error) {
      throw new Error(
        `NEAR JSON-RPC error (${response.error.code ?? 'unknown'}): ${response.error.message ?? 'Unknown error'}`,
      );
    }

    if (response.result?.error) {
      throw new Error(`NEAR query error: ${response.result.error}`);
    }

    const yocto = BigInt(response.result?.amount ?? '0');
    const base = buildBaseResult(account);
    return {
      ...base,
      nativeRaw: yocto.toString(),
      nativeBalance: formatUnitsBigInt(yocto, config.nativeDecimals),
    };
  } catch (err) {
    return buildErrorResult(account, err);
  }
}
