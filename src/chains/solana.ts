import { CHAIN_CONFIGS, resolveChainRpcs } from '../config/chains.js';
import { postJsonRpc } from '../core/http.js';
import type { AccountBalanceResult, DerivedAccount, TokenBalance } from '../types.js';
import {
  type BalanceFetchOptions,
  buildBaseResult,
  buildErrorResult,
  formatUnitsBigInt,
} from './utils.js';

const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

interface KnownSplTokenMeta {
  symbol: string;
  name: string;
}

const KNOWN_SPL_TOKENS: Record<string, KnownSplTokenMeta> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: 'USDC', name: 'USD Coin' },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: 'USDT', name: 'Tether USD' },
  So11111111111111111111111111111111111111112: { symbol: 'WSOL', name: 'Wrapped SOL' },
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: { symbol: 'JUP', name: 'Jupiter' },
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: { symbol: 'BONK', name: 'Bonk' },
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': { symbol: 'RAY', name: 'Raydium' },
  HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3: { symbol: 'PYTH', name: 'Pyth Network' },
  EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm: { symbol: 'WIF', name: 'dogwifhat' },
  jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL: { symbol: 'JTO', name: 'Jito' },
  orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE: { symbol: 'ORCA', name: 'Orca' },
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: { symbol: 'mSOL', name: 'Marinade staked SOL' },
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: { symbol: 'JitoSOL', name: 'Jito Staked SOL' },
  bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1: { symbol: 'bSOL', name: 'BlazeStake Staked SOL' },
  '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo': { symbol: 'PYUSD', name: 'PayPal USD' },
  rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof: { symbol: 'RENDER', name: 'Render Token' },
};

interface SolanaBalanceResult {
  value: number | string;
}

interface SolanaTokenAccountEntry {
  account?: {
    data?: {
      parsed?: {
        info?: {
          mint?: string;
          tokenAmount?: {
            amount?: string;
            decimals?: number;
            uiAmount?: number | null;
          };
        };
      };
    };
  };
}

interface SolanaTokenAccountsResult {
  value?: SolanaTokenAccountEntry[];
}

function formatFallbackMintSymbol(mint: string): string {
  return `SPL:${mint.slice(0, 4)}..${mint.slice(-4)}`;
}

export async function fetchSolanaBalance(
  account: DerivedAccount,
  options: BalanceFetchOptions,
): Promise<AccountBalanceResult> {
  try {
    const rpcs = resolveChainRpcs('solana');
    if (rpcs.length === 0) {
      throw new Error('No RPC endpoints configured for solana');
    }

    const config = CHAIN_CONFIGS.solana;
    const nativeRes = await postJsonRpc<SolanaBalanceResult>(
      rpcs,
      'getBalance',
      [account.address, { commitment: 'confirmed' }],
      undefined,
      options.timeoutMs,
    );

    const nativeLamports = BigInt(nativeRes.value ?? 0);
    const tokens: TokenBalance[] = [];

    if (options.includeTokens) {
      const [splResult, token2022Result] = await Promise.allSettled([
        postJsonRpc<SolanaTokenAccountsResult>(
          rpcs,
          'getTokenAccountsByOwner',
          [account.address, { programId: SPL_TOKEN_PROGRAM_ID }, { encoding: 'jsonParsed' }],
          undefined,
          options.timeoutMs,
        ),
        postJsonRpc<SolanaTokenAccountsResult>(
          rpcs,
          'getTokenAccountsByOwner',
          [account.address, { programId: TOKEN_2022_PROGRAM_ID }, { encoding: 'jsonParsed' }],
          undefined,
          options.timeoutMs,
        ),
      ]);

      const aggregated = new Map<string, { raw: bigint; decimals: number }>();

      for (const settled of [splResult, token2022Result]) {
        if (settled.status !== 'fulfilled') {
          continue;
        }
        const entries = settled.value.value ?? [];
        for (const entry of entries) {
          const info = entry.account?.data?.parsed?.info;
          const mint = info?.mint;
          const amountStr = info?.tokenAmount?.amount;
          const decimals = info?.tokenAmount?.decimals;

          if (!mint || !amountStr || amountStr === '0' || typeof decimals !== 'number') {
            continue;
          }

          let rawAmount: bigint;
          try {
            rawAmount = BigInt(amountStr);
          } catch {
            continue;
          }

          if (rawAmount <= 0n) {
            continue;
          }

          const existing = aggregated.get(mint);
          if (existing) {
            existing.raw += rawAmount;
          } else {
            aggregated.set(mint, { raw: rawAmount, decimals });
          }
        }
      }

      for (const [mint, { raw, decimals }] of aggregated.entries()) {
        const known = KNOWN_SPL_TOKENS[mint];
        tokens.push({
          symbol: known?.symbol ?? formatFallbackMintSymbol(mint),
          ...(known?.name ? { name: known.name } : {}),
          contractAddress: mint,
          decimals,
          rawBalance: raw.toString(),
          balance: formatUnitsBigInt(raw, decimals),
        });
      }
    }

    const base = buildBaseResult(account);
    return {
      ...base,
      nativeRaw: nativeLamports.toString(),
      nativeBalance: formatUnitsBigInt(nativeLamports, config.nativeDecimals),
      tokens,
    };
  } catch (err) {
    return buildErrorResult(account, err);
  }
}
