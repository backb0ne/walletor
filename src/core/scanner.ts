import { fetchAccountBalance } from '../chains/index.js';
import { deriveAccountsForInput } from '../crypto/derive.js';
import { enrichWithPrices } from '../pricing/prices.js';
import type {
  AccountBalanceResult,
  ChainId,
  DerivedAccount,
  ParsedInput,
  ScanOptions,
} from '../types.js';
import { RateLimitedPool } from './scheduler.js';

const CHAIN_MIN_INTERVALS_MS: Partial<Record<ChainId, number>> = {
  ton: 350,
  tron: 250,
  solana: 200,
  bitcoin: 150,
};

const DEFAULT_CHAIN_MIN_INTERVAL_MS = 50;

function cloneResultForAccount(
  cached: AccountBalanceResult,
  account: DerivedAccount,
): AccountBalanceResult {
  return {
    inputId: account.inputId,
    inputLabel: account.inputLabel,
    chain: cached.chain,
    family: cached.family,
    address: cached.address,
    ...(account.addressType ? { addressType: account.addressType } : {}),
    ...(account.path ? { path: account.path } : {}),
    nativeBalance: cached.nativeBalance,
    nativeSymbol: cached.nativeSymbol,
    nativeRaw: cached.nativeRaw,
    ...(cached.nativePriceUsd !== undefined ? { nativePriceUsd: cached.nativePriceUsd } : {}),
    ...(cached.nativeValueUsd !== undefined ? { nativeValueUsd: cached.nativeValueUsd } : {}),
    tokens: cached.tokens.map((t) => ({ ...t })),
    totalUsd: cached.totalUsd,
    ...(cached.error ? { error: cached.error } : {}),
  };
}

function hasNonZeroBalance(result: AccountBalanceResult): boolean {
  return result.nativeBalance > 0 || result.tokens.some((t) => t.balance > 0);
}

export async function scanWallets(
  inputs: ParsedInput[],
  options: ScanOptions,
  onProgress?: (done: number, total: number, current: AccountBalanceResult) => void,
): Promise<AccountBalanceResult[]> {
  if (inputs.length === 0 || options.chains.length === 0) {
    return [];
  }

  const derivedGroups = await Promise.all(
    inputs.map((input) => deriveAccountsForInput(input, options.chains, options.accounts)),
  );
  const derivedAccounts = derivedGroups.flat();
  const total = derivedAccounts.length;

  if (total === 0) {
    return [];
  }

  const pool = new RateLimitedPool({
    concurrency: Math.max(1, options.concurrency),
    defaultMinIntervalMs: DEFAULT_CHAIN_MIN_INTERVAL_MS,
    keyMinIntervalMs: CHAIN_MIN_INTERVALS_MS,
  });

  const balanceCache = new Map<string, Promise<AccountBalanceResult>>();
  const orderedResults = new Array<AccountBalanceResult>(total);
  let done = 0;

  await Promise.all(
    derivedAccounts.map(async (account, index) => {
      const cacheKey = `${account.chain}:${account.address}`;
      let fetchPromise = balanceCache.get(cacheKey);
      if (!fetchPromise) {
        fetchPromise = pool.runWithLimit(
          () =>
            fetchAccountBalance(account, {
              includeTokens: options.includeTokens,
              timeoutMs: options.timeoutMs,
            }),
          account.chain,
        );
        balanceCache.set(cacheKey, fetchPromise);
      }

      const rawResult = await fetchPromise;
      const result = cloneResultForAccount(rawResult, account);
      orderedResults[index] = result;
      done++;
      onProgress?.(done, total, result);
    }),
  );

  const filtered = options.nonZeroOnly
    ? orderedResults.filter(hasNonZeroBalance)
    : orderedResults;

  if (!options.includePrices) {
    return filtered;
  }

  return enrichWithPrices(filtered, options.timeoutMs);
}
