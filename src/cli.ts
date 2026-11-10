#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import chalk from 'chalk';
import Table from 'cli-table3';
import { Command } from 'commander';
import dotenv from 'dotenv';
import { ALL_CHAIN_IDS, CHAIN_CONFIGS, resolveChainRpcs } from './config/chains.js';
import { scanWallets } from './core/scanner.js';
import { deriveAccountsForInput } from './crypto/derive.js';
import { loadInputs } from './input/parser.js';
import { formatCsv } from './output/csv.js';
import { formatJson } from './output/json.js';
import { formatTable } from './output/table.js';
import type { ChainFamily, ChainId, DerivedAccount } from './types.js';

dotenv.config({ quiet: true });

const CHAIN_ALIASES: Record<string, ChainId> = {
  eth: 'ethereum',
  ethereum: 'ethereum',
  arb: 'arbitrum',
  arbitrum: 'arbitrum',
  op: 'optimism',
  optimism: 'optimism',
  base: 'base',
  matic: 'polygon',
  pol: 'polygon',
  polygon: 'polygon',
  bnb: 'bsc',
  bsc: 'bsc',
  avax: 'avalanche',
  avalanche: 'avalanche',
  linea: 'linea',
  scroll: 'scroll',
  blast: 'blast',
  xdai: 'gnosis',
  gnosis: 'gnosis',
  btc: 'bitcoin',
  bitcoin: 'bitcoin',
  ltc: 'litecoin',
  litecoin: 'litecoin',
  doge: 'dogecoin',
  dogecoin: 'dogecoin',
  sol: 'solana',
  solana: 'solana',
  trx: 'tron',
  tron: 'tron',
  ton: 'ton',
  sui: 'sui',
  apt: 'aptos',
  aptos: 'aptos',
  atom: 'cosmos',
  cosmos: 'cosmos',
  osmo: 'osmosis',
  osmosis: 'osmosis',
  tia: 'celestia',
  celestia: 'celestia',
  xrp: 'xrp',
  ripple: 'xrp',
  xlm: 'stellar',
  stellar: 'stellar',
  near: 'near',
};

const ALCHEMY_SUPPORTED_CHAINS = new Set<ChainId>([
  'ethereum',
  'arbitrum',
  'optimism',
  'base',
  'polygon',
  'bsc',
  'avalanche',
  'linea',
  'scroll',
  'blast',
  'gnosis',
  'solana',
]);

function parsePositiveInt(value: string, label: string): number {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1) {
    throw new Error(`Invalid ${label}: "${value}". Expected a positive integer.`);
  }
  return num;
}

function parseChainList(raw: string): ChainId[] {
  const tokens = raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  if (tokens.length === 0) {
    return [];
  }

  const resolved: ChainId[] = [];
  const seen = new Set<ChainId>();

  for (const token of tokens) {
    const mapped = CHAIN_ALIASES[token];
    if (!mapped) {
      throw new Error(
        `Unknown chain "${token}". Run "walletor chains" to see all supported chain IDs.`,
      );
    }
    if (!seen.has(mapped)) {
      seen.add(mapped);
      resolved.push(mapped);
    }
  }

  return resolved;
}

function resolveSelectedChains(chainsArg?: string, excludeArg?: string): ChainId[] {
  let selected: ChainId[] = chainsArg ? parseChainList(chainsArg) : [...ALL_CHAIN_IDS];
  if (selected.length === 0) {
    selected = [...ALL_CHAIN_IDS];
  }

  if (excludeArg) {
    const excluded = new Set(parseChainList(excludeArg));
    selected = selected.filter((c) => !excluded.has(c));
  }

  if (selected.length === 0) {
    throw new Error('No chains remaining after applying --chains and --exclude-chains filters.');
  }

  return selected;
}

function resolveTargetInput(positionalInput?: string, targetFlag?: string): string {
  const candidate = targetFlag ?? positionalInput;
  if (candidate !== undefined && candidate !== '') {
    return candidate;
  }
  if (!process.stdin.isTTY) {
    return '-';
  }
  throw new Error('Missing input. Provide <input>, --target <value>, or "-" for stdin.');
}

function hasCustomRpcOrKey(chainId: ChainId): boolean {
  const envKey = `RPC_URL_${chainId.toUpperCase()}`;
  if (process.env[envKey]?.trim()) {
    return true;
  }
  if (ALCHEMY_SUPPORTED_CHAINS.has(chainId) && process.env.ALCHEMY_API_KEY?.trim()) {
    return true;
  }
  if (chainId === 'solana' && process.env.HELIUS_API_KEY?.trim()) {
    return true;
  }
  if (
    chainId === 'ton' &&
    (process.env.TONAPI_KEY?.trim() || process.env.TONCENTER_API_KEY?.trim())
  ) {
    return true;
  }
  if (chainId === 'tron' && process.env.TRONGRID_API_KEY?.trim()) {
    return true;
  }
  return false;
}

