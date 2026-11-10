# walletor

Multi-chain CLI wallet inspector for deriving addresses and checking balances from seeds, private keys, or public addresses using pure JS/TS cryptography.

## Installation

```bash
npm install
npm run build
```

Run in development without building:

```bash
npm run dev -- --help
```

Or link globally after building:

```bash
npm link
walletor --help
```

## Usage

### `check`
Inspect balances and tokens for a seed phrase, private key, or address across supported chains:

```bash
walletor check "<seed-or-key-or-address>"
walletor check <address> --chains ethereum,solana,bitcoin
```

### `derive`
Derive addresses (and optionally inspect derivation paths) from a seed phrase or private key without querying balances:

```bash
walletor derive "<seed-or-private-key>"
walletor derive "<seed-phrase>" --account 0 --index 0
```

### `chains`
List all supported chains, address families, and RPC status:

```bash
walletor chains
```

## Input Formats

- **Seed phrases**: BIP-39 mnemonics (12, 15, 18, 21, or 24 words)
- **Private keys**: Hex keys (with or without `0x` prefix), Bitcoin WIF, Solana base58/JSON byte-array keys, TON/XRP secret keys
- **Public addresses**: EVM (`0x...`), Bitcoin (Legacy `1...`, P2SH `3...`, Bech32 `bc1q...`, Taproot `bc1p...`), Solana (Base58), TRON (`T...`), TON (`UQ...` / `EQ...`), XRP (`r...`), Litecoin, Dogecoin

## Supported Chains

- **EVM**: Ethereum, Arbitrum, Base, Optimism, Polygon, BSC, Avalanche
- **UTXO**: Bitcoin, Litecoin, Dogecoin
- **Non-EVM**: Solana, TRON, TON, XRP Ledger

## Configuration (`.env`)

Copy `.env.example` to `.env` to configure optional API keys and custom RPC URLs:

- `ALCHEMY_API_KEY`, `HELIUS_API_KEY`, `TRONGRID_API_KEY`, `TONCENTER_API_KEY`, `TONAPI_KEY`, `COINGECKO_API_KEY`
- `RPC_URL_<CHAIN>` (e.g., `RPC_URL_ETHEREUM`, `RPC_URL_SOLANA`, `RPC_URL_BITCOIN`) to override default public endpoints
