import { secp256k1 } from '@noble/curves/secp256k1.js';
import { blake2b } from '@noble/hashes/blake2.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { keccak_256, sha3_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, concatBytes, hexToBytes } from '@noble/hashes/utils.js';
import { base32nopad, base58, base58xrp, bech32, bech32m, createBase58check } from '@scure/base';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { NETWORK, p2pkh, p2sh, p2tr, p2wpkh } from '@scure/btc-signer';
import type { BTC_NETWORK } from '@scure/btc-signer/utils.js';
import { mnemonicToPrivateKey, mnemonicValidate } from '@ton/crypto';
import { Address as TonAddress, WalletContractV4, WalletContractV5R1 } from '@ton/ton';
import { deriveAddress as deriveXrpAddress } from 'ripple-keypairs';
import { getAddress as getEvmChecksumAddress } from 'viem';
import { CHAIN_CONFIGS } from '../config/chains.js';
import type { ChainId, DerivedAccount, ParsedInput } from '../types.js';
import { deriveEd25519Path, getEd25519PublicKey } from './slip10.js';

const base58check = createBase58check(sha256);

const LITECOIN_NETWORK: BTC_NETWORK = {
  bech32: 'ltc',
  pubKeyHash: 0x30,
  scriptHash: 0x32,
  wif: 0xb0,
};

const DOGECOIN_NETWORK: BTC_NETWORK = {
  bech32: 'doge',
  pubKeyHash: 0x1e,
  scriptHash: 0x16,
  wif: 0x9e,
};

const EVM_CHAINS: ChainId[] = [
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
];

const EVM_CHAIN_SET = new Set<ChainId>(EVM_CHAINS);

export interface DecodedWif {
  chain: 'bitcoin' | 'litecoin' | 'dogecoin';
  privateKey: Uint8Array;
  compressed: boolean;
}

