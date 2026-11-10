import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatCsv } from '../src/output/csv.js';
import { formatJson, type WalletorJsonOutput } from '../src/output/json.js';
import { formatTable } from '../src/output/table.js';
import { enrichWithPrices } from '../src/pricing/prices.js';
import type { AccountBalanceResult } from '../src/types.js';

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('enrichWithPrices', () => {
  it('computes nativeValueUsd, token valueUsd, and totalUsd using DefiLlama + CoinGecko fallback', async () => {
    const usdcContract = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('https://coins.llama.fi/prices/current/')) {
          return new Response(
            JSON.stringify({
              coins: {
                'coingecko:ethereum': { price: 3000 },
                [`ethereum:${usdcContract}`]: { price: 1 },
                // Deliberately omit coingecko:solana so CoinGecko fallback is exercised
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url.startsWith('https://api.coingecko.com/api/v3/simple/price')) {
          return new Response(
            JSON.stringify({
              solana: { usd: 150 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('{}', { status: 404 });
      }),
    );

    const input: AccountBalanceResult[] = [
      {
        inputId: 'input-1',
        inputLabel: 'seed#1 (12w)',
        chain: 'ethereum',
        family: 'evm',
        address: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
        nativeBalance: 2,
        nativeSymbol: 'ETH',
        nativeRaw: '2000000000000000000',
        tokens: [
          {
            symbol: 'USDC',
            contractAddress: usdcContract,
            decimals: 6,
            rawBalance: '500000000',
            balance: 500,
          },
        ],
        totalUsd: 0,
      },
      {
        inputId: 'input-1',
        inputLabel: 'seed#1 (12w)',
        chain: 'solana',
        family: 'solana',
        address: '11111111111111111111111111111111',
        nativeBalance: 4,
        nativeSymbol: 'SOL',
        nativeRaw: '4000000000',
        tokens: [],
        totalUsd: 0,
      },
    ];

    const enriched = await enrichWithPrices(input, 2000);
    expect(enriched).toHaveLength(2);

    expect(enriched[0].nativePriceUsd).toBe(3000);
    expect(enriched[0].nativeValueUsd).toBe(6000);
    expect(enriched[0].tokens[0].priceUsd).toBe(1);
    expect(enriched[0].tokens[0].valueUsd).toBe(500);
    expect(enriched[0].totalUsd).toBe(6500);

    expect(enriched[1].nativePriceUsd).toBe(150);
    expect(enriched[1].nativeValueUsd).toBe(600);
    expect(enriched[1].totalUsd).toBe(600);
  });
});

describe('output formatters', () => {
  const sampleResults: AccountBalanceResult[] = [
    {
      inputId: 'input-1',
      inputLabel: 'seed#1 (12w)',
      chain: 'ethereum',
      family: 'evm',
      address: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
      path: "m/44'/60'/0'/0/0",
      nativeBalance: 1.5,
      nativeSymbol: 'ETH',
      nativeRaw: '1500000000000000000',
      nativePriceUsd: 3000,
      nativeValueUsd: 4500,
      tokens: [
        {
          symbol: 'USDC',
          contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          decimals: 6,
          rawBalance: '250000000',
          balance: 250,
          priceUsd: 1,
          valueUsd: 250,
        },
      ],
      totalUsd: 4750,
    },
    {
      inputId: 'input-2',
      inputLabel: 'key#2 (hex)',
      chain: 'solana',
      family: 'solana',
      address: '11111111111111111111111111111111',
      nativeBalance: 0,
      nativeSymbol: 'SOL',
      nativeRaw: '0',
      tokens: [],
      totalUsd: 0,
      error: 'Request failed https://eth-mainnet.g.alchemy.com/v2/SUPER_SECRET_KEY?api-key=MYSECRET',
    },
  ];

  it('formatJson aggregates summaries and sanitizes error messages', () => {
    const parsed = JSON.parse(formatJson(sampleResults)) as WalletorJsonOutput;

    expect(parsed.totalUsd).toBe(4750);
    expect(parsed.accountsCount).toBe(2);
    expect(parsed.nonZeroCount).toBe(1);
    expect(parsed.byChain.ethereum).toMatchObject({
      accountsCount: 1,
      nonZeroCount: 1,
      errorCount: 0,
      nativeSymbol: 'ETH',
      nativeBalance: 1.5,
      totalUsd: 4750,
    });
    expect(parsed.byChain.solana?.errorCount).toBe(1);
    expect(parsed.results[1].error).not.toContain('SUPER_SECRET_KEY');
    expect(parsed.results[1].error).not.toContain('MYSECRET');
    expect(parsed.results[1].error).toContain('***');
  });

  it('formatCsv escapes RFC-4180 special characters (quotes, commas, newlines) and sanitizes errors', () => {
    const tricky: AccountBalanceResult[] = [
      {
        inputId: 'input-1',
        inputLabel: 'wallet, "main"',
        chain: 'ethereum',
        family: 'evm',
        address: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
        nativeBalance: 1,
        nativeSymbol: 'ETH',
        nativeRaw: '1000000000000000000',
        nativePriceUsd: 2000,
        nativeValueUsd: 2000,
        tokens: [],
        totalUsd: 2000,
        error: 'failed, "timeout"\n?apikey=SECRET123',
      },
    ];

    const csv = formatCsv(tricky);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      'wallet,chain,family,address,address_type,path,asset_type,symbol,contract,balance,price_usd,value_usd,error',
    );
    expect(lines[1]).toContain('"wallet, ""main"""');
    expect(lines[1]).toContain('"failed, ""timeout"" ?apikey=***"');
    expect(csv).not.toContain('SECRET123');
  });

  it('formatTable includes chain totals, grand total, and never leaks secrets', () => {
    const rawMnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const rendered = stripAnsi(formatTable(sampleResults, { showErrors: true }));

    expect(rendered).toContain('Ethereum');
    expect(rendered).toContain('Chain Summary');
    expect(rendered).toContain('1.50 ETH');
    expect(rendered).toContain('Grand Total USD: $4,750.00');
    expect(rendered).not.toContain(rawMnemonic);
    expect(rendered).not.toContain('SUPER_SECRET_KEY');
    expect(rendered).not.toContain('MYSECRET');
  });
});
