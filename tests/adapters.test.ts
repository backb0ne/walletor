import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAptosBalance } from '../src/chains/aptos.js';
import { fetchCosmosBalance } from '../src/chains/cosmos.js';
import { fetchNearBalance } from '../src/chains/near.js';
import { fetchSolanaBalance } from '../src/chains/solana.js';
import { fetchStellarBalance } from '../src/chains/stellar.js';
import { fetchSuiBalance } from '../src/chains/sui.js';
import { fetchTonBalance } from '../src/chains/ton.js';
import { fetchTronBalance } from '../src/chains/tron.js';
import { fetchUtxoBalance } from '../src/chains/utxo.js';
import { fetchXrpBalance } from '../src/chains/xrp.js';
import { fetchJsonWithRetry } from '../src/core/http.js';
import type { ChainFamily, ChainId, DerivedAccount } from '../src/types.js';

function makeAccount(
  chain: ChainId,
  family: ChainFamily,
  address: string,
): DerivedAccount {
  return {
    inputId: 'input-1',
    inputLabel: 'test-wallet',
    chain,
    family,
    address,
    accountIndex: 0,
  };
}

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.RPC_URL_LITECOIN;
  delete process.env.TONAPI_KEY;
  delete process.env.TONCENTER_API_KEY;
  delete process.env.TRONGRID_API_KEY;
});

describe('fetchJsonWithRetry', () => {
  it('retries on 429 and falls back to second endpoint on 500', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (calls.length === 1) {
        return jsonResponse({ error: 'rate limited' }, 429, { 'Retry-After': '0' });
      }
      if (calls.length === 2) {
        return jsonResponse({ error: 'internal error' }, 500);
      }
      return jsonResponse({ ok: true, endpoint: url }, 200);
    });
    vi.stubGlobal('fetch', fetchMock);

    const data = await fetchJsonWithRetry<{ ok: boolean; endpoint: string }>(
      ['https://rpc1.example.com', 'https://rpc2.example.com'],
      undefined,
      { maxRetries: 2, timeoutMs: 2000 },
    );

    expect(data).toEqual({ ok: true, endpoint: 'https://rpc1.example.com' });
    expect(calls).toEqual([
      'https://rpc1.example.com',
      'https://rpc2.example.com',
      'https://rpc1.example.com',
    ]);
  });

  it('falls back from first endpoint 500 directly to second endpoint', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith('https://primary.example.com')) {
        return jsonResponse({ error: 'server error' }, 500);
      }
      return jsonResponse({ value: 42 }, 200);
    });
    vi.stubGlobal('fetch', fetchMock);

    const data = await fetchJsonWithRetry<{ value: number }>(
      ['https://primary.example.com', 'https://fallback.example.com'],
      undefined,
      { maxRetries: 1, timeoutMs: 2000 },
    );

    expect(data).toEqual({ value: 42 });
    expect(calls).toEqual([
      'https://primary.example.com',
      'https://fallback.example.com',
    ]);
  });
});