export interface DetectedAddressMatch {
  chain: ChainId;
  address: string;
  addressType?: string;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function crc16XModem(data: Uint8Array): number {
  let crc = 0x0000;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc;
}

export function encodeStellarPublicKey(pubKey32: Uint8Array): string {
  const payload = new Uint8Array(35);
  payload[0] = 6 << 3; // 0x30 -> 'G'
  payload.set(pubKey32, 1);
  const crc = crc16XModem(payload.subarray(0, 33));
  payload[33] = crc & 0xff;
  payload[34] = (crc >> 8) & 0xff;
  return base32nopad.encode(payload);
}

export function decodeStellarStrKey(
  value: string,
  expectedVersion: number,
): Uint8Array | null {
  if (value.length !== 56) return null;
  try {
    const raw = base32nopad.decode(value);
    if (raw.length !== 35 || raw[0] !== expectedVersion) return null;
    const expectedCrc = crc16XModem(raw.subarray(0, 33));
    const actualCrc = raw[33] | (raw[34] << 8);
    if (expectedCrc !== actualCrc) return null;
    return new Uint8Array(raw.subarray(1, 33));
  } catch {
    return null;
  }
}

export function decodeWif(wif: string): DecodedWif | null {
  try {
    const decoded = base58check.decode(wif);
    if (decoded.length !== 33 && decoded.length !== 34) {
      return null;
    }
    const version = decoded[0];
    let chain: 'bitcoin' | 'litecoin' | 'dogecoin';
    if (version === 0x80) {
      chain = 'bitcoin';
    } else if (version === 0xb0) {
      chain = 'litecoin';
    } else if (version === 0x9e) {
      chain = 'dogecoin';
    } else {
      return null;
    }

    let compressed = false;
    if (decoded.length === 34) {
      if (decoded[33] !== 0x01) return null;
      compressed = true;
    }

    const privateKey = new Uint8Array(decoded.subarray(1, 33));
    if (!secp256k1.utils.isValidSecretKey(privateKey)) {
      return null;
    }
    return { chain, privateKey, compressed };
  } catch {
    return null;
  }
}

export function decodeXrpClassicAddress(value: string): boolean {
  if (!value.startsWith('r') || value.length < 25 || value.length > 35) {
    return false;
  }
  try {
    const raw = base58xrp.decode(value);
    if (raw.length !== 25 || raw[0] !== 0x00) return false;
    const checksum = sha256(sha256(raw.subarray(0, 21))).subarray(0, 4);
    return bytesEqual(checksum, raw.subarray(21, 25));
  } catch {
    return false;
  }
}

function evmAddressFromUncompressedPub(uncompressedPub: Uint8Array): string {
  const hash = keccak_256(uncompressedPub.subarray(1));
  return getEvmChecksumAddress(`0x${bytesToHex(hash.subarray(hash.length - 20))}`);
}

function tronAddressFromUncompressedPub(uncompressedPub: Uint8Array): string {
  const hash = keccak_256(uncompressedPub.subarray(1));
  const payload = concatBytes(new Uint8Array([0x41]), hash.subarray(hash.length - 20));
  return base58check.encode(payload);
}

function suiAddressFromEd25519Pub(pubKey32: Uint8Array): string {
  const digest = blake2b(concatBytes(new Uint8Array([0x00]), pubKey32), { dkLen: 32 });
  return `0x${bytesToHex(digest)}`;
}

function aptosAddressFromEd25519Pub(pubKey32: Uint8Array): string {
  const digest = sha3_256(concatBytes(pubKey32, new Uint8Array([0x00])));
  return `0x${bytesToHex(digest)}`;
}

function cosmosAddressFromCompressedPub(compressedPub: Uint8Array, prefix: string): string {
  const hash160 = ripemd160(sha256(compressedPub));
  return bech32.encode(prefix, bech32.toWords(hash160));
}

function xrpAddressFromCompressedPub(compressedPub: Uint8Array): string {
  return deriveXrpAddress(bytesToHex(compressedPub).toUpperCase());
}

function tonAddressesFromPubKey(pubKey32: Uint8Array): { v4R2: string; v5R1: string } {
  const publicKey = Buffer.from(pubKey32);
  const v4 = WalletContractV4.create({ workchain: 0, publicKey });
  const v5 = WalletContractV5R1.create({ workchain: 0, publicKey });
  return {
    v4R2: v4.address.toString({ bounceable: false, urlSafe: true }),
    v5R1: v5.address.toString({ bounceable: false, urlSafe: true }),
  };
}

function makeAccount(
  input: ParsedInput,
  chain: ChainId,
  address: string,
  accountIndex: number,
  options?: { path?: string; addressType?: string },
): DerivedAccount {
  return {
    inputId: input.id,
    inputLabel: input.label,
    chain,
    family: CHAIN_CONFIGS[chain].family,
    address,
    accountIndex,
    ...(options?.path ? { path: options.path } : {}),
    ...(options?.addressType ? { addressType: options.addressType } : {}),
  };
}

function resolveTargetSet(targetChains: ChainId[], explicitChain?: ChainId): Set<ChainId> {
  if (!explicitChain) {
    return new Set(targetChains);
  }
  return targetChains.includes(explicitChain) ? new Set([explicitChain]) : new Set();
}

export function detectAddressMatches(
  value: string,
  targetChains: ChainId[],
  explicitChain?: ChainId,
): DetectedAddressMatch[] {
  const targetSet = resolveTargetSet(targetChains, explicitChain);
  if (targetSet.size === 0) return [];

  if (explicitChain) {
    if (EVM_CHAIN_SET.has(explicitChain) && /^0x[0-9a-fA-F]{40}$/.test(value)) {
      return [{ chain: explicitChain, address: getEvmChecksumAddress(value) }];
    }
    if (explicitChain === 'sui' || explicitChain === 'aptos') {
      if (/^0x[0-9a-fA-F]{64}$/.test(value)) {
        return [{ chain: explicitChain, address: value.toLowerCase() }];
      }
    }
    if (explicitChain === 'near') {
      if (/^[0-9a-fA-F]{64}$/.test(value)) {
        return [{ chain: 'near', address: value.toLowerCase() }];
      }
      if (/^[a-z0-9._-]+\.near$/i.test(value)) {
        return [{ chain: 'near', address: value.toLowerCase() }];
      }
    }
    if (explicitChain === 'ton' && (TonAddress.isFriendly(value) || TonAddress.isRaw(value))) {
      return [{ chain: 'ton', address: value }];
    }
    if (explicitChain === 'solana') {
      try {
        if (base58.decode(value).length === 32) {
          return [{ chain: 'solana', address: value }];
        }
      } catch {
        // fall through
      }
    }
    // Fall through to format-specific checks for UTXO/Tron/Cosmos/XRP/Stellar
  }

  // 0x + 40 hex -> EVM
  if (/^0x[0-9a-fA-F]{40}$/.test(value)) {
    const checksummed = getEvmChecksumAddress(value);
    const matches: DetectedAddressMatch[] = [];
    for (const chain of EVM_CHAINS) {
      if (targetSet.has(chain)) {
        matches.push({ chain, address: checksummed });
      }
    }
    return matches;
  }

  // 0x + 64 hex -> Sui and Aptos
  if (/^0x[0-9a-fA-F]{64}$/.test(value)) {
    const normalized = value.toLowerCase();
    const matches: DetectedAddressMatch[] = [];
    if (targetSet.has('sui')) matches.push({ chain: 'sui', address: normalized });
    if (targetSet.has('aptos')) matches.push({ chain: 'aptos', address: normalized });
    return matches;
  }

  // Bech32 / Bech32m addresses (BTC, LTC, Cosmos, Osmosis, Celestia)
  const lower = value.toLowerCase();
  if (lower.startsWith('bc1q')) {
    const decoded = bech32.decodeUnsafe(lower);
    if (decoded && decoded.prefix === 'bc' && decoded.words[0] === 0) {
      return targetSet.has('bitcoin')
        ? [{ chain: 'bitcoin', address: lower, addressType: 'P2WPKH (Native SegWit)' }]
        : [];
    }
  }
  if (lower.startsWith('bc1p')) {
    const decoded = bech32m.decodeUnsafe(lower);
    if (decoded && decoded.prefix === 'bc' && decoded.words[0] === 1) {
      return targetSet.has('bitcoin')
        ? [{ chain: 'bitcoin', address: lower, addressType: 'P2TR (Taproot)' }]
        : [];
    }
  }
  if (lower.startsWith('ltc1')) {
    const decoded =
      lower.startsWith('ltc1q') ? bech32.decodeUnsafe(lower) : bech32m.decodeUnsafe(lower);
    if (decoded && decoded.prefix === 'ltc') {
      return targetSet.has('litecoin')
        ? [{ chain: 'litecoin', address: lower, addressType: 'P2WPKH (Native SegWit)' }]
        : [];
    }
  }
  if (lower.startsWith('cosmos1') || lower.startsWith('osmo1') || lower.startsWith('celestia1')) {
    const decoded = bech32.decodeUnsafe(lower);
    if (decoded) {
      if (decoded.prefix === 'cosmos' && targetSet.has('cosmos')) {
        return [{ chain: 'cosmos', address: lower }];
      }
      if (decoded.prefix === 'osmo' && targetSet.has('osmosis')) {
        return [{ chain: 'osmosis', address: lower }];
      }
      if (decoded.prefix === 'celestia' && targetSet.has('celestia')) {
        return [{ chain: 'celestia', address: lower }];
      }
    }
  }

  // Base58Check 21-byte addresses: BTC (0x00, 0x05), LTC (0x30, 0x32), DOGE (0x1e), TRON (0x41)
  try {
    const decoded = base58check.decode(value);
    if (decoded.length === 21) {
      const version = decoded[0];
      if (version === 0x00) {
        return targetSet.has('bitcoin')
          ? [{ chain: 'bitcoin', address: value, addressType: 'P2PKH (Legacy)' }]
          : [];
      }
      if (version === 0x05) {
        return targetSet.has('bitcoin')
          ? [{ chain: 'bitcoin', address: value, addressType: 'P2SH-P2WPKH (Nested SegWit)' }]
          : [];
      }
      if (version === 0x30) {
        return targetSet.has('litecoin')
          ? [{ chain: 'litecoin', address: value, addressType: 'P2PKH (Legacy)' }]
          : [];
      }
      if (version === 0x32) {
        return targetSet.has('litecoin')
          ? [{ chain: 'litecoin', address: value, addressType: 'P2SH (Script)' }]
          : [];
      }
      if (version === 0x1e) {
        return targetSet.has('dogecoin')
          ? [{ chain: 'dogecoin', address: value, addressType: 'P2PKH (Legacy)' }]
          : [];
      }
      if (version === 0x41) {
        return targetSet.has('tron') ? [{ chain: 'tron', address: value }] : [];
      }
    }
  } catch {
    // not Base58Check
  }

  // TON friendly or raw
  if (TonAddress.isFriendly(value) || TonAddress.isRaw(value)) {
    return targetSet.has('ton') ? [{ chain: 'ton', address: value }] : [];
  }

  // XRP classic address
  if (decodeXrpClassicAddress(value)) {
    return targetSet.has('xrp') ? [{ chain: 'xrp', address: value }] : [];
  }

  // Stellar StrKey public key
  if (decodeStellarStrKey(value, 6 << 3) !== null) {
    return targetSet.has('stellar') ? [{ chain: 'stellar', address: value }] : [];
  }

  // NEAR implicit (64 hex, no 0x) or named *.near
  if (/^[0-9a-fA-F]{64}$/.test(value) || /^[a-z0-9._-]+\.near$/i.test(value)) {
    return targetSet.has('near') ? [{ chain: 'near', address: value.toLowerCase() }] : [];
  }

  // Solana Base58 32-byte public key
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) {
    try {
      const decoded = base58.decode(value);
      if (decoded.length === 32) {
        return targetSet.has('solana') ? [{ chain: 'solana', address: value }] : [];
      }
    } catch {
      // invalid base58
    }
  }

