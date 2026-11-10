import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { createBase58check } from '@scure/base';
import { CHAIN_CONFIGS, resolveChainRpcs } from '../config/chains.js';
import { TRC20_TOKENS } from '../config/tokens.js';
import { fetchJsonWithRetry, HttpError } from '../core/http.js';
import type { AccountBalanceResult, DerivedAccount, TokenBalance } from '../types.js';
import {
  type BalanceFetchOptions,
  buildBaseResult,
  buildErrorResult,
  formatUnitsBigInt,
} from './utils.js';

const base58check = createBase58check(sha256);

interface TronGridAccountResponse {
  data?: Array<{
    balance?: number;
  }>;
  success?: boolean;
}

interface TronWalletAccountResponse {
  balance?: number;
  address?: string;
}

interface TronTriggerSmartContractResponse {
  result?: {
    result?: boolean;
  };
  constant_result?: string[];
}

function getTronHeaders(): Record<string, string> | undefined {
  const apiKey = process.env.TRONGRID_API_KEY?.trim();
  return apiKey ? { 'TRON-PRO-API-KEY': apiKey } : undefined;
}

function tronAddressToAbiParam(address: string): string {
  if (/^41[0-9a-fA-F]{40}$/.test(address)) {
    return address.slice(2).toLowerCase().padStart(64, '0');
  }
  const decoded = base58check.decode(address);
  if (decoded.length !== 21 || decoded[0] !== 0x41) {
    throw new Error(`Invalid TRON address: ${address}`);
  }
  const evm20Hex = bytesToHex(decoded.subarray(1, 21));
  return evm20Hex.padStart(64, '0');
}

async function fetchNativeTrxBalance(
  endpoints: string[],
  address: string,
  headers: Record<string, string> | undefined,
  timeoutMs: number,
): Promise<bigint> {
  const tronGridUrls = endpoints.map((u) => `${u.replace(/\/+$/, '')}/v1/accounts/${encodeURIComponent(address)}`);

  try {
    const res = await fetchJsonWithRetry<TronGridAccountResponse>(
      tronGridUrls,
      undefined,
      { timeoutMs, headers },
    );
    const entry = res.data?.[0];
    return BigInt(entry?.balance ?? 0);
  } catch (err) {
    if (err instanceof HttpError && err.statusCode === 404) {
      return 0n;
    }

    // Fallback to /wallet/getaccount (works on publicnode & fullnodes)
    const walletUrls = endpoints.map((u) => `${u.replace(/\/+$/, '')}/wallet/getaccount`);
    const walletRes = await fetchJsonWithRetry<TronWalletAccountResponse>(
      walletUrls,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, visible: true }),
      },
      { timeoutMs, headers },
    );
    return BigInt(walletRes.balance ?? 0);
  }
}

async function fetchTrc20Balances(
  endpoints: string[],
  address: string,
  headers: Record<string, string> | undefined,
  timeoutMs: number,
): Promise<TokenBalance[]> {
  if (TRC20_TOKENS.length === 0) {
    return [];
  }

  const triggerUrls = endpoints.map(
    (u) => `${u.replace(/\/+$/, '')}/wallet/triggersmartcontract`,
  );
  const parameter = tronAddressToAbiParam(address);

  const settled = await Promise.allSettled(
    TRC20_TOKENS.map(async (token) => {
      const response = await fetchJsonWithRetry<TronTriggerSmartContractResponse>(
        triggerUrls,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner_address: address,
            contract_address: token.contractAddress,
            function_selector: 'balanceOf(address)',
            parameter,
            visible: true,
          }),
        },
        { timeoutMs, headers },
      );

      const hexResult = response.constant_result?.[0];
      if (!hexResult) {
        return { token, raw: 0n };
      }

      const raw = BigInt(`0x${hexResult.replace(/^0x/i, '') || '0'}`);
      return { token, raw };
    }),
  );

  const tokens: TokenBalance[] = [];
  for (const item of settled) {
    if (item.status === 'fulfilled' && item.value.raw > 0n) {
      const { token, raw } = item.value;
      tokens.push({
        symbol: token.symbol,
        ...(token.name ? { name: token.name } : {}),
        contractAddress: token.contractAddress,
        decimals: token.decimals,
        rawBalance: raw.toString(),
        balance: formatUnitsBigInt(raw, token.decimals),
      });
    }
  }

  return tokens;
}

export async function fetchTronBalance(
  account: DerivedAccount,
  options: BalanceFetchOptions,
): Promise<AccountBalanceResult> {
  try {
    const rpcs = resolveChainRpcs('tron');
    const endpoints = Array.from(new Set([...rpcs, 'https://tron-rpc.publicnode.com']));
    if (endpoints.length === 0) {
      throw new Error('No RPC endpoints configured for tron');
    }

    const config = CHAIN_CONFIGS.tron;
    const headers = getTronHeaders();
    const nativeSun = await fetchNativeTrxBalance(
      endpoints,
      account.address,
      headers,
      options.timeoutMs,
    );

    const tokens = options.includeTokens
      ? await fetchTrc20Balances(endpoints, account.address, headers, options.timeoutMs)
      : [];

    const base = buildBaseResult(account);
    return {
      ...base,
      nativeRaw: nativeSun.toString(),
      nativeBalance: formatUnitsBigInt(nativeSun, config.nativeDecimals),
      tokens,
    };
  } catch (err) {
    return buildErrorResult(account, err);
  }
}
