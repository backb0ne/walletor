import type { ChainConfig, ChainId } from '../types.js';

export const CHAIN_CONFIGS: Record<ChainId, ChainConfig> = {
  ethereum: {
    id: 'ethereum',
    name: 'Ethereum',
    family: 'evm',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    llamaNativeId: 'coingecko:ethereum',
    coingeckoId: 'ethereum',
    evmChainId: 1,
    explorerUrl: 'https://etherscan.io',
    rpcs: [
      'https://ethereum-rpc.publicnode.com',
      'https://eth.llamarpc.com',
      'https://1rpc.io/eth',
      'https://cloudflare-eth.com',
    ],
  },
  arbitrum: {
    id: 'arbitrum',
    name: 'Arbitrum One',
    family: 'evm',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    llamaNativeId: 'coingecko:ethereum',
    coingeckoId: 'ethereum',
    evmChainId: 42161,
    explorerUrl: 'https://arbiscan.io',
    rpcs: [
      'https://arbitrum-one-rpc.publicnode.com',
      'https://arb1.arbitrum.io/rpc',
      'https://1rpc.io/arb',
    ],
  },
  optimism: {
    id: 'optimism',
    name: 'Optimism',
    family: 'evm',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    llamaNativeId: 'coingecko:ethereum',
    coingeckoId: 'ethereum',
    evmChainId: 10,
    explorerUrl: 'https://optimistic.etherscan.io',
    rpcs: [
      'https://optimism-rpc.publicnode.com',
      'https://mainnet.optimism.io',
      'https://1rpc.io/op',
    ],
  },
  base: {
    id: 'base',
    name: 'Base',
    family: 'evm',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    llamaNativeId: 'coingecko:ethereum',
    coingeckoId: 'ethereum',
    evmChainId: 8453,
    explorerUrl: 'https://basescan.org',
    rpcs: [
      'https://base-rpc.publicnode.com',
      'https://mainnet.base.org',
      'https://1rpc.io/base',
    ],
  },
  polygon: {
    id: 'polygon',
    name: 'Polygon PoS',
    family: 'evm',
    nativeSymbol: 'POL',
    nativeDecimals: 18,
    llamaNativeId: 'coingecko:polygon-ecosystem-token',
    coingeckoId: 'polygon-ecosystem-token',
    evmChainId: 137,
    explorerUrl: 'https://polygonscan.com',
    rpcs: [
      'https://polygon-bor-rpc.publicnode.com',
      'https://polygon-rpc.com',
      'https://1rpc.io/matic',
    ],
  },
  bsc: {
    id: 'bsc',
    name: 'BNB Smart Chain',
    family: 'evm',
    nativeSymbol: 'BNB',
    nativeDecimals: 18,
    llamaNativeId: 'coingecko:binancecoin',
    coingeckoId: 'binancecoin',
    evmChainId: 56,
    explorerUrl: 'https://bscscan.com',
    rpcs: [
      'https://bsc-rpc.publicnode.com',
      'https://bsc-dataseed.binance.org',
      'https://1rpc.io/bnb',
    ],
  },
  avalanche: {
    id: 'avalanche',
    name: 'Avalanche C-Chain',
    family: 'evm',
    nativeSymbol: 'AVAX',
    nativeDecimals: 18,
    llamaNativeId: 'coingecko:avalanche-2',
    coingeckoId: 'avalanche-2',
    evmChainId: 43114,
    explorerUrl: 'https://snowtrace.io',
    rpcs: [
      'https://avalanche-c-chain-rpc.publicnode.com',
      'https://api.avax.network/ext/bc/C/rpc',
      'https://1rpc.io/avax/c',
    ],
  },
  linea: {
    id: 'linea',
    name: 'Linea',
    family: 'evm',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    llamaNativeId: 'coingecko:ethereum',
    coingeckoId: 'ethereum',
    evmChainId: 59144,
    explorerUrl: 'https://lineascan.build',
    rpcs: [
      'https://linea-rpc.publicnode.com',
      'https://rpc.linea.build',
      'https://1rpc.io/linea',
    ],
  },
  scroll: {
    id: 'scroll',
    name: 'Scroll',
    family: 'evm',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    llamaNativeId: 'coingecko:ethereum',
    coingeckoId: 'ethereum',
    evmChainId: 534352,
    explorerUrl: 'https://scrollscan.com',
    rpcs: [
      'https://scroll-rpc.publicnode.com',
      'https://rpc.scroll.io',
      'https://1rpc.io/scroll',
    ],
  },
  blast: {
    id: 'blast',
    name: 'Blast',
    family: 'evm',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    llamaNativeId: 'coingecko:ethereum',
    coingeckoId: 'ethereum',
    evmChainId: 81457,
    explorerUrl: 'https://blastscan.io',
    rpcs: [
      'https://blast-rpc.publicnode.com',
      'https://rpc.blast.io',
    ],
  },
  gnosis: {
    id: 'gnosis',
    name: 'Gnosis Chain',
    family: 'evm',
    nativeSymbol: 'xDAI',
    nativeDecimals: 18,
    llamaNativeId: 'coingecko:xdai',
    coingeckoId: 'xdai',
    evmChainId: 100,
    explorerUrl: 'https://gnosisscan.io',
    rpcs: [
      'https://gnosis-rpc.publicnode.com',
      'https://rpc.gnosischain.com',
      'https://1rpc.io/gnosis',
    ],
  },
  bitcoin: {
    id: 'bitcoin',
    name: 'Bitcoin',
    family: 'utxo',
    nativeSymbol: 'BTC',
    nativeDecimals: 8,
    llamaNativeId: 'coingecko:bitcoin',
    coingeckoId: 'bitcoin',
    explorerUrl: 'https://mempool.space',
    rpcs: [
      'https://mempool.space/api',
      'https://blockstream.info/api',
    ],
  },
  litecoin: {
    id: 'litecoin',
    name: 'Litecoin',
    family: 'utxo',
    nativeSymbol: 'LTC',
    nativeDecimals: 8,
    llamaNativeId: 'coingecko:litecoin',
    coingeckoId: 'litecoin',
    explorerUrl: 'https://litecoinspace.org',
    rpcs: [
      'https://litecoinspace.org/api',
      'https://api.blockcypher.com/v1/ltc/main',
    ],
  },
  dogecoin: {
    id: 'dogecoin',
    name: 'Dogecoin',
    family: 'utxo',
    nativeSymbol: 'DOGE',
    nativeDecimals: 8,
    llamaNativeId: 'coingecko:dogecoin',
    coingeckoId: 'dogecoin',
    explorerUrl: 'https://dogechain.info',
    rpcs: [
      'https://api.blockcypher.com/v1/doge/main',
      'https://dogechain.info/api/v1',
    ],
  },
  solana: {
    id: 'solana',
    name: 'Solana',
    family: 'solana',
    nativeSymbol: 'SOL',
    nativeDecimals: 9,
    llamaNativeId: 'coingecko:solana',
    coingeckoId: 'solana',
    explorerUrl: 'https://solscan.io',
    rpcs: [
      'https://api.mainnet-beta.solana.com',
      'https://solana-rpc.publicnode.com',
    ],
  },
  tron: {
    id: 'tron',
    name: 'TRON',
    family: 'tron',
    nativeSymbol: 'TRX',
    nativeDecimals: 6,
    llamaNativeId: 'coingecko:tron',
    coingeckoId: 'tron',
    explorerUrl: 'https://tronscan.org',
    rpcs: [
      'https://api.trongrid.io',
      'https://api.tronstack.io',
    ],
  },
  ton: {
    id: 'ton',
    name: 'TON',
    family: 'ton',
    nativeSymbol: 'TON',
    nativeDecimals: 9,
    llamaNativeId: 'coingecko:the-open-network',
    coingeckoId: 'the-open-network',
    explorerUrl: 'https://tonviewer.com',
    rpcs: [
      'https://toncenter.com/api/v2',
      'https://tonapi.io/v2',
    ],
  },
  sui: {
    id: 'sui',
    name: 'Sui',
    family: 'sui',
    nativeSymbol: 'SUI',
    nativeDecimals: 9,
    llamaNativeId: 'coingecko:sui',
    coingeckoId: 'sui',
    explorerUrl: 'https://suivision.xyz',
    rpcs: [
      'https://fullnode.mainnet.sui.io:443',
      'https://sui-rpc.publicnode.com',
    ],
  },
  aptos: {
    id: 'aptos',
    name: 'Aptos',
    family: 'aptos',
    nativeSymbol: 'APT',
    nativeDecimals: 8,
    llamaNativeId: 'coingecko:aptos',
    coingeckoId: 'aptos',
    explorerUrl: 'https://aptoscan.com',
    rpcs: [
      'https://fullnode.mainnet.aptoslabs.com/v1',
      'https://aptos-rest.publicnode.com/v1',
    ],
  },
  cosmos: {
    id: 'cosmos',
    name: 'Cosmos Hub',
    family: 'cosmos',
    nativeSymbol: 'ATOM',
    nativeDecimals: 6,
    llamaNativeId: 'coingecko:cosmos',
    coingeckoId: 'cosmos',
    cosmosPrefix: 'cosmos',
    cosmosDenom: 'uatom',
    explorerUrl: 'https://www.mintscan.io/cosmos',
    rpcs: [
      'https://cosmos-rest.publicnode.com',
      'https://rest.cosmos.directory/cosmoshub',
    ],
  },
  osmosis: {
    id: 'osmosis',
    name: 'Osmosis',
    family: 'cosmos',
    nativeSymbol: 'OSMO',
    nativeDecimals: 6,
    llamaNativeId: 'coingecko:osmosis',
    coingeckoId: 'osmosis',
    cosmosPrefix: 'osmo',
    cosmosDenom: 'uosmo',
    explorerUrl: 'https://www.mintscan.io/osmosis',
    rpcs: [
      'https://osmosis-rest.publicnode.com',
      'https://rest.cosmos.directory/osmosis',
    ],
  },
  celestia: {
    id: 'celestia',
    name: 'Celestia',
    family: 'cosmos',
    nativeSymbol: 'TIA',
    nativeDecimals: 6,
    llamaNativeId: 'coingecko:celestia',
    coingeckoId: 'celestia',
    cosmosPrefix: 'celestia',
    cosmosDenom: 'utia',
    explorerUrl: 'https://www.mintscan.io/celestia',
    rpcs: [
      'https://celestia-rest.publicnode.com',
      'https://rest.cosmos.directory/celestia',
    ],
  },
  xrp: {
    id: 'xrp',
    name: 'XRP Ledger',
    family: 'xrp',
    nativeSymbol: 'XRP',
    nativeDecimals: 6,
    llamaNativeId: 'coingecko:ripple',
    coingeckoId: 'ripple',
    explorerUrl: 'https://xrpscan.com',
    rpcs: [
      'https://xrplcluster.com',
      'https://s1.ripple.com:51234',
      'https://s2.ripple.com:51234',
    ],
  },
  stellar: {
    id: 'stellar',
    name: 'Stellar',
    family: 'stellar',
    nativeSymbol: 'XLM',
    nativeDecimals: 7,
    llamaNativeId: 'coingecko:stellar',
    coingeckoId: 'stellar',
    explorerUrl: 'https://stellar.expert/explorer/public',
    rpcs: [
      'https://horizon.stellar.org',
      'https://horizon.stellar.lobstr.co',
    ],
  },
  near: {
    id: 'near',
    name: 'NEAR Protocol',
    family: 'near',
    nativeSymbol: 'NEAR',
    nativeDecimals: 24,
    llamaNativeId: 'coingecko:near',
    coingeckoId: 'near',
    explorerUrl: 'https://nearblocks.io',
    rpcs: [
      'https://rpc.mainnet.near.org',
      'https://near.lava.build',
    ],
  },
};