function renderProgressBar(done: number, total: number, currentChain: ChainId): string {
  const width = 20;
  const ratio = total > 0 ? Math.min(1, done / total) : 1;
  const filled = Math.round(ratio * width);
  const bar = `${'='.repeat(filled)}${' '.repeat(width - filled)}`;
  const pct = Math.round(ratio * 100);
  return `Scanning [${bar}] ${done}/${total} (${pct}%) - ${currentChain}`;
}

function writeOutput(text: string, outFile?: string): void {
  if (outFile) {
    writeFileSync(outFile, `${text}\n`, 'utf8');
  } else {
    process.stdout.write(`${text}\n`);
  }
}

interface CheckCommandOptions {
  target?: string;
  chains?: string;
  excludeChains?: string;
  accounts: string;
  nonZero?: boolean;
  tokens: boolean;
  prices: boolean;
  format: string;
  out?: string;
  concurrency: string;
  timeout: string;
  showErrors?: boolean;
}

interface DeriveCommandOptions {
  target?: string;
  chains?: string;
  accounts: string;
  format: string;
}

function formatDeriveTable(accounts: DerivedAccount[]): string {
  if (accounts.length === 0) {
    return chalk.yellow('No accounts derived for the specified chains.');
  }

  const table = new Table({
    head: [
      chalk.bold('Wallet'),
      chalk.bold('Chain'),
      chalk.bold('Address'),
      chalk.bold('Type'),
      chalk.bold('Path'),
    ],
    style: { head: ['cyan'], border: ['gray'] },
  });

  for (const account of accounts) {
    const chainName = CHAIN_CONFIGS[account.chain]?.name ?? account.chain;
    table.push([
      account.inputLabel,
      chainName,
      account.address,
      account.addressType ?? '-',
      account.path ?? '-',
    ]);
  }

  return table.toString();
}

const program = new Command();

program
  .name('walletor')
  .description('Multi-chain CLI wallet inspector for deriving addresses and checking balances')
  .version('1.0.0');

program
  .command('check')
  .description('Inspect native and token balances across supported blockchains')
  .argument('[input]', 'Seed phrase, private key, address, file path, or "-" for stdin')
  .option('-t, --target <value>', 'Target seed, key, address, file path, or "-" for stdin')
  .option('-c, --chains <list>', 'Comma-separated chains to scan (e.g. eth,sol,btc)')
  .option('-x, --exclude-chains <list>', 'Comma-separated chains to exclude')
  .option('-a, --accounts <number>', 'Number of accounts per HD seed to derive', '1')
  .option('-n, --non-zero', 'Only show accounts with non-zero balances', false)
  .option('--no-tokens', 'Skip token balance queries (native coins only)')
  .option('--no-prices', 'Skip USD pricing lookups')
  .option('-f, --format <table|json|csv>', 'Output format (table, json, csv)', 'table')
  .option('-o, --out <file>', 'Write output to a file instead of stdout')
  .option('--concurrency <number>', 'Maximum concurrent RPC requests', '8')
  .option('--timeout <ms>', 'Per-request HTTP timeout in milliseconds', '12000')
  .option('--show-errors', 'Show detailed per-account RPC error messages', false)
  .action(async (inputArg: string | undefined, opts: CheckCommandOptions) => {
    try {
      const target = resolveTargetInput(inputArg, opts.target);
      const format = opts.format.toLowerCase();
      if (format !== 'table' && format !== 'json' && format !== 'csv') {
        throw new Error(`Unsupported format "${opts.format}". Expected table, json, or csv.`);
      }

      const chains = resolveSelectedChains(opts.chains, opts.excludeChains);
      const accounts = parsePositiveInt(opts.accounts, 'accounts');
      const concurrency = parsePositiveInt(opts.concurrency, 'concurrency');
      const timeoutMs = parsePositiveInt(opts.timeout, 'timeout');

      const parsedInputs = await loadInputs(target);
      if (parsedInputs.length === 0) {
        throw new Error('No valid mnemonics, private keys, or addresses found in input.');
      }

      const showProgress =
        Boolean(process.stderr.isTTY) || (format === 'table' && !opts.out) || Boolean(opts.out);

      let lastPrintedPct = -1;
      const results = await scanWallets(
        parsedInputs,
        {
          chains,
          accounts,
          includeTokens: opts.tokens,
          includePrices: opts.prices,
          nonZeroOnly: Boolean(opts.nonZero),
          concurrency,
          timeoutMs,
        },
        (done, total, current) => {
          if (!showProgress) {
            return;
          }
          if (process.stderr.isTTY) {
            process.stderr.write(`\r\x1b[K${renderProgressBar(done, total, current.chain)}`);
          } else {
            const pct = total > 0 ? Math.floor((done / total) * 100) : 100;
            if (done === total || pct - lastPrintedPct >= 20) {
              lastPrintedPct = pct;
              process.stderr.write(`${renderProgressBar(done, total, current.chain)}\n`);
            }
          }
        },
      );

      if (showProgress && process.stderr.isTTY) {
        process.stderr.write('\r\x1b[K');
      }

      let formatted: string;
      if (format === 'json') {
        formatted = formatJson(results);
      } else if (format === 'csv') {
        formatted = formatCsv(results);
      } else {
        formatted = formatTable(results, { showErrors: Boolean(opts.showErrors) });
      }

      writeOutput(formatted, opts.out);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`${chalk.red('Error:')} ${msg}\n`);
      process.exitCode = 1;
    }
  });