  return [];
}

function deriveSecp256k1PrivateKeyAccounts(
  input: ParsedInput,
  privKey32: Uint8Array,
  targetSet: Set<ChainId>,
): DerivedAccount[] {
  const accounts: DerivedAccount[] = [];
  const compressedPub = secp256k1.getPublicKey(privKey32, true);
  const uncompressedPub = secp256k1.getPublicKey(privKey32, false);

  let cachedEvmAddr: string | undefined;
  for (const chain of EVM_CHAINS) {
    if (targetSet.has(chain)) {
      cachedEvmAddr ??= evmAddressFromUncompressedPub(uncompressedPub);
      accounts.push(makeAccount(input, chain, cachedEvmAddr, 0));
    }
  }

  if (targetSet.has('bitcoin')) {
    const xOnly = compressedPub.subarray(1, 33);
    accounts.push(
      makeAccount(input, 'bitcoin', p2pkh(compressedPub, NETWORK).address, 0, {
        addressType: 'P2PKH (Legacy)',
      }),
      makeAccount(input, 'bitcoin', p2wpkh(compressedPub, NETWORK).address, 0, {
        addressType: 'P2WPKH (Native SegWit)',
      }),
      makeAccount(input, 'bitcoin', p2tr(xOnly, undefined, NETWORK).address, 0, {
        addressType: 'P2TR (Taproot)',
      }),
    );
  }

  if (targetSet.has('litecoin')) {
    accounts.push(
      makeAccount(input, 'litecoin', p2pkh(compressedPub, LITECOIN_NETWORK).address, 0, {
        addressType: 'P2PKH (Legacy)',
      }),
      makeAccount(input, 'litecoin', p2wpkh(compressedPub, LITECOIN_NETWORK).address, 0, {
        addressType: 'P2WPKH (Native SegWit)',
      }),
    );
  }

  if (targetSet.has('dogecoin')) {
    accounts.push(
      makeAccount(input, 'dogecoin', p2pkh(compressedPub, DOGECOIN_NETWORK).address, 0, {
        addressType: 'P2PKH (Legacy)',
      }),
    );
  }

  if (targetSet.has('tron')) {
    accounts.push(makeAccount(input, 'tron', tronAddressFromUncompressedPub(uncompressedPub), 0));
  }

  for (const cosmosChain of ['cosmos', 'osmosis', 'celestia'] as const) {
    if (targetSet.has(cosmosChain)) {
      const prefix = CHAIN_CONFIGS[cosmosChain].cosmosPrefix!;
      accounts.push(
        makeAccount(input, cosmosChain, cosmosAddressFromCompressedPub(compressedPub, prefix), 0),
      );
    }
  }

  if (targetSet.has('xrp')) {
    accounts.push(makeAccount(input, 'xrp', xrpAddressFromCompressedPub(compressedPub), 0));
  }

  return accounts;
}

