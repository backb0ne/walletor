import { CHAIN_CONFIGS, resolveChainRpcs } from '../config/chains.js';
import { fetchJsonWithRetry, HttpError } from '../core/http.js';
import type { AccountBalanceResult, DerivedAccount, TokenBalance } from '../types.js';
import {
  type BalanceFetchOptions,
  buildBaseResult,
  buildErrorResult,
  formatUnitsBigInt,
} from './utils.js';

interface AptosResource {
  type: string;
  data?: {
    coin?: {
      value?: string;
    };
  };
}

interface KnownAptosCoin {
  symbol: string;
  name: string;
  decimals: number;
}

const KNOWN_APTOS_COINS: Record<string, KnownAptosCoin> = {
  '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDC': {
    symbol: 'USDC',
    name: 'USD Coin (LayerZero)',
    decimals: 6,
  },
  '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDT': {
    symbol: 'USDT',
    name: 'Tether USD (LayerZero)',
    decimals: 6,
  },
  '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::WETH': {
    symbol: 'WETH',
    name: 'Wrapped Ether (LayerZero)',
    decimals: 6,
  },
  '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::WBTC': {
    symbol: 'WBTC',
    name: 'Wrapped BTC (LayerZero)',
    decimals: 6,
  },
  '0x5e156f1207d0ebfa19a9eeff00d62a282278fb8719f4fab3a586a0a2c0fffbea::coin::T': {
    symbol: 'USDC',
    name: 'USD Coin (Wormhole)',
    decimals: 6,
  },
  '0xa2eda21a58856fda86451436513b867c97eecb4ba099da5775520e0f7492e852::coin::T': {
    symbol: 'USDT',
    name: 'Tether USD (Wormhole)',
    decimals: 6,
  },
  '0x111ae3e5bc816a5e63c2da97d0aa3886519e0cd5e4b046659fa35796bd11542a::stapt_token::StakedApt': {
    symbol: 'stAPT',
    name: 'Amnis Staked Aptos',
    decimals: 8,
  },
  '0x111ae3e5bc816a5e63c2da97d0aa3886519e0cd5e4b046659fa35796bd11542a::amapt_token::AmnisApt': {
    symbol: 'amAPT',
    name: 'Amnis Aptos Coin',
    decimals: 8,
  },
  '0x6f986d146e4a90b828d8c12c14b6f4e003fdff11a8eecceceb63744363eaac01::mod_coin::MOD': {
    symbol: 'MOD',
    name: 'Move Dollar',
    decimals: 8,
  },
};

function isNativeAptosCoin(coinType: string): boolean {
  const lower = coinType.toLowerCase();
  return (
    lower === '0x1::aptos_coin::aptoscoin' ||
    lower === '0x0000000000000000000000000000000000000000000000000000000000000001::aptos_coin::aptoscoin'
  );
}

function fallbackSymbol(coinType: string): string {
  const parts = coinType.split('::');
  const last = parts[parts.length - 1];
  return last || coinType.slice(0, 12);
}

export async function fetchAptosBalance(
  account: DerivedAccount,
  options: BalanceFetchOptions,
): Promise<AccountBalanceResult> {
  try {
    const rpcs = resolveChainRpcs('aptos');
    if (rpcs.length === 0) {
      throw new Error('No RPC endpoints configured for aptos');
    }

    const config = CHAIN_CONFIGS.aptos;
    const urls = rpcs.map(
      (u) => `${u.replace(/\/+$/, '')}/accounts/${encodeURIComponent(account.address)}/resources`,
    );

    let resources: AptosResource[] = [];
    try {
      resources = await fetchJsonWithRetry<AptosResource[]>(urls, undefined, {
        timeoutMs: options.timeoutMs,
      });
    } catch (err) {
      if (err instanceof HttpError && err.statusCode === 404) {
        return buildBaseResult(account);
      }
      throw err;
    }

    let nativeOctas = 0n;
    const tokens: TokenBalance[] = [];

    for (const res of resources) {
      if (
        !res.type ||
        !res.type.startsWith('0x1::coin::CoinStore<') ||
        !res.type.endsWith('>')
      ) {
        continue;
      }

      const coinType = res.type.slice('0x1::coin::CoinStore<'.length, -1);
      const rawStr = res.data?.coin?.value ?? '0';
      let raw: bigint;
      try {
        raw = BigInt(rawStr);
      } catch {
        continue;
      }

      if (raw <= 0n) {
        continue;
      }

      if (isNativeAptosCoin(coinType)) {
        nativeOctas += raw;
      } else if (options.includeTokens) {
        const known = KNOWN_APTOS_COINS[coinType] ?? KNOWN_APTOS_COINS[coinType.toLowerCase()];
        const decimals = known?.decimals ?? 8;
        tokens.push({
          symbol: known?.symbol ?? fallbackSymbol(coinType),
          ...(known?.name ? { name: known.name } : {}),
          contractAddress: coinType,
          decimals,
          rawBalance: raw.toString(),
          balance: formatUnitsBigInt(raw, decimals),
        });
      }
    }

    const base = buildBaseResult(account);
    return {
      ...base,
      nativeRaw: nativeOctas.toString(),
      nativeBalance: formatUnitsBigInt(nativeOctas, config.nativeDecimals),
      tokens,
    };
  } catch (err) {
    return buildErrorResult(account, err);
  }
}
