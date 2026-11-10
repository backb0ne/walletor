import type { ChainId } from '../types.js';

export interface TokenConfig {
  symbol: string;
  name?: string;
  contractAddress: string;
  decimals: number;
}

export const EVM_TOKENS: Partial<Record<ChainId, TokenConfig[]>> = {
  ethereum: [
    { symbol: 'USDT', name: 'Tether USD', contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    { symbol: 'USDC', name: 'USD Coin', contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    { symbol: 'DAI', name: 'Dai Stablecoin', contractAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 },
    { symbol: 'WETH', name: 'Wrapped Ether', contractAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
    { symbol: 'WBTC', name: 'Wrapped BTC', contractAddress: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8 },
    { symbol: 'LINK', name: 'ChainLink Token', contractAddress: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18 },
    { symbol: 'UNI', name: 'Uniswap', contractAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', decimals: 18 },
  ],
  arbitrum: [
    { symbol: 'USDT', name: 'Tether USD', contractAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
    { symbol: 'USDC', name: 'USD Coin', contractAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
    { symbol: 'USDC.e', name: 'Bridged USDC', contractAddress: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', decimals: 6 },
    { symbol: 'DAI', name: 'Dai Stablecoin', contractAddress: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 },
    { symbol: 'WETH', name: 'Wrapped Ether', contractAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
    { symbol: 'WBTC', name: 'Wrapped BTC', contractAddress: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', decimals: 8 },
    { symbol: 'ARB', name: 'Arbitrum', contractAddress: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18 },
  ],
  optimism: [
    { symbol: 'USDT', name: 'Tether USD', contractAddress: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6 },
    { symbol: 'USDC', name: 'USD Coin', contractAddress: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },
    { symbol: 'USDC.e', name: 'Bridged USDC', contractAddress: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', decimals: 6 },
    { symbol: 'DAI', name: 'Dai Stablecoin', contractAddress: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 },
    { symbol: 'WETH', name: 'Wrapped Ether', contractAddress: '0x4200000000000000000000000000000000000006', decimals: 18 },
    { symbol: 'WBTC', name: 'Wrapped BTC', contractAddress: '0x68f180fcCe6836688e9084f035309E29Bf0A2095', decimals: 8 },
    { symbol: 'OP', name: 'Optimism', contractAddress: '0x4200000000000000000000000000000000000042', decimals: 18 },
  ],
  base: [
    { symbol: 'USDC', name: 'USD Coin', contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
    { symbol: 'USDbC', name: 'USD Base Coin', contractAddress: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', decimals: 6 },
    { symbol: 'USDT', name: 'Tether USD', contractAddress: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6 },
    { symbol: 'DAI', name: 'Dai Stablecoin', contractAddress: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18 },
    { symbol: 'WETH', name: 'Wrapped Ether', contractAddress: '0x4200000000000000000000000000000000000006', decimals: 18 },
    { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', contractAddress: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8 },
  ],
  polygon: [
    { symbol: 'USDT', name: 'Tether USD', contractAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
    { symbol: 'USDC', name: 'USD Coin', contractAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
    { symbol: 'USDC.e', name: 'Bridged USDC', contractAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6 },
    { symbol: 'DAI', name: 'Dai Stablecoin', contractAddress: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', decimals: 18 },
    { symbol: 'WETH', name: 'Wrapped Ether', contractAddress: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
    { symbol: 'WBTC', name: 'Wrapped BTC', contractAddress: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', decimals: 8 },
    { symbol: 'WPOL', name: 'Wrapped POL', contractAddress: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals: 18 },
  ],
  bsc: [
    { symbol: 'USDT', name: 'Tether USD', contractAddress: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
    { symbol: 'USDC', name: 'USD Coin', contractAddress: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
    { symbol: 'DAI', name: 'Dai Token', contractAddress: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3', decimals: 18 },
    { symbol: 'ETH', name: 'Binance-Peg Ethereum', contractAddress: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', decimals: 18 },
    { symbol: 'BTCB', name: 'Binance-Peg BTCB', contractAddress: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', decimals: 18 },
    { symbol: 'WBNB', name: 'Wrapped BNB', contractAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18 },
  ],
  avalanche: [
    { symbol: 'USDT', name: 'Tether USD', contractAddress: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', decimals: 6 },
    { symbol: 'USDC', name: 'USD Coin', contractAddress: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', decimals: 6 },
    { symbol: 'USDC.e', name: 'Bridged USDC', contractAddress: '0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664', decimals: 6 },
    { symbol: 'DAI.e', name: 'Dai Stablecoin', contractAddress: '0xd586E7F844cEa2F87f50152665BCbc2C279D8d70', decimals: 18 },
    { symbol: 'WETH.e', name: 'Wrapped Ether', contractAddress: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB', decimals: 18 },
    { symbol: 'WBTC.e', name: 'Wrapped BTC', contractAddress: '0x50b7545627a5162F82A992c33b87aDc75187B218', decimals: 8 },
    { symbol: 'WAVAX', name: 'Wrapped AVAX', contractAddress: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', decimals: 18 },
  ],
  linea: [
    { symbol: 'USDC', name: 'USD Coin', contractAddress: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff', decimals: 6 },
    { symbol: 'USDT', name: 'Tether USD', contractAddress: '0xA219439258ca9da29E9Cc4cE5596924745e12B93', decimals: 6 },
    { symbol: 'DAI', name: 'Dai Stablecoin', contractAddress: '0x4AF15ec2A0BD43Db75dd04E62FAA3B8EF36b00d5', decimals: 18 },
    { symbol: 'WETH', name: 'Wrapped Ether', contractAddress: '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f', decimals: 18 },
    { symbol: 'WBTC', name: 'Wrapped BTC', contractAddress: '0x3aAB2285ddcDdaD8edf438C1bAB47e1a9D05a9b4', decimals: 8 },
  ],
  scroll: [
    { symbol: 'USDC', name: 'USD Coin', contractAddress: '0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4', decimals: 6 },
    { symbol: 'USDT', name: 'Tether USD', contractAddress: '0xf55BEC9cafDbE8730f096Aa55dad6D22d44099Df', decimals: 6 },
    { symbol: 'DAI', name: 'Dai Stablecoin', contractAddress: '0xcA77eB3fEFe3725Dc33bccB54eDEFc3D9f764f97', decimals: 18 },
    { symbol: 'WETH', name: 'Wrapped Ether', contractAddress: '0x5300000000000000000000000000000000000004', decimals: 18 },
    { symbol: 'WBTC', name: 'Wrapped BTC', contractAddress: '0x3C1BCa5a656e69edCD0D4E36BEbb3FcDAcA60Cf1', decimals: 8 },
  ],
  blast: [
    { symbol: 'USDB', name: 'USDB', contractAddress: '0x4300000000000000000000000000000000000003', decimals: 18 },
    { symbol: 'WETH', name: 'Wrapped Ether', contractAddress: '0x4300000000000000000000000000000000000004', decimals: 18 },
    { symbol: 'BLAST', name: 'Blast', contractAddress: '0xb1a5700fA2358173Fe465e6eA4Ff52E36e88E2ad', decimals: 18 },
  ],
  gnosis: [
    { symbol: 'USDC', name: 'USD Coin on xDai', contractAddress: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83', decimals: 6 },
    { symbol: 'USDC.e', name: 'Bridged USDC', contractAddress: '0x2a22f9c3b484c3629090FeED35F17Ff8F88f76F0', decimals: 6 },
    { symbol: 'WXDAI', name: 'Wrapped xDAI', contractAddress: '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d', decimals: 18 },
    { symbol: 'WETH', name: 'Wrapped Ether', contractAddress: '0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1', decimals: 18 },
    { symbol: 'WBTC', name: 'Wrapped BTC', contractAddress: '0x8e5bBbb09Ed1ebdE8674Cda39A0c169401db4252', decimals: 8 },
    { symbol: 'GNO', name: 'Gnosis Token', contractAddress: '0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb', decimals: 18 },
  ],
};

export const TRC20_TOKENS: TokenConfig[] = [
  { symbol: 'USDT', name: 'Tether USD', contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6 },
  { symbol: 'USDC', name: 'USD Coin', contractAddress: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8', decimals: 6 },
  { symbol: 'USDD', name: 'Decentralized USD', contractAddress: 'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn', decimals: 18 },
  { symbol: 'WTRX', name: 'Wrapped TRX', contractAddress: 'TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR', decimals: 6 },
  { symbol: 'BTT', name: 'BitTorrent', contractAddress: 'TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4', decimals: 18 },
  { symbol: 'JST', name: 'JUST', contractAddress: 'TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9', decimals: 18 },
  { symbol: 'SUN', name: 'SUN', contractAddress: 'TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S', decimals: 18 },
];

export function getTokensForChain(chainId: ChainId): TokenConfig[] {
  if (chainId === 'tron') {
    return TRC20_TOKENS;
  }
  return EVM_TOKENS[chainId] ?? [];
}
