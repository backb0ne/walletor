export type ChainFamily =
  | 'evm'
  | 'utxo'
  | 'solana'
  | 'tron'
  | 'ton'
  | 'sui'
  | 'aptos'
  | 'cosmos'
  | 'xrp'
  | 'stellar'
  | 'near';

export type ChainId =
  | 'ethereum'
  | 'arbitrum'
  | 'optimism'
  | 'base'
  | 'polygon'
  | 'bsc'
  | 'avalanche'
  | 'linea'
  | 'scroll'
  | 'blast'
  | 'gnosis'
  | 'bitcoin'
  | 'litecoin'
  | 'dogecoin'
  | 'solana'
  | 'tron'
  | 'ton'
  | 'sui'
  | 'aptos'
  | 'cosmos'
  | 'osmosis'
  | 'celestia'
  | 'xrp'
  | 'stellar'
  | 'near';

export type InputType =
  | 'mnemonic'
  | 'ton_mnemonic'
  | 'private_key_hex'
  | 'private_key_wif'
  | 'private_key_solana'
  | 'private_key_sui'
  | 'private_key_stellar'
  | 'private_key_near'
  | 'address';

export interface ParsedInput {
  id: string;
  label: string;
  rawKind: InputType;
  secretOrValue: string;
  explicitChain?: ChainId;
  accountIndices?: number[];
}

export interface DerivedAccount {
  inputId: string;
  inputLabel: string;
  chain: ChainId;
  family: ChainFamily;
  address: string;
  path?: string;
  addressType?: string;
  accountIndex: number;
}

export interface TokenBalance {
  symbol: string;
  name?: string;
  contractAddress: string;
  decimals: number;
  rawBalance: string;
  balance: number;
  priceUsd?: number;
  valueUsd?: number;
  isNative?: boolean;
}

export interface AccountBalanceResult {
  inputId: string;
  inputLabel: string;
  chain: ChainId;
  family: ChainFamily;
  address: string;
  addressType?: string;
  path?: string;
  nativeBalance: number;
  nativeSymbol: string;
  nativeRaw: string;
  nativePriceUsd?: number;
  nativeValueUsd?: number;
  tokens: TokenBalance[];
  totalUsd: number;
  error?: string;
}

export interface ChainConfig {
  id: ChainId;
  name: string;
  family: ChainFamily;
  nativeSymbol: string;
  nativeDecimals: number;
  llamaNativeId: string;
  coingeckoId: string;
  rpcs: string[];
  explorerUrl?: string;
  evmChainId?: number;
  cosmosPrefix?: string;
  cosmosDenom?: string;
}

export interface ScanOptions {
  chains: ChainId[];
  accounts: number;
  includeTokens: boolean;
  includePrices: boolean;
  nonZeroOnly: boolean;
  concurrency: number;
  timeoutMs: number;
}