describe('chain adapters', () => {
  it('UTXO adapter parses bitcoin Esplora response, litecoin Blockbook response, and treats 404 as 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('mempool.space')) {
          return jsonResponse({
            chain_stats: { funded_txo_sum: 150_000_000, spent_txo_sum: 25_000_000 },
            mempool_stats: { funded_txo_sum: 10_000_000, spent_txo_sum: 0 },
          });
        }
        return jsonResponse({ error: 'unexpected' }, 500);
      }),
    );

    const btcRes = await fetchUtxoBalance(
      makeAccount('bitcoin', 'utxo', 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu'),
      { includeTokens: true, timeoutMs: 2000 },
    );
    expect(btcRes.error).toBeUndefined();
    expect(btcRes.nativeRaw).toBe('135000000');
    expect(btcRes.nativeBalance).toBe(1.35);

    // Litecoin Blockbook via trezor.io /api/v2
    process.env.RPC_URL_LITECOIN = 'https://ltc1.trezor.io/api/v2';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('ltc1.trezor.io/api/v2/address/L_FOUND')) {
          return jsonResponse({ balance: '200000000', unconfirmedBalance: '50000000' });
        }
        if (url.includes('ltc1.trezor.io/api/v2/address/L_MISSING')) {
          return jsonResponse({ error: 'not found' }, 404);
        }
        return jsonResponse({}, 404);
      }),
    );

    const ltcFound = await fetchUtxoBalance(makeAccount('litecoin', 'utxo', 'L_FOUND'), {
      includeTokens: false,
      timeoutMs: 2000,
    });
    expect(ltcFound.error).toBeUndefined();
    expect(ltcFound.nativeRaw).toBe('250000000');
    expect(ltcFound.nativeBalance).toBe(2.5);

    const ltcNotFound = await fetchUtxoBalance(makeAccount('litecoin', 'utxo', 'L_MISSING'), {
      includeTokens: false,
      timeoutMs: 2000,
    });
    expect(ltcNotFound.error).toBeUndefined();
    expect(ltcNotFound.nativeRaw).toBe('0');
    expect(ltcNotFound.nativeBalance).toBe(0);
  });

  it('Solana adapter decodes getBalance + SPL & Token-2022 getTokenAccountsByOwner', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          method?: string;
          params?: unknown[];
        };
        if (body.method === 'getBalance') {
          return jsonResponse({ jsonrpc: '2.0', id: 1, result: { value: 2_500_000_000 } });
        }
        if (body.method === 'getTokenAccountsByOwner') {
          const filter = body.params?.[1] as { programId?: string };
          if (filter?.programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
            return jsonResponse({
              jsonrpc: '2.0',
              id: 1,
              result: {
                value: [
                  {
                    account: {
                      data: {
                        parsed: {
                          info: {
                            mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                            tokenAmount: { amount: '12500000', decimals: 6 },
                          },
                        },
                      },
                    },
                  },
                ],
              },
            });
          }
          if (filter?.programId === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') {
            return jsonResponse({
              jsonrpc: '2.0',
              id: 1,
              result: {
                value: [
                  {
                    account: {
                      data: {
                        parsed: {
                          info: {
                            mint: '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo',
                            tokenAmount: { amount: '5000000', decimals: 6 },
                          },
                        },
                      },
                    },
                  },
                ],
              },
            });
          }
        }
        return jsonResponse({}, 400);
      }),
    );

    const res = await fetchSolanaBalance(
      makeAccount('solana', 'solana', '11111111111111111111111111111111'),
      { includeTokens: true, timeoutMs: 2000 },
    );

    expect(res.error).toBeUndefined();
    expect(res.nativeRaw).toBe('2500000000');
    expect(res.nativeBalance).toBe(2.5);
    expect(res.tokens).toHaveLength(2);
    expect(res.tokens.find((t) => t.symbol === 'USDC')?.balance).toBe(12.5);
    expect(res.tokens.find((t) => t.symbol === 'PYUSD')?.balance).toBe(5);
  });

  it('Tron adapter decodes /v1/accounts native TRX and TRC-20 triggersmartcontract balanceOf', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/v1/accounts/')) {
          return jsonResponse({ data: [{ balance: 12_345_678 }], success: true });
        }
        if (url.includes('/wallet/triggersmartcontract')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as { contract_address?: string };
          if (body.contract_address === 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t') {
            // 100.5 USDT = 100_500_000
            return jsonResponse({
              result: { result: true },
              constant_result: [(100_500_000).toString(16).padStart(64, '0')],
            });
          }
          return jsonResponse({
            result: { result: true },
            constant_result: ['0000000000000000000000000000000000000000000000000000000000000000'],
          });
        }
        return jsonResponse({}, 404);
      }),
    );

    const res = await fetchTronBalance(
      makeAccount('tron', 'tron', 'TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH'),
      { includeTokens: true, timeoutMs: 2000 },
    );

    expect(res.error).toBeUndefined();
    expect(res.nativeRaw).toBe('12345678');
    expect(res.nativeBalance).toBe(12.345678);
    expect(res.tokens).toHaveLength(1);
    expect(res.tokens[0]).toMatchObject({
      symbol: 'USDT',
      rawBalance: '100500000',
      balance: 100.5,
    });
  });

  it('TON adapter handles TonAPI /accounts + /jettons, 404 -> 0, and Toncenter fallback', async () => {
    // 1. TonAPI success with jettons
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/jettons')) {
          return jsonResponse({
            balances: [
              {
                balance: '42000000',
                jetton: {
                  address: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs',
                  symbol: 'USDT',
                  name: 'Tether USD',
                  decimals: 6,
                },
              },
            ],
          });
        }
        if (url.includes('tonapi.io/v2/accounts/')) {
          return jsonResponse({ balance: '3500000000' });
        }
        return jsonResponse({}, 500);
      }),
    );

    const tonRes = await fetchTonBalance(
      makeAccount('ton', 'ton', 'UQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p9CU'),
      { includeTokens: true, timeoutMs: 2000 },
    );
    expect(tonRes.error).toBeUndefined();
    expect(tonRes.nativeRaw).toBe('3500000000');
    expect(tonRes.nativeBalance).toBe(3.5);
    expect(tonRes.tokens).toHaveLength(1);
    expect(tonRes.tokens[0]).toMatchObject({ symbol: 'USDT', balance: 42 });

    // 2. TonAPI 404 -> 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('tonapi.io/v2/accounts/')) {
          return jsonResponse({ error: 'not found' }, 404);
        }
        return jsonResponse({}, 500);
      }),
    );
    const ton404 = await fetchTonBalance(
      makeAccount('ton', 'ton', 'UQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p9CU'),
      { includeTokens: true, timeoutMs: 2000 },
    );
    expect(ton404.error).toBeUndefined();
    expect(ton404.nativeBalance).toBe(0);
    expect(ton404.tokens).toEqual([]);

    // 3. TonAPI 500 -> Toncenter fallback
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('tonapi.io')) {
          return jsonResponse({ error: 'tonapi down' }, 500);
        }
        if (url.includes('toncenter.com/api/v2/jsonRPC')) {
          return jsonResponse({ jsonrpc: '2.0', id: 1, result: '7000000000' });
        }
        return jsonResponse({}, 500);
      }),
    );
    const tonFallback = await fetchTonBalance(
      makeAccount('ton', 'ton', 'UQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p9CU'),
      { includeTokens: true, timeoutMs: 2000 },
    );
    expect(tonFallback.error).toBeUndefined();
    expect(tonFallback.nativeRaw).toBe('7000000000');
    expect(tonFallback.nativeBalance).toBe(7);
  });

  it('Sui adapter parses suix_getAllBalances and suix_getCoinMetadata', async () => {
    const customCoinType = '0xdeadbeef::usdc_test::USDC_TEST';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          method?: string;
          params?: unknown[];
        };
        if (body.method === 'suix_getAllBalances') {
          return jsonResponse({
            jsonrpc: '2.0',
            id: 1,
            result: [
              { coinType: '0x2::sui::SUI', totalBalance: '4500000000' },
              { coinType: customCoinType, totalBalance: '25000000' },
            ],
          });
        }
        if (body.method === 'suix_getCoinMetadata') {
          return jsonResponse({
            jsonrpc: '2.0',
            id: 1,
            result: { decimals: 6, symbol: 'USDC', name: 'USD Coin' },
          });
        }
        return jsonResponse({}, 400);
      }),
    );

    const res = await fetchSuiBalance(
      makeAccount('sui', 'sui', `0x${'11'.repeat(32)}`),
      { includeTokens: true, timeoutMs: 2000 },
    );
    expect(res.error).toBeUndefined();
    expect(res.nativeRaw).toBe('4500000000');
    expect(res.nativeBalance).toBe(4.5);
    expect(res.tokens).toHaveLength(1);
    expect(res.tokens[0]).toMatchObject({
      symbol: 'USDC',
      decimals: 6,
      rawBalance: '25000000',
      balance: 25,
    });
  });

  it('Aptos adapter parses /accounts/{addr}/resources and treats 404 as 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('ADDR_404')) {
          return jsonResponse({ message: 'Account not found' }, 404);
        }
        return jsonResponse([
          {
            type: '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>',
            data: { coin: { value: '320000000' } },
          },
          {
            type: '0x1::coin::CoinStore<0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDC>',
            data: { coin: { value: '15500000' } },
          },
        ]);
      }),
    );

    const res = await fetchAptosBalance(
      makeAccount('aptos', 'aptos', `0x${'22'.repeat(32)}`),
      { includeTokens: true, timeoutMs: 2000 },
    );
    expect(res.error).toBeUndefined();
    expect(res.nativeRaw).toBe('320000000');
    expect(res.nativeBalance).toBe(3.2);
    expect(res.tokens).toHaveLength(1);
    expect(res.tokens[0]).toMatchObject({ symbol: 'USDC', balance: 15.5 });

    const res404 = await fetchAptosBalance(makeAccount('aptos', 'aptos', 'ADDR_404'), {
      includeTokens: true,
      timeoutMs: 2000,
    });
    expect(res404.error).toBeUndefined();
    expect(res404.nativeBalance).toBe(0);
    expect(res404.tokens).toEqual([]);
  });

  it('Cosmos adapter parses /cosmos/bank/v1beta1/balances/{addr}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          balances: [
            { denom: 'uatom', amount: '12345678' },
            {
              denom: 'ibc/498A0751C798A0D9A389AA3691123DADA57DAA4FE165D5C75894505B876BA6E4',
              amount: '50000000',
            },
          ],
        }),
      ),
    );

    const res = await fetchCosmosBalance(
      makeAccount('cosmos', 'cosmos', 'cosmos1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqnrql8a'),
      { includeTokens: true, timeoutMs: 2000 },
    );
    expect(res.error).toBeUndefined();
    expect(res.nativeRaw).toBe('12345678');
    expect(res.nativeBalance).toBe(12.345678);
    expect(res.tokens).toHaveLength(1);
    expect(res.tokens[0]).toMatchObject({ symbol: 'USDC', balance: 50 });
  });

  it('XRP adapter handles account_info, actNotFound, and account_lines with 40-char hex currency codes', async () => {
    const rlusdHex = '524C555344000000000000000000000000000000'; // "RLUSD" padded to 20 bytes

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          method?: string;
          params?: Array<{ account?: string }>;
        };
        const accountAddr = body.params?.[0]?.account;

        if (accountAddr === 'rMISSING') {
          return jsonResponse({ jsonrpc: '2.0', id: 1, result: { error: 'actNotFound' } });
        }
        if (body.method === 'account_info') {
          return jsonResponse({
            jsonrpc: '2.0',
            id: 1,
            result: { account_data: { Balance: '25500000' } },
          });
        }
        if (body.method === 'account_lines') {
          return jsonResponse({
            jsonrpc: '2.0',
            id: 1,
            result: {
              lines: [
                { account: 'rIssuer1', balance: '100.25', currency: rlusdHex },
                { account: 'rIssuer2', balance: '5', currency: 'USD' },
              ],
            },
          });
        }
        return jsonResponse({}, 400);
      }),
    );

    const res = await fetchXrpBalance(
      makeAccount('xrp', 'xrp', 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'),
      { includeTokens: true, timeoutMs: 2000 },
    );
    expect(res.error).toBeUndefined();
    expect(res.nativeRaw).toBe('25500000');
    expect(res.nativeBalance).toBe(25.5);
    expect(res.tokens).toHaveLength(2);
    expect(res.tokens[0]).toMatchObject({ symbol: 'RLUSD', balance: 100.25 });
    expect(res.tokens[1]).toMatchObject({ symbol: 'USD', balance: 5 });

    const notFound = await fetchXrpBalance(makeAccount('xrp', 'xrp', 'rMISSING'), {
      includeTokens: true,
      timeoutMs: 2000,
    });
    expect(notFound.error).toBeUndefined();
    expect(notFound.nativeBalance).toBe(0);
    expect(notFound.tokens).toEqual([]);
  });

  it('Stellar adapter parses Horizon /accounts/{addr} and treats 404 as 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('GMISSING')) {
          return jsonResponse({ status: 404 }, 404);
        }
        return jsonResponse({
          balances: [
            { asset_type: 'native', balance: '150.1234567' },
            {
              asset_type: 'credit_alphanum4',
              asset_code: 'USDC',
              asset_issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
              balance: '42.5000000',
            },
          ],
        });
      }),
    );

    const res = await fetchStellarBalance(
      makeAccount('stellar', 'stellar', 'GFOUND'),
      { includeTokens: true, timeoutMs: 2000 },
    );
    expect(res.error).toBeUndefined();
    expect(res.nativeRaw).toBe('1501234567');
    expect(res.nativeBalance).toBe(150.1234567);
    expect(res.tokens).toHaveLength(1);
    expect(res.tokens[0]).toMatchObject({ symbol: 'USDC', balance: 42.5 });

    const notFound = await fetchStellarBalance(
      makeAccount('stellar', 'stellar', 'GMISSING'),
      { includeTokens: true, timeoutMs: 2000 },
    );
    expect(notFound.error).toBeUndefined();
    expect(notFound.nativeBalance).toBe(0);
    expect(notFound.tokens).toEqual([]);
  });

  it('NEAR adapter parses view_account and treats UNKNOWN_ACCOUNT as 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          params?: { account_id?: string };
        };
        if (body.params?.account_id === 'missing.near') {
          return jsonResponse({
            jsonrpc: '2.0',
            id: 1,
            error: {
              code: -32000,
              message: 'Server error',
              cause: { name: 'UNKNOWN_ACCOUNT' },
            },
          });
        }
        return jsonResponse({
          jsonrpc: '2.0',
          id: 1,
          result: { amount: '5500000000000000000000000' }, // 5.5 NEAR
        });
      }),
    );

    const res = await fetchNearBalance(makeAccount('near', 'near', 'alice.near'), {
      includeTokens: true,
      timeoutMs: 2000,
    });
    expect(res.error).toBeUndefined();
    expect(res.nativeRaw).toBe('5500000000000000000000000');
    expect(res.nativeBalance).toBe(5.5);

    const unknown = await fetchNearBalance(makeAccount('near', 'near', 'missing.near'), {
      includeTokens: true,
      timeoutMs: 2000,
    });
    expect(unknown.error).toBeUndefined();
    expect(unknown.nativeRaw).toBe('0');
    expect(unknown.nativeBalance).toBe(0);
  });
});
