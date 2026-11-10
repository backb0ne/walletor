import type { AccountBalanceResult, ChainId } from '../types.js';
import { sanitizeErrorMessage } from './sanitize.js';

export interface ChainJsonSummary {
  accountsCount: number;
  nonZeroCount: number;
  errorCount: number;
  nativeSymbol: string;
  nativeBalance: number;
  totalUsd: number;
}

export interface WalletorJsonOutput {
  totalUsd: number;
  accountsCount: number;
  nonZeroCount: number;
  byChain: Partial<Record<ChainId, ChainJsonSummary>>;
  results: AccountBalanceResult[];
}

export function formatJson(results: AccountBalanceResult[]): string {
  const byChain: Partial<Record<ChainId, ChainJsonSummary>> = {};
  let totalUsd = 0;
  let nonZeroCount = 0;

  const sanitizedResults = results.map((result) => {
    const isNonZero =
      result.nativeBalance > 0 || result.tokens.some((t) => t.balance > 0);
    if (isNonZero) {
      nonZeroCount += 1;
    }
    totalUsd += result.totalUsd;

    const existing = byChain[result.chain] ?? {
      accountsCount: 0,
      nonZeroCount: 0,
      errorCount: 0,
      nativeSymbol: result.nativeSymbol,
      nativeBalance: 0,
      totalUsd: 0,
    };

    existing.accountsCount += 1;
    if (isNonZero) {
      existing.nonZeroCount += 1;
    }
    if (result.error) {
      existing.errorCount += 1;
    }
    existing.nativeBalance += result.nativeBalance;
    existing.totalUsd += result.totalUsd;
    byChain[result.chain] = existing;

    if (!result.error) {
      return result;
    }

    return {
      ...result,
      error: sanitizeErrorMessage(result.error),
    };
  });

  const payload: WalletorJsonOutput = {
    totalUsd,
    accountsCount: results.length,
    nonZeroCount,
    byChain,
    results: sanitizedResults,
  };

  return JSON.stringify(payload, null, 2);
}
