import chalk from 'chalk';
import Table from 'cli-table3';
import { CHAIN_CONFIGS } from '../config/chains.js';
import type { AccountBalanceResult, ChainId, TokenBalance } from '../types.js';
import { sanitizeErrorMessage } from './sanitize.js';

function formatAmount(value: number): string {
  if (!Number.isFinite(value) || value === 0) {
    return '0';
  }
  if (value >= 1000) {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  if (value >= 1) {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }
  if (value >= 0.0001) {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
  }
  return value.toPrecision(4);
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatTokenSummary(tokens: TokenBalance[]): string {
  const nonZero = tokens.filter((t) => t.balance > 0);
  if (nonZero.length === 0) {
    return '-';
  }

  const sorted = [...nonZero].sort((a, b) => {
    const valDiff = (b.valueUsd ?? 0) - (a.valueUsd ?? 0);
    if (valDiff !== 0) return valDiff;
    return b.balance - a.balance;
  });

  const maxVisible = 3;
  const parts = sorted
    .slice(0, maxVisible)
    .map((t) => `${formatAmount(t.balance)} ${t.symbol}`);

  let summary = parts.join(', ');
  if (sorted.length > maxVisible) {
    summary += ` (+${sorted.length - maxVisible} more)`;
  }

  if (summary.length > 56) {
    return `${summary.slice(0, 53)}...`;
  }
  return summary;
}

function hasAnyPrice(result: AccountBalanceResult): boolean {
  if (result.nativePriceUsd !== undefined) {
    return true;
  }
  return result.tokens.some((t) => t.priceUsd !== undefined);
}

function hasHoldings(result: AccountBalanceResult): boolean {
  return result.nativeBalance > 0 || result.tokens.some((t) => t.balance > 0);
}

export function formatTable(
  results: AccountBalanceResult[],
  options?: { showErrors?: boolean },
): string {
  if (results.length === 0) {
    return chalk.yellow('No matching accounts or non-zero balances found.');
  }

  const sections: string[] = [];

  const mainTable = new Table({
    head: [
      chalk.bold('Wallet'),
      chalk.bold('Chain'),
      chalk.bold('Address'),
      chalk.bold('Type'),
      chalk.bold('Native'),
      chalk.bold('Tokens'),
      chalk.bold('Total USD'),
    ],
    style: { head: ['cyan'], border: ['gray'] },
  });

  for (const result of results) {
    const chainName = CHAIN_CONFIGS[result.chain]?.name ?? result.chain;
    const typeCol = result.addressType ?? '-';
    const nativeCol = result.error
      ? chalk.red('RPC Error')
      : result.nativeBalance > 0
        ? `${formatAmount(result.nativeBalance)} ${result.nativeSymbol}`
        : chalk.dim(`0 ${result.nativeSymbol}`);

    const tokenSummary = formatTokenSummary(result.tokens);
    const tokensCol = tokenSummary === '-' ? chalk.dim('-') : tokenSummary;

    let totalCol: string;
    if (result.error) {
      totalCol = chalk.red('ERR');
    } else if (result.totalUsd > 0) {
      totalCol = chalk.green(formatUsd(result.totalUsd));
    } else if (hasHoldings(result) && !hasAnyPrice(result)) {
      totalCol = chalk.dim('N/A');
    } else {
      totalCol = chalk.dim('$0.00');
    }

    mainTable.push([
      result.inputLabel,
      chainName,
      result.address,
      typeCol,
      nativeCol,
      tokensCol,
      totalCol,
    ]);
  }

  sections.push(mainTable.toString());

  // Chain summary breakdown
  const byChain = new Map<
    ChainId,
    {
      chainName: string;
      nativeSymbol: string;
      accounts: number;
      nonZero: number;
      errors: number;
      nativeTotal: number;
      totalUsd: number;
    }
  >();

  let grandTotalUsd = 0;

  for (const result of results) {
    grandTotalUsd += result.totalUsd;
    const config = CHAIN_CONFIGS[result.chain];
    const existing = byChain.get(result.chain) ?? {
      chainName: config?.name ?? result.chain,
      nativeSymbol: result.nativeSymbol,
      accounts: 0,
      nonZero: 0,
      errors: 0,
      nativeTotal: 0,
      totalUsd: 0,
    };

    existing.accounts += 1;
    if (hasHoldings(result)) {
      existing.nonZero += 1;
    }
    if (result.error) {
      existing.errors += 1;
    }
    existing.nativeTotal += result.nativeBalance;
    existing.totalUsd += result.totalUsd;
    byChain.set(result.chain, existing);
  }

  const summaryRows = Array.from(byChain.values())
    .filter((entry) => entry.nonZero > 0 || entry.totalUsd > 0)
    .sort((a, b) => b.totalUsd - a.totalUsd || b.nonZero - a.nonZero);

  if (summaryRows.length > 0) {
    const chainTable = new Table({
      head: [
        chalk.bold('Chain Summary'),
        chalk.bold('Active Accounts'),
        chalk.bold('Total Native'),
        chalk.bold('USD Value'),
      ],
      style: { head: ['cyan'], border: ['gray'] },
    });

    for (const row of summaryRows) {
      chainTable.push([
        row.chainName,
        `${row.nonZero}/${row.accounts}`,
        `${formatAmount(row.nativeTotal)} ${row.nativeSymbol}`,
        row.totalUsd > 0 ? chalk.green(formatUsd(row.totalUsd)) : chalk.dim('$0.00'),
      ]);
    }

    sections.push(chainTable.toString());
  }

  sections.push(
    `${chalk.bold('Grand Total USD:')} ${
      grandTotalUsd > 0 ? chalk.bold.green(formatUsd(grandTotalUsd)) : chalk.bold('$0.00')
    }`,
  );

  // Concise RPC error summary
  const errored = results.filter((r) => Boolean(r.error));
  if (errored.length > 0) {
    const lines: string[] = [];
    lines.push(chalk.yellow(`RPC Errors (${errored.length} account${errored.length === 1 ? '' : 's'}):`));

    if (options?.showErrors) {
      for (const item of errored) {
        const clean = sanitizeErrorMessage(item.error ?? 'Unknown error');
        lines.push(`  - [${item.chain}] ${item.address}: ${clean}`);
      }
    } else {
      const grouped = new Map<ChainId, { count: number; sampleError: string }>();
      for (const item of errored) {
        const clean = sanitizeErrorMessage(item.error ?? 'Unknown error');
        const prev = grouped.get(item.chain);
        if (prev) {
          prev.count += 1;
        } else {
          grouped.set(item.chain, { count: 1, sampleError: clean });
        }
      }

      for (const [chain, info] of grouped.entries()) {
        const truncated =
          info.sampleError.length > 90
            ? `${info.sampleError.slice(0, 87)}...`
            : info.sampleError;
        lines.push(`  - ${chain} (${info.count}): ${truncated}`);
      }
      lines.push(chalk.dim('  Run with --show-errors for per-account error details.'));
    }

    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n');
}
