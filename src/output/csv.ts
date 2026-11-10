import type { AccountBalanceResult } from '../types.js';
import { sanitizeErrorMessage } from './sanitize.js';

const CSV_HEADER = [
  'wallet',
  'chain',
  'family',
  'address',
  'address_type',
  'path',
  'asset_type',
  'symbol',
  'contract',
  'balance',
  'price_usd',
  'value_usd',
  'error',
];

function escapeCsvCell(value: string | number | undefined): string {
  if (value === undefined) {
    return '';
  }
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvRow(fields: Array<string | number | undefined>): string {
  return fields.map(escapeCsvCell).join(',');
}

export function formatCsv(results: AccountBalanceResult[]): string {
  const rows: string[] = [CSV_HEADER.join(',')];

  for (const result of results) {
    const cleanError = result.error ? sanitizeErrorMessage(result.error) : '';

    rows.push(
      buildCsvRow([
        result.inputLabel,
        result.chain,
        result.family,
        result.address,
        result.addressType ?? '',
        result.path ?? '',
        'native',
        result.nativeSymbol,
        '',
        result.nativeBalance,
        result.nativePriceUsd,
        result.nativeValueUsd,
        cleanError,
      ]),
    );

    for (const token of result.tokens) {
      if (token.balance <= 0) {
        continue;
      }

      rows.push(
        buildCsvRow([
          result.inputLabel,
          result.chain,
          result.family,
          result.address,
          result.addressType ?? '',
          result.path ?? '',
          'token',
          token.symbol,
          token.contractAddress,
          token.balance,
          token.priceUsd,
          token.valueUsd,
          cleanError,
        ]),
      );
    }
  }

  return rows.join('\n');
}
