import { CHAIN_CONFIGS } from '../config/chains.js';
import type { AccountBalanceResult, DerivedAccount } from '../types.js';

export interface BalanceFetchOptions {
  includeTokens: boolean;
  timeoutMs: number;
}

export function formatUnitsBigInt(raw: bigint | string, decimals: number): number {
  let value: bigint;
  if (typeof raw === 'bigint') {
    value = raw;
  } else {
    const trimmed = raw.trim();
    if (!trimmed) {
      return 0;
    }
    try {
      value = BigInt(trimmed);
    } catch {
      return 0;
    }
  }

  if (value === 0n) {
    return 0;
  }

  const negative = value < 0n;
  const abs = negative ? -value : value;
  const safeDecimals = Math.max(0, Math.floor(decimals));

  if (safeDecimals === 0) {
    const num = Number(negative ? -abs : abs);
    return Number.isFinite(num) ? num : 0;
  }

  const digits = abs.toString().padStart(safeDecimals + 1, '0');
  const splitIndex = digits.length - safeDecimals;
  const whole = digits.slice(0, splitIndex);
  const frac = digits.slice(splitIndex).replace(/0+$/, '');
  const formatted = frac.length > 0 ? `${whole}.${frac}` : whole;
  const num = Number(negative ? `-${formatted}` : formatted);
  return Number.isFinite(num) ? num : 0;
}

export function decimalStringToRaw(amountStr: string, decimals: number): string {
  const trimmed = amountStr.trim();
  if (!trimmed) {
    return '0';
  }
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  if (!/^\d+(\.\d+)?$/.test(unsigned)) {
    return '0';
  }

  const [wholePart, fracPart = ''] = unsigned.split('.');
  const safeDecimals = Math.max(0, Math.floor(decimals));
  const paddedFrac = fracPart.slice(0, safeDecimals).padEnd(safeDecimals, '0');
  const combined = `${wholePart}${paddedFrac}`.replace(/^0+/, '') || '0';
  if (combined === '0') {
    return '0';
  }
  return negative ? `-${combined}` : combined;
}

export function buildBaseResult(account: DerivedAccount): AccountBalanceResult {
  const config = CHAIN_CONFIGS[account.chain];
  return {
    inputId: account.inputId,
    inputLabel: account.inputLabel,
    chain: account.chain,
    family: account.family,
    address: account.address,
    ...(account.addressType ? { addressType: account.addressType } : {}),
    ...(account.path ? { path: account.path } : {}),
    nativeBalance: 0,
    nativeSymbol: config.nativeSymbol,
    nativeRaw: '0',
    tokens: [],
    totalUsd: 0,
  };
}

export function buildErrorResult(account: DerivedAccount, err: unknown): AccountBalanceResult {
  const message = err instanceof Error ? err.message : String(err);
  return {
    ...buildBaseResult(account),
    error: message || 'Unknown RPC error',
  };
}