export const ALL_CHAIN_IDS: ChainId[] = Object.keys(CHAIN_CONFIGS) as ChainId[];

const ALCHEMY_SUBDOMAINS: Partial<Record<ChainId, string>> = {
  ethereum: 'eth-mainnet',
  arbitrum: 'arb-mainnet',
  optimism: 'opt-mainnet',
  base: 'base-mainnet',
  polygon: 'polygon-mainnet',
  bsc: 'bnb-mainnet',
  avalanche: 'avax-mainnet',
  linea: 'linea-mainnet',
  scroll: 'scroll-mainnet',
  blast: 'blast-mainnet',
  gnosis: 'gnosis-mainnet',
  solana: 'solana-mainnet',
};

export function resolveChainRpcs(chainId: ChainId): string[] {
  const config = CHAIN_CONFIGS[chainId];
  const resolved: string[] = [];

  const envKey = `RPC_URL_${chainId.toUpperCase()}`;
  const customRpc = process.env[envKey]?.trim();
  if (customRpc) {
    for (const part of customRpc.split(',')) {
      const url = part.trim();
      if (url) {
        resolved.push(url);
      }
    }
  }

  const alchemyKey = process.env.ALCHEMY_API_KEY?.trim();
  const alchemySubdomain = ALCHEMY_SUBDOMAINS[chainId];
  if (alchemyKey && alchemySubdomain) {
    resolved.push(`https://${alchemySubdomain}.g.alchemy.com/v2/${alchemyKey}`);
  }

  if (chainId === 'solana') {
    const heliusKey = process.env.HELIUS_API_KEY?.trim();
    if (heliusKey) {
      resolved.push(`https://mainnet.helius-rpc.com/?api-key=${heliusKey}`);
    }
  }

  if (chainId === 'ton') {
    const tonapiKey = process.env.TONAPI_KEY?.trim();
    const toncenterKey = process.env.TONCENTER_API_KEY?.trim();
    if (tonapiKey && !toncenterKey) {
      resolved.push('https://tonapi.io/v2');
    } else if (toncenterKey) {
      resolved.push('https://toncenter.com/api/v2');
    }
  }

  if (chainId === 'tron') {
    const trongridKey = process.env.TRONGRID_API_KEY?.trim();
    if (trongridKey) {
      resolved.push('https://api.trongrid.io');
    }
  }

  for (const fallback of config.rpcs) {
    resolved.push(fallback);
  }

  return Array.from(new Set(resolved));
}
