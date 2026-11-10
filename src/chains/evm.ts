import { createPublicClient, erc20Abi, fallback, http, type Address } from 'viem';
import { CHAIN_CONFIGS, resolveChainRpcs } from '../config/chains.js';
import { getTokensForChain, type TokenConfig } from '../config/tokens.js';
import { fetchJsonWithRetry, postJsonRpc } from '../core/http.js';
import type { AccountBalanceResult, DerivedAccount, TokenBalance } from '../types.js';
import {
  type BalanceFetchOptions,
  buildBaseResult,
  buildErrorResult,
  formatUnitsBigInt,
} from './utils.js';

const MULTICALL3_ADDRESS: Address = '0xcA11bde05977b3631167028862bE2a173976CA11';

interface JsonRpcBatchItem {
  id: number;
  result?: string;
  error?: { code?: number; message?: string };
}

function encodeBalanceOfCalldata(owner: string): string {
  const cleanAddr = owner.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  return `0x70a08231${cleanAddr}`;
}

function decodeUint256Hex(hex: string | undefined): bigint {
  if (!hex || hex === '0x' || hex === '0x0') {
    return 0n;
  }
  try {
    return BigInt(hex);
  } catch {
    return 0n;
  }
}

async function fetchTokensViaBatchEthCall(
  rpcs: string[],
  owner: string,
  tokens: TokenConfig[],
  timeoutMs: number,
): Promise<TokenBalance[]> {
  const calldata = encodeBalanceOfCalldata(owner);
  const batchPayload = tokens.map((token, index) => ({
    jsonrpc: '2.0',
    id: index,
    method: 'eth_call',
    params: [{ to: token.contractAddress, data: calldata }, 'latest'],
  }));

  try {
    const response = await fetchJsonWithRetry<JsonRpcBatchItem[]>(
      rpcs,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batchPayload),
      },
      { timeoutMs },
    );

    if (Array.isArray(response)) {
      const byId = new Map<number, string | undefined>();
      for (const item of response) {
        if (typeof item?.id === 'number' && !item.error) {
          byId.set(item.id, item.result);
        }
      }

      const balances: TokenBalance[] = [];
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const raw = decodeUint256Hex(byId.get(i));
        if (raw > 0n) {
          balances.push({
            symbol: token.symbol,
            ...(token.name ? { name: token.name } : {}),
            contractAddress: token.contractAddress,
            decimals: token.decimals,
            rawBalance: raw.toString(),
            balance: formatUnitsBigInt(raw, token.decimals),
          });
        }
      }
      return balances;
    }
  } catch {
    // Fall back to individual eth_call requests if RPC disables JSON-RPC batching
  }

  const settled = await Promise.allSettled(
    tokens.map(async (token) => {
      const hex = await postJsonRpc<string>(
        rpcs,
        'eth_call',
        [{ to: token.contractAddress, data: calldata }, 'latest'],
        undefined,
        timeoutMs,
      );
      return { token, raw: decodeUint256Hex(hex) };
    }),
  );

  const balances: TokenBalance[] = [];
  for (const item of settled) {
    if (item.status === 'fulfilled' && item.value.raw > 0n) {
      const { token, raw } = item.value;
      balances.push({
        symbol: token.symbol,
        ...(token.name ? { name: token.name } : {}),
        contractAddress: token.contractAddress,
        decimals: token.decimals,
        rawBalance: raw.toString(),
        balance: formatUnitsBigInt(raw, token.decimals),
      });
    }
  }
  return balances;
}

export async function fetchEvmBalance(
  account: DerivedAccount,
  options: BalanceFetchOptions,
): Promise<AccountBalanceResult> {
  try {
    const rpcs = resolveChainRpcs(account.chain);
    if (rpcs.length === 0) {
      throw new Error(`No RPC endpoints configured for ${account.chain}`);
    }

    const config = CHAIN_CONFIGS[account.chain];
    const address = account.address as Address;
    const client = createPublicClient({
      transport: fallback(
        rpcs.map((url) => http(url, { timeout: options.timeoutMs, retryCount: 1 })),
        { rank: false },
      ),
    });

    const nativeRawBigInt = await client.getBalance({ address });

    let tokens: TokenBalance[] = [];
    if (options.includeTokens) {
      const configuredTokens = getTokensForChain(account.chain);
      if (configuredTokens.length > 0) {
        try {
          const multicallResults = await client.multicall({
            multicallAddress: MULTICALL3_ADDRESS,
            allowFailure: true,
            contracts: configuredTokens.map((token) => ({
              address: token.contractAddress as Address,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [address],
            })),
          });

          const allFailed =
            multicallResults.length > 0 &&
            multicallResults.every((entry) => entry.status === 'failure');

          if (allFailed) {
            tokens = await fetchTokensViaBatchEthCall(
              rpcs,
              account.address,
              configuredTokens,
              options.timeoutMs,
            );
          } else {
            for (let i = 0; i < configuredTokens.length; i++) {
              const entry = multicallResults[i];
              if (entry && entry.status === 'success') {
                const raw = BigInt(entry.result as bigint);
                if (raw > 0n) {
                  const token = configuredTokens[i];
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
            }
          }
        } catch {
          tokens = await fetchTokensViaBatchEthCall(
            rpcs,
            account.address,
            configuredTokens,
            options.timeoutMs,
          );
        }
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