program
  .command('derive')
  .description('Offline address derivation preview (zero network calls)')
  .argument('[input]', 'Seed phrase, private key, address, file path, or "-" for stdin')
  .option('-t, --target <value>', 'Target seed, key, address, file path, or "-" for stdin')
  .option('-c, --chains <list>', 'Comma-separated chains to derive')
  .option('-a, --accounts <number>', 'Number of accounts per HD seed to derive', '1')
  .option('-f, --format <table|json>', 'Output format (table, json)', 'table')
  .action(async (inputArg: string | undefined, opts: DeriveCommandOptions) => {
    try {
      const target = resolveTargetInput(inputArg, opts.target);
      const format = opts.format.toLowerCase();
      if (format !== 'table' && format !== 'json') {
        throw new Error(`Unsupported format "${opts.format}". Expected table or json.`);
      }

      const chains = resolveSelectedChains(opts.chains);
      const accountsCount = parsePositiveInt(opts.accounts, 'accounts');

      const parsedInputs = await loadInputs(target);
      if (parsedInputs.length === 0) {
        throw new Error('No valid mnemonics, private keys, or addresses found in input.');
      }

      const derivedGroups = await Promise.all(
        parsedInputs.map((input) => deriveAccountsForInput(input, chains, accountsCount)),
      );
      const derivedAccounts = derivedGroups.flat();

      const output =
        format === 'json'
          ? JSON.stringify({ count: derivedAccounts.length, accounts: derivedAccounts }, null, 2)
          : formatDeriveTable(derivedAccounts);

      writeOutput(output);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`${chalk.red('Error:')} ${msg}\n`);
      process.exitCode = 1;
    }
  });

program
  .command('chains')
  .description('List all supported chains, families, native assets, and active RPC counts')
  .action(() => {
    const familyOrder: ChainFamily[] = [
      'evm',
      'utxo',
      'solana',
      'tron',
      'ton',
      'sui',
      'aptos',
      'cosmos',
      'xrp',
      'stellar',
      'near',
    ];

    const table = new Table({
      head: [
        chalk.bold('Family'),
        chalk.bold('Chain ID'),
        chalk.bold('Name'),
        chalk.bold('Native'),
        chalk.bold('Active RPCs'),
      ],
      style: { head: ['cyan'], border: ['gray'] },
    });

    for (const family of familyOrder) {
      const chainsInFamily = ALL_CHAIN_IDS.filter(
        (id) => CHAIN_CONFIGS[id].family === family,
      );
      for (const chainId of chainsInFamily) {
        const cfg = CHAIN_CONFIGS[chainId];
        const rpcs = resolveChainRpcs(chainId);
        const overrideTag = hasCustomRpcOrKey(chainId) ? chalk.green(' (custom/key)') : '';
        table.push([
          family.toUpperCase(),
          chainId,
          cfg.name,
          cfg.nativeSymbol,
          `${rpcs.length}${overrideTag}`,
        ]);
      }
    }

    process.stdout.write(`${table.toString()}\n`);
    process.stdout.write(
      `${chalk.bold('Total Supported Chains:')} ${ALL_CHAIN_IDS.length}\n`,
    );
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${chalk.red('Error:')} ${msg}\n`);
  process.exit(1);
});
