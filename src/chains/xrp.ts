import { CHAIN_CONFIGS, resolveChainRpcs } from '../config/chains.js';
import { postJsonRpc } from '../core/http.js';
import type { AccountBalanceResult, DerivedAccount, TokenBalance } from '../types.js';
import {
  type BalanceFetchOptions,
  buildBaseResult,
  buildErrorResult,
  decimalStringToRaw,
  formatUnitsBigInt,
} from './utils.js';

interface XrpAccountInfoResult {
  error?: string;
  error_message?: string;
  account_data?: {
    Balance?: string;
  };
}

interface XrpAccountLinesResult {
  error?: string;
  lines?: Array<{
    account: string;
    balance: string;
    currency: string;
  }>;
}

function decodeXrpCurrencyCode(currency: string): string {
  if (/^[0-9A-Fa-f]{40}$/.test(currency)) {
    const bytes: number[] = [];
    for (let i = 0; i < currency.length; i += 2) {
      const code = parseInt(currency.slice(i, i + 2), 16);
      if (code === 0) {
        continue;
      }
      if (code >= 0x20 && code <= 0x7e) {
        bytes.push(code);
      } else {
        return currency;
      }
    }
    const ascii = String.fromCharCode(...bytes).trim();
    return ascii || currency;
  }
  return currency;
}

export async function fetchXrpBalance(
  account: DerivedAccount,
  options: BalanceFetchOptions,
): Promise<AccountBalanceResult> {
  try {
    const rpcs = resolveChainRpcs('xrp');
    if (rpcs.length === 0) {
      throw new Error('No RPC endpoints configured for xrp');
    }

    const config = CHAIN_CONFIGS.xrp;
    const info = await postJsonRpc<XrpAccountInfoResult>(
      rpcs,
      'account_info',
      [{ account: account.address, ledger_index: 'validated' }],
      undefined,
      options.timeoutMs,
    );

    if (info.error === 'actNotFound') {
      return buildBaseResult(account);
    }

    if (info.error) {
      throw new Error(`XRPL RPC error: ${info.error_message ?? info.error}`);
    }

    const nativeDrops = BigInt(info.account_data?.Balance ?? '0');
    const tokens: TokenBalance[] = [];

    if (options.includeTokens) {
      try {
        const linesRes = await postJsonRpc<XrpAccountLinesResult>(
          rpcs,
          'account_lines',
          [{ account: account.address, ledger_index: 'validated' }],
          undefined,
          options.timeoutMs,
        );

        for (const line of linesRes.lines ?? []) {
          const balNum = Number(line.balance);
          if (!Number.isFinite(balNum) || balNum <= 0) {
            continue;
          }
          const symbol = decodeXrpCurrencyCode(line.currency);
          const decimals = 6;
          tokens.push({
            symbol,
            contractAddress: `${symbol}:${line.account}`,
            decimals,
            rawBalance: decimalStringToRaw(line.balance, decimals),
            balance: balNum,
          });
        }
      } catch {
        // Non-fatal if trustline lookup fails after native balance succeeded
      }
    }

    const base = buildBaseResult(account);
    return {
      ...base,
      nativeRaw: nativeDrops.toString(),
      nativeBalance: formatUnitsBigInt(nativeDrops, config.nativeDecimals),
      tokens,
    };
  } catch (err) {
    return buildErrorResult(account, err);
  }
}
