import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { hexToBytes } from '@noble/hashes/utils.js';
import { base58, bech32 } from '@scure/base';
import { validateMnemonic } from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js';
import { mnemonicValidate } from '@ton/crypto';
import { ALL_CHAIN_IDS } from '../config/chains.js';
import {
  decodeStellarStrKey,
  decodeWif,
  detectAddressMatches,
} from '../crypto/derive.js';
import type { ChainId, InputType, ParsedInput } from '../types.js';

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

const VALID_MNEMONIC_WORD_COUNTS = new Set([12, 15, 18, 21, 24]);

function shortAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 5)}...${address.slice(-3)}`;
}

function buildSafeLabel(index: number, kind: InputType, value: string): string {
  switch (kind) {
    case 'mnemonic': {
      const count = value.trim().split(/\s+/).length;
      return `seed#${index} (${count}w)`;
    }
    case 'ton_mnemonic': {
      const count = value.trim().split(/\s+/).length;
      return `seed#${index} (${count}w-ton)`;
    }
    case 'private_key_hex':
      return `key#${index} (hex)`;
    case 'private_key_wif':
      return `key#${index} (wif)`;
    case 'private_key_solana':
      return `key#${index} (sol)`;
    case 'private_key_sui':
      return `key#${index} (sui)`;
    case 'private_key_stellar':
      return `key#${index} (xlm)`;
    case 'private_key_near':
      return `key#${index} (near)`;
    case 'address':
      return `addr#${index} (${shortAddress(value)})`;
  }
}

function splitChainPrefix(raw: string): {
  explicitChain?: ChainId;
  forceHint?: 'key' | 'address';
  value: string;
} {
  const colonIdx = raw.indexOf(':');
  if (colonIdx <= 0) {
    return { value: raw };
  }

  const prefix = raw.slice(0, colonIdx).trim().toLowerCase();
  const rest = raw.slice(colonIdx + 1).trim();
  if (!rest) {
    return { value: raw };
  }

  if (prefix === 'key' || prefix === 'priv' || prefix === 'private') {
    return { forceHint: 'key', value: rest };
  }
  if (prefix === 'addr' || prefix === 'address') {
    return { forceHint: 'address', value: rest };
  }

  const mappedChain = CHAIN_ALIASES[prefix];
  if (mappedChain) {
    return { explicitChain: mappedChain, value: rest };
  }

  return { value: raw };
}

function parseSolanaJsonKeypair(raw: string): Uint8Array | null {
  if (!raw.startsWith('[') || !raw.endsWith(']')) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || (parsed.length !== 32 && parsed.length !== 64)) {
      return null;
    }
    const bytes = new Uint8Array(parsed.length);
    for (let i = 0; i < parsed.length; i++) {
      const n = parsed[i];
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 255) {
        return null;
      }
      bytes[i] = n;
    }
    return bytes;
  } catch {
    return null;
  }
}

