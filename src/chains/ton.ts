import { CHAIN_CONFIGS, resolveChainRpcs } from '../config/chains.js';
import { fetchJsonWithRetry, HttpError, postJsonRpc } from '../core/http.js';
import type { AccountBalanceResult, DerivedAccount, TokenBalance } from '../types.js';
import {
  type BalanceFetchOptions,
  buildBaseResult,
  buildErrorResult,
  formatUnitsBigInt,
} from './utils.js';

interface TonApiAccountResponse {
  balance?: string | number;
}

interface TonApiJettonsResponse {
  balances?: Array<{
    balance?: string;
    jetton?: {
      address?: string;
      symbol?: string;
      name?: string;
      decimals?: number;
    };
  }>;
}

function getTonApiHeaders(): Record<string, string> | undefined {
  const key = process.env.TONAPI_KEY?.trim();
  return key ? { Authorization: `Bearer ${key}` } : undefined;
}

function getToncenterHeaders(): Record<string, string> | undefined {
  const key = process.env.TONCENTER_API_KEY?.trim();
  return key ? { 'X-API-Key': key } : undefined;
}

function isToncenterUrl(url: string): boolean {
  return url.includes('toncenter.com') || url.endsWith('/jsonRPC');
}

async function fetchViaTonApi(
  baseUrl: string,
  address: string,
  includeTokens: boolean,
  timeoutMs: number,
): Promise<{ nativeNano: bigint; tokens: TokenBalance[] }> {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const headers = getTonApiHeaders();
  const encodedAddr = encodeURIComponent(address);

  let nativeNano = 0n;
  let accountFound = true;

  try {
    const accountData = await fetchJsonWithRetry<TonApiAccountResponse>(
      `${cleanBase}/accounts/${encodedAddr}`,
      undefined,
      { timeoutMs, headers },
    );
    nativeNano = BigInt(accountData.balance ?? 0);
  } catch (err) {
    if (err instanceof HttpError && err.statusCode === 404) {
      accountFound = false;
      nativeNano = 0n;
    } else {
      throw err;
    }
  }

  const tokens: TokenBalance[] = [];
  if (includeTokens && accountFound) {
    try {
      const jettonsData = await fetchJsonWithRetry<TonApiJettonsResponse>(
        `${cleanBase}/accounts/${encodedAddr}/jettons`,
        undefined,
        { timeoutMs, headers },
      );

      for (const item of jettonsData.balances ?? []) {
        const rawStr = item.balance ?? '0';
        let raw: bigint;
        try {
          raw = BigInt(rawStr);
        } catch {
          continue;
        }
        if (raw <= 0n || !item.jetton?.address) {
          continue;
        }
        const decimals = typeof item.jetton.decimals === 'number' ? item.jetton.decimals : 9;
        tokens.push({
          symbol: item.jetton.symbol || 'JETTON',
          ...(item.jetton.name ? { name: item.jetton.name } : {}),
          contractAddress: item.jetton.address,
          decimals,
          rawBalance: raw.toString(),
          balance: formatUnitsBigInt(raw, decimals),
        });
      }
    } catch (err) {
      if (!(err instanceof HttpError && err.statusCode === 404)) {
        // Non-fatal for jetton query failure when native balance succeeded
      }
    }
  }

  return { nativeNano, tokens };
}

async function fetchViaToncenter(
  baseUrl: string,
  address: string,
  timeoutMs: number,
): Promise<bigint> {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const rpcUrl = cleanBase.endsWith('/jsonRPC') ? cleanBase : `${cleanBase}/jsonRPC`;
  const result = await postJsonRpc<string | number>(
    rpcUrl,
    'getAddressBalance',
    { address },
    getToncenterHeaders(),
    timeoutMs,
  );
  return BigInt(result ?? 0);
}

export async function fetchTonBalance(
  account: DerivedAccount,
  options: BalanceFetchOptions,
): Promise<AccountBalanceResult> {
  try {
    const rpcs = resolveChainRpcs('ton');
    if (rpcs.length === 0) {
      throw new Error('No RPC endpoints configured for ton');
    }

    const config = CHAIN_CONFIGS.ton;
    const tonApiEndpoints = rpcs.filter((u) => !isToncenterUrl(u));
    const toncenterEndpoints = rpcs.filter((u) => isToncenterUrl(u));

    const preferToncenter =
      Boolean(process.env.TONCENTER_API_KEY?.trim()) && !process.env.TONAPI_KEY?.trim();

    const orderedProviders: Array<{ kind: 'tonapi' | 'toncenter'; url: string }> = [];
    if (preferToncenter && !options.includeTokens) {
      for (const u of toncenterEndpoints) orderedProviders.push({ kind: 'toncenter', url: u });
      for (const u of tonApiEndpoints) orderedProviders.push({ kind: 'tonapi', url: u });
    } else {
      for (const u of tonApiEndpoints) orderedProviders.push({ kind: 'tonapi', url: u });
      for (const u of toncenterEndpoints) orderedProviders.push({ kind: 'toncenter', url: u });
    }

    let lastError: unknown;
    for (const provider of orderedProviders) {
      try {
        if (provider.kind === 'tonapi') {
          const { nativeNano, tokens } = await fetchViaTonApi(
            provider.url,
            account.address,
            options.includeTokens,
            options.timeoutMs,
          );
          const base = buildBaseResult(account);
          return {
            ...base,
            nativeRaw: nativeNano.toString(),
            nativeBalance: formatUnitsBigInt(nativeNano, config.nativeDecimals),
            tokens,
          };
        }

        const nativeNano = await fetchViaToncenter(
          provider.url,
          account.address,
          options.timeoutMs,
        );
        const base = buildBaseResult(account);
        return {
          ...base,
          nativeRaw: nativeNano.toString(),
          nativeBalance: formatUnitsBigInt(nativeNano, config.nativeDecimals),
          tokens: [],
        };
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('All TON endpoints failed');
  } catch (err) {
    return buildErrorResult(account, err);
  }
}