function parseSolanaPrivateKeyBytes(secret: string): Uint8Array {
  const trimmed = secret.trim();
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error('Invalid Solana JSON keypair');
    }
    return Uint8Array.from(parsed.map((v) => Number(v)));
  }
  return new Uint8Array(base58.decode(trimmed));
}

export async function deriveAccountsForInput(
  input: ParsedInput,
  targetChains: ChainId[],
  accountCount: number,
): Promise<DerivedAccount[]> {
  const targetSet = resolveTargetSet(targetChains, input.explicitChain);
  if (targetSet.size === 0) return [];

  const indices =
    input.accountIndices && input.accountIndices.length > 0
      ? input.accountIndices
      : Array.from({ length: Math.max(1, accountCount) }, (_, i) => i);

  switch (input.rawKind) {
    case 'mnemonic': {
      const accounts: DerivedAccount[] = [];
      const words = input.secretOrValue.trim().toLowerCase().split(/\s+/);
      const seed = mnemonicToSeedSync(words.join(' '));
      const root = HDKey.fromMasterSeed(seed);
      const hasEvmTarget = EVM_CHAINS.some((c) => targetSet.has(c));

      let tonNativeHandled = false;
      if (targetSet.has('ton')) {
        const isTonNative = await mnemonicValidate(words);
        if (isTonNative) {
          const kp = await mnemonicToPrivateKey(words);
          const { v4R2, v5R1 } = tonAddressesFromPubKey(kp.publicKey);
          accounts.push(
            makeAccount(input, 'ton', v4R2, 0, { path: 'ton-native', addressType: 'v4R2' }),
            makeAccount(input, 'ton', v5R1, 0, { path: 'ton-native', addressType: 'v5R1' }),
          );
          tonNativeHandled = true;
        }
      }

      for (const i of indices) {
        if (hasEvmTarget) {
          const evmPath = `m/44'/60'/0'/0/${i}`;
          const evmNode = root.derive(evmPath);
          if (evmNode.privateKey) {
            const uncompressedPub = secp256k1.getPublicKey(evmNode.privateKey, false);
            const evmAddress = evmAddressFromUncompressedPub(uncompressedPub);
            for (const chain of EVM_CHAINS) {
              if (targetSet.has(chain)) {
                accounts.push(makeAccount(input, chain, evmAddress, i, { path: evmPath }));
              }
            }
          }
        }

        if (targetSet.has('bitcoin')) {
          const p44 = `m/44'/0'/0'/0/${i}`;
          const p49 = `m/49'/0'/0'/0/${i}`;
          const p84 = `m/84'/0'/0'/0/${i}`;
          const p86 = `m/86'/0'/0'/0/${i}`;

          const n44 = root.derive(p44);
          if (n44.publicKey) {
            accounts.push(
              makeAccount(input, 'bitcoin', p2pkh(n44.publicKey, NETWORK).address, i, {
                path: p44,
                addressType: 'P2PKH (Legacy)',
              }),
            );
          }

          const n49 = root.derive(p49);
          if (n49.publicKey) {
            accounts.push(
              makeAccount(
                input,
                'bitcoin',
                p2sh(p2wpkh(n49.publicKey, NETWORK), NETWORK).address,
                i,
                { path: p49, addressType: 'P2SH-P2WPKH (Nested SegWit)' },
              ),
            );
          }

          const n84 = root.derive(p84);
          if (n84.publicKey) {
            accounts.push(
              makeAccount(input, 'bitcoin', p2wpkh(n84.publicKey, NETWORK).address, i, {
                path: p84,
                addressType: 'P2WPKH (Native SegWit)',
              }),
            );
          }

          const n86 = root.derive(p86);
          if (n86.publicKey) {
            accounts.push(
              makeAccount(
                input,
                'bitcoin',
                p2tr(n86.publicKey.subarray(1, 33), undefined, NETWORK).address,
                i,
                { path: p86, addressType: 'P2TR (Taproot)' },
              ),
            );
          }
        }

        if (targetSet.has('litecoin')) {
          const p44 = `m/44'/2'/0'/0/${i}`;
          const p84 = `m/84'/2'/0'/0/${i}`;

          const n44 = root.derive(p44);
          if (n44.publicKey) {
            accounts.push(
              makeAccount(input, 'litecoin', p2pkh(n44.publicKey, LITECOIN_NETWORK).address, i, {
                path: p44,
                addressType: 'P2PKH (Legacy)',
              }),
            );
          }

          const n84 = root.derive(p84);
          if (n84.publicKey) {
            accounts.push(
              makeAccount(input, 'litecoin', p2wpkh(n84.publicKey, LITECOIN_NETWORK).address, i, {
                path: p84,
                addressType: 'P2WPKH (Native SegWit)',
              }),
            );
          }
        }

        if (targetSet.has('dogecoin')) {
          const p44 = `m/44'/3'/0'/0/${i}`;
          const n44 = root.derive(p44);
          if (n44.publicKey) {
            accounts.push(
              makeAccount(input, 'dogecoin', p2pkh(n44.publicKey, DOGECOIN_NETWORK).address, i, {
                path: p44,
                addressType: 'P2PKH (Legacy)',
              }),
            );
          }
        }

        if (targetSet.has('solana')) {
          const stdPath = `m/44'/501'/${i}'/0'`;
          const stdNode = deriveEd25519Path(stdPath, seed);
          const stdAddr = base58.encode(getEd25519PublicKey(stdNode.key));
          accounts.push(
            makeAccount(input, 'solana', stdAddr, i, { path: stdPath, addressType: 'Standard' }),
          );

          const legacyPath = `m/44'/501'/${i}'`;
          const legacyNode = deriveEd25519Path(legacyPath, seed);
          const legacyAddr = base58.encode(getEd25519PublicKey(legacyNode.key));
          if (legacyAddr !== stdAddr) {
            accounts.push(
              makeAccount(input, 'solana', legacyAddr, i, {
                path: legacyPath,
                addressType: 'Legacy',
              }),
            );
          }
        }

        if (targetSet.has('tron')) {
          const tronPath = `m/44'/195'/0'/0/${i}`;
          const tronNode = root.derive(tronPath);
          if (tronNode.privateKey) {
            const uncompressedPub = secp256k1.getPublicKey(tronNode.privateKey, false);
            accounts.push(
              makeAccount(input, 'tron', tronAddressFromUncompressedPub(uncompressedPub), i, {
                path: tronPath,
              }),
            );
          }
        }

        if (targetSet.has('ton') && !tonNativeHandled) {
          const tonPath = `m/44'/607'/${i}'`;
          const tonNode = deriveEd25519Path(tonPath, seed);
          const tonPub = getEd25519PublicKey(tonNode.key);
          const { v4R2, v5R1 } = tonAddressesFromPubKey(tonPub);
          accounts.push(
            makeAccount(input, 'ton', v4R2, i, { path: tonPath, addressType: 'v4R2' }),
            makeAccount(input, 'ton', v5R1, i, { path: tonPath, addressType: 'v5R1' }),
          );
        }

        if (targetSet.has('sui')) {
          const suiPath = `m/44'/784'/${i}'/0'/0'`;
          const suiNode = deriveEd25519Path(suiPath, seed);
          const suiPub = getEd25519PublicKey(suiNode.key);
          accounts.push(
            makeAccount(input, 'sui', suiAddressFromEd25519Pub(suiPub), i, { path: suiPath }),
          );
        }

        if (targetSet.has('aptos')) {
          const aptosPath = `m/44'/637'/${i}'/0'/0'`;
          const aptosNode = deriveEd25519Path(aptosPath, seed);
          const aptosPub = getEd25519PublicKey(aptosNode.key);
          accounts.push(
            makeAccount(input, 'aptos', aptosAddressFromEd25519Pub(aptosPub), i, {
              path: aptosPath,
            }),
          );
        }

        if (targetSet.has('cosmos') || targetSet.has('osmosis') || targetSet.has('celestia')) {
          const cosmosPath = `m/44'/118'/0'/0/${i}`;
          const cosmosNode = root.derive(cosmosPath);
          if (cosmosNode.publicKey) {
            for (const cosmosChain of ['cosmos', 'osmosis', 'celestia'] as const) {
              if (targetSet.has(cosmosChain)) {
                const prefix = CHAIN_CONFIGS[cosmosChain].cosmosPrefix!;
                accounts.push(
                  makeAccount(
                    input,
                    cosmosChain,
                    cosmosAddressFromCompressedPub(cosmosNode.publicKey, prefix),
                    i,
                    { path: cosmosPath },
                  ),
                );
              }
            }
          }
        }

        if (targetSet.has('xrp')) {
          const xrpPath = `m/44'/144'/0'/0/${i}`;
          const xrpNode = root.derive(xrpPath);
          if (xrpNode.publicKey) {
            accounts.push(
              makeAccount(input, 'xrp', xrpAddressFromCompressedPub(xrpNode.publicKey), i, {
                path: xrpPath,
              }),
            );
          }
        }

        if (targetSet.has('stellar')) {
          const stellarPath = `m/44'/148'/${i}'`;
          const stellarNode = deriveEd25519Path(stellarPath, seed);
          const stellarPub = getEd25519PublicKey(stellarNode.key);
          accounts.push(
            makeAccount(input, 'stellar', encodeStellarPublicKey(stellarPub), i, {
              path: stellarPath,
            }),
          );
        }

        if (targetSet.has('near')) {
          const nearPath = `m/44'/397'/${i}'`;
          const nearNode = deriveEd25519Path(nearPath, seed);
          const nearPub = getEd25519PublicKey(nearNode.key);
          accounts.push(
            makeAccount(input, 'near', bytesToHex(nearPub), i, {
              path: nearPath,
              addressType: 'Implicit',
            }),
          );
        }
      }

      return accounts;
    }

    case 'ton_mnemonic': {
      if (!targetSet.has('ton')) return [];
      const words = input.secretOrValue.trim().toLowerCase().split(/\s+/);
      if (!(await mnemonicValidate(words))) {
        return [];
      }
      const kp = await mnemonicToPrivateKey(words);
      const { v4R2, v5R1 } = tonAddressesFromPubKey(kp.publicKey);
      return [
        makeAccount(input, 'ton', v4R2, 0, { path: 'ton-native', addressType: 'v4R2' }),
        makeAccount(input, 'ton', v5R1, 0, { path: 'ton-native', addressType: 'v5R1' }),
      ];
    }

    case 'private_key_hex': {
      const hex = input.secretOrValue.startsWith('0x') || input.secretOrValue.startsWith('0X')
        ? input.secretOrValue.slice(2)
        : input.secretOrValue;
      const privKey = hexToBytes(hex);
      if (privKey.length !== 32 || !secp256k1.utils.isValidSecretKey(privKey)) {
        return [];
      }
      return deriveSecp256k1PrivateKeyAccounts(input, privKey, targetSet);
    }

    case 'private_key_wif': {
      const decoded = decodeWif(input.secretOrValue);
      if (!decoded || !targetSet.has(decoded.chain)) return [];

      const pubKey = secp256k1.getPublicKey(decoded.privateKey, decoded.compressed);
      if (decoded.chain === 'bitcoin') {
        const accounts: DerivedAccount[] = [
          makeAccount(input, 'bitcoin', p2pkh(pubKey, NETWORK).address, 0, {
            addressType: 'P2PKH (Legacy)',
          }),
        ];
        if (decoded.compressed) {
          accounts.push(
            makeAccount(input, 'bitcoin', p2wpkh(pubKey, NETWORK).address, 0, {
              addressType: 'P2WPKH (Native SegWit)',
            }),
          );
        }
        return accounts;
      }

      if (decoded.chain === 'litecoin') {
        const accounts: DerivedAccount[] = [
          makeAccount(input, 'litecoin', p2pkh(pubKey, LITECOIN_NETWORK).address, 0, {
            addressType: 'P2PKH (Legacy)',
          }),
        ];
        if (decoded.compressed) {
          accounts.push(
            makeAccount(input, 'litecoin', p2wpkh(pubKey, LITECOIN_NETWORK).address, 0, {
              addressType: 'P2WPKH (Native SegWit)',
            }),
          );
        }
        return accounts;
      }

      return [
        makeAccount(input, 'dogecoin', p2pkh(pubKey, DOGECOIN_NETWORK).address, 0, {
          addressType: 'P2PKH (Legacy)',
        }),
      ];
    }

    case 'private_key_solana': {
      if (!targetSet.has('solana')) return [];
      const bytes = parseSolanaPrivateKeyBytes(input.secretOrValue);
      let pubKey: Uint8Array;
      if (bytes.length === 64) {
        pubKey = bytes.subarray(32, 64);
      } else if (bytes.length === 32) {
        pubKey = getEd25519PublicKey(bytes);
      } else {
        return [];
      }
      return [makeAccount(input, 'solana', base58.encode(pubKey), 0)];
    }

    case 'private_key_sui': {
      if (!targetSet.has('sui')) return [];
      const decoded = bech32.decodeToBytes(input.secretOrValue);
      if (decoded.prefix !== 'suiprivkey' || decoded.bytes.length !== 33 || decoded.bytes[0] !== 0x00) {
        return [];
      }
      const pubKey = getEd25519PublicKey(decoded.bytes.subarray(1, 33));
      return [makeAccount(input, 'sui', suiAddressFromEd25519Pub(pubKey), 0)];
    }

    case 'private_key_stellar': {
      if (!targetSet.has('stellar')) return [];
      const seed = decodeStellarStrKey(input.secretOrValue.toUpperCase(), 18 << 3);
      if (!seed) return [];
      const pubKey = getEd25519PublicKey(seed);
      return [makeAccount(input, 'stellar', encodeStellarPublicKey(pubKey), 0)];
    }

    case 'private_key_near': {
      if (!targetSet.has('near')) return [];
      const raw = input.secretOrValue.startsWith('ed25519:')
        ? input.secretOrValue.slice('ed25519:'.length)
        : input.secretOrValue;
      const bytes = base58.decode(raw);
      let pubKey: Uint8Array;
      if (bytes.length === 64) {
        pubKey = bytes.subarray(32, 64);
      } else if (bytes.length === 32) {
        pubKey = getEd25519PublicKey(bytes);
      } else {
        return [];
      }
      return [
        makeAccount(input, 'near', bytesToHex(pubKey), 0, { addressType: 'Implicit' }),
      ];
    }

    case 'address': {
      const matches = detectAddressMatches(input.secretOrValue, targetChains, input.explicitChain);
      return matches.map((match) =>
        makeAccount(input, match.chain, match.address, 0, {
          ...(match.addressType ? { addressType: match.addressType } : {}),
        }),
      );
    }
  }
}