async function classifyToken(
  rawItem: string,
  index: number,
): Promise<ParsedInput | null> {
  const trimmed = rawItem.trim();
  if (!trimmed) return null;

  const { explicitChain, forceHint, value } = splitChainPrefix(trimmed);
  if (!value) return null;

  // 1. Mnemonic (BIP39 or TON native)
  const words = value.toLowerCase().split(/\s+/);
  if (
    VALID_MNEMONIC_WORD_COUNTS.has(words.length) &&
    words.every((w) => /^[a-z]+$/.test(w))
  ) {
    const normalized = words.join(' ');
    if (validateMnemonic(normalized, englishWordlist)) {
      return {
        id: `input-${index}`,
        label: buildSafeLabel(index, 'mnemonic', normalized),
        rawKind: 'mnemonic',
        secretOrValue: normalized,
        ...(explicitChain ? { explicitChain } : {}),
      };
    }
    if (await mnemonicValidate(words)) {
      return {
        id: `input-${index}`,
        label: buildSafeLabel(index, 'ton_mnemonic', normalized),
        rawKind: 'ton_mnemonic',
        secretOrValue: normalized,
        ...(explicitChain ? { explicitChain } : {}),
      };
    }
    return null;
  }

  // 2. JSON byte array Solana keypair
  if (parseSolanaJsonKeypair(value) !== null) {
    return {
      id: `input-${index}`,
      label: buildSafeLabel(index, 'private_key_solana', value),
      rawKind: 'private_key_solana',
      secretOrValue: value,
      ...(explicitChain ? { explicitChain } : {}),
    };
  }

  // 3. Explicit address hint or chain-qualified address forms (sui:0x..., aptos:0x..., near:<64hex>)
  if (
    forceHint === 'address' ||
    ((explicitChain === 'sui' || explicitChain === 'aptos') && /^0x[0-9a-fA-F]{64}$/.test(value)) ||
    (explicitChain === 'near' && /^[0-9a-fA-F]{64}$/.test(value))
  ) {
    const matches = detectAddressMatches(value, ALL_CHAIN_IDS, explicitChain);
    if (matches.length > 0) {
      return {
        id: `input-${index}`,
        label: buildSafeLabel(index, 'address', value),
        rawKind: 'address',
        secretOrValue: value,
        ...(explicitChain ? { explicitChain } : {}),
      };
    }
    return null;
  }

  // 4. Sui Bech32 private key (suiprivkey1...)
  if (value.toLowerCase().startsWith('suiprivkey1')) {
    try {
      const decoded = bech32.decodeToBytes(value.toLowerCase());
      if (decoded.prefix === 'suiprivkey' && decoded.bytes.length === 33 && decoded.bytes[0] === 0x00) {
        return {
          id: `input-${index}`,
          label: buildSafeLabel(index, 'private_key_sui', value),
          rawKind: 'private_key_sui',
          secretOrValue: value.toLowerCase(),
          ...(explicitChain ? { explicitChain } : {}),
        };
      }
    } catch {
      // ignore
    }
  }

  // 5. NEAR ed25519:<base58> private key
  if (value.startsWith('ed25519:')) {
    const body = value.slice('ed25519:'.length);
    try {
      const decoded = base58.decode(body);
      if (decoded.length === 32 || decoded.length === 64) {
        return {
          id: `input-${index}`,
          label: buildSafeLabel(index, 'private_key_near', value),
          rawKind: 'private_key_near',
          secretOrValue: value,
          ...(explicitChain ? { explicitChain } : {}),
        };
      }
    } catch {
      // ignore
    }
  }

  // 6. Stellar S... StrKey secret seed
  if (value.length === 56 && value.toUpperCase().startsWith('S')) {
    const seed = decodeStellarStrKey(value.toUpperCase(), 18 << 3);
    if (seed) {
      return {
        id: `input-${index}`,
        label: buildSafeLabel(index, 'private_key_stellar', value),
        rawKind: 'private_key_stellar',
        secretOrValue: value.toUpperCase(),
        ...(explicitChain ? { explicitChain } : {}),
      };
    }
  }

  // 7. WIF private key (BTC/LTC/DOGE)
  if (decodeWif(value) !== null) {
    return {
      id: `input-${index}`,
      label: buildSafeLabel(index, 'private_key_wif', value),
      rawKind: 'private_key_wif',
      secretOrValue: value,
      ...(explicitChain ? { explicitChain } : {}),
    };
  }

  // 8. 64-byte Base58 Solana keypair (or 32-byte Base58 explicitly hinted as key:)
  if (/^[1-9A-HJ-NP-Za-km-z]{32,96}$/.test(value)) {
    try {
      const decoded = base58.decode(value);
      if (decoded.length === 64 || (forceHint === 'key' && decoded.length === 32)) {
        return {
          id: `input-${index}`,
          label: buildSafeLabel(index, 'private_key_solana', value),
          rawKind: 'private_key_solana',
          secretOrValue: value,
          ...(explicitChain ? { explicitChain } : {}),
        };
      }
    } catch {
      // ignore
    }
  }

  // 9. 32-byte hex private key (with or without 0x)
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(value)) {
    const cleanHex = value.startsWith('0x') || value.startsWith('0X') ? value.slice(2) : value;
    const privBytes = hexToBytes(cleanHex);
    if (secp256k1.utils.isValidSecretKey(privBytes)) {
      return {
        id: `input-${index}`,
        label: buildSafeLabel(index, 'private_key_hex', value),
        rawKind: 'private_key_hex',
        secretOrValue: cleanHex,
        ...(explicitChain ? { explicitChain } : {}),
      };
    }
  }

  // 10. Raw addresses
  const matches = detectAddressMatches(value, ALL_CHAIN_IDS, explicitChain);
  if (matches.length > 0) {
    return {
      id: `input-${index}`,
      label: buildSafeLabel(index, 'address', value),
      rawKind: 'address',
      secretOrValue: value,
      ...(explicitChain ? { explicitChain } : {}),
    };
  }

  return null;
}

function stripInlineComment(line: string): string {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
    return '';
  }
  return trimmed;
}

function tokenizeLine(line: string): string[] {
  const cleaned = stripInlineComment(line);
  if (!cleaned) return [];

  // JSON array keypair on its own line
  if (parseSolanaJsonKeypair(cleaned) !== null) {
    return [cleaned];
  }

  // Entire line (or chain:mnemonic) is a mnemonic phrase
  const { value } = splitChainPrefix(cleaned);
  const words = value.trim().split(/\s+/);
  if (
    VALID_MNEMONIC_WORD_COUNTS.has(words.length) &&
    words.every((w) => /^[a-zA-Z]+$/.test(w))
  ) {
    return [cleaned];
  }

  // Otherwise split by commas, semicolons, or whitespace
  return cleaned
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export async function parseInputsFromText(rawText: string): Promise<ParsedInput[]> {
  const results: ParsedInput[] = [];
  const seen = new Set<string>();
  const lines = rawText.split(/\r?\n/);

  for (const line of lines) {
    const tokens = tokenizeLine(line);
    for (const token of tokens) {
      const parsed = await classifyToken(token, results.length + 1);
      if (!parsed) continue;
      const dedupeKey = `${parsed.rawKind}:${parsed.explicitChain ?? ''}:${parsed.secretOrValue}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      results.push(parsed);
    }
  }

  return results;
}

function splitCsvRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

async function parseCsvInputs(content: string): Promise<ParsedInput[]> {
  const candidateLines: string[] = [];
  const rows = content.split(/\r?\n/);

  for (const row of rows) {
    const cleaned = stripInlineComment(row);
    if (!cleaned) continue;

    const cells = splitCsvRow(cleaned).filter(Boolean);
    if (cells.length === 0) continue;

    let rowChain: ChainId | undefined;
    for (const cell of cells) {
      const mapped = CHAIN_ALIASES[cell.toLowerCase()];
      if (mapped) {
        rowChain = mapped;
        break;
      }
    }

    for (const cell of cells) {
      if (CHAIN_ALIASES[cell.toLowerCase()]) continue;
      candidateLines.push(rowChain && !cell.includes(':') ? `${rowChain}:${cell}` : cell);
    }
  }

  return parseInputsFromText(candidateLines.join('\n'));
}

function extractJsonCandidates(node: unknown, out: string[]): void {
  if (typeof node === 'string') {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    // Check if this is a Solana byte-array keypair
    if (
      (node.length === 32 || node.length === 64) &&
      node.every((v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 255)
    ) {
      out.push(JSON.stringify(node));
      return;
    }
    for (const item of node) {
      extractJsonCandidates(item, out);
    }
    return;
  }
  if (node !== null && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    const chainVal =
      typeof record.chain === 'string'
        ? CHAIN_ALIASES[record.chain.trim().toLowerCase()]
        : typeof record.network === 'string'
          ? CHAIN_ALIASES[record.network.trim().toLowerCase()]
          : undefined;

    const valueKeys = [
      'mnemonic',
      'seed',
      'phrase',
      'privateKey',
      'private_key',
      'key',
      'secret',
      'address',
      'value',
      'input',
    ];
    let matchedValueKey = false;
    for (const k of valueKeys) {
      const v = record[k];
      if (typeof v === 'string' && v.trim()) {
        matchedValueKey = true;
        const trimmed = v.trim();
        out.push(chainVal && !trimmed.includes(':') ? `${chainVal}:${trimmed}` : trimmed);
      } else if (Array.isArray(v)) {
        matchedValueKey = true;
        extractJsonCandidates(v, out);
      }
    }

    if (!matchedValueKey) {
      for (const v of Object.values(record)) {
        extractJsonCandidates(v, out);
      }
    }
  }
}

async function parseJsonInputs(content: string): Promise<ParsedInput[]> {
  const parsed = JSON.parse(content) as unknown;
  const candidates: string[] = [];
  extractJsonCandidates(parsed, candidates);
  return parseInputsFromText(candidates.join('\n'));
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : (chunk as Buffer));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function loadInputs(target: string): Promise<ParsedInput[]> {
  if (target === '-') {
    const stdinText = await readStdin();
    return parseInputsFromText(stdinText);
  }

  let isFile = false;
  try {
    isFile = statSync(target).isFile();
  } catch {
    isFile = false;
  }

  if (!isFile) {
    return parseInputsFromText(target);
  }

  const content = readFileSync(target, 'utf8');
  const ext = extname(target).toLowerCase();

  if (ext === '.json') {
    return parseJsonInputs(content);
  }
  if (ext === '.csv') {
    return parseCsvInputs(content);
  }
  return parseInputsFromText(content);
}
