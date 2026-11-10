import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, hexToBytes } from '@noble/hashes/utils.js';
import { base32nopad, base58, bech32, createBase58check } from '@scure/base';
import { generateMnemonic } from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js';
import { afterEach, describe, expect, it } from 'vitest';
import { loadInputs, parseInputsFromText } from '../src/input/parser.js';

const base58check = createBase58check(sha256);

const MNEMONIC_12 =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const MNEMONIC_24 = generateMnemonic(englishWordlist, 256);

function makeWif(privHex: string, compressed: boolean, version = 0x80): string {
  const keyBytes = hexToBytes(privHex);
  const payload = compressed
    ? concatBytes(new Uint8Array([version]), keyBytes, new Uint8Array([0x01]))
    : concatBytes(new Uint8Array([version]), keyBytes);
  return base58check.encode(payload);
}

function makeSuiPrivKey(privHex: string): string {
  const keyBytes = hexToBytes(privHex);
  const payload = concatBytes(new Uint8Array([0x00]), keyBytes);
  return bech32.encode('suiprivkey', bech32.toWords(payload));
}

function crc16XModem(data: Uint8Array): number {
  let crc = 0x0000;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function makeStellarStrKey(version: number, key32: Uint8Array): string {
  const payload = new Uint8Array(35);
  payload[0] = version;
  payload.set(key32, 1);
  const crc = crc16XModem(payload.subarray(0, 33));
  payload[33] = crc & 0xff;
  payload[34] = (crc >> 8) & 0xff;
  return base32nopad.encode(payload);
}

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'walletor-parser-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('parseInputsFromText', () => {
  it('parses standard 12-word and 24-word BIP39 mnemonics without leaking secrets in labels', async () => {
    const parsed = await parseInputsFromText(`${MNEMONIC_12}\n${MNEMONIC_24}`);
    expect(parsed).toHaveLength(2);

    expect(parsed[0].rawKind).toBe('mnemonic');
    expect(parsed[0].secretOrValue).toBe(MNEMONIC_12);
    expect(parsed[0].label).toBe('seed#1 (12w)');
    expect(parsed[0].label).not.toContain('abandon');

    expect(parsed[1].rawKind).toBe('mnemonic');
    expect(parsed[1].secretOrValue).toBe(MNEMONIC_24);
    expect(parsed[1].label).toBe('seed#2 (24w)');
    for (const word of MNEMONIC_24.split(' ')) {
      expect(parsed[1].label).not.toContain(word);
    }
  });

  it('parses hex private keys with and without 0x prefix without leaking secrets in labels', async () => {
    const hexNoPrefix = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const hexWithPrefix = `0x${'abcdef0123456789'.repeat(4)}`;

    const parsed = await parseInputsFromText(`${hexNoPrefix}\n${hexWithPrefix}`);
    expect(parsed).toHaveLength(2);

    expect(parsed[0].rawKind).toBe('private_key_hex');
    expect(parsed[0].secretOrValue).toBe(hexNoPrefix);
    expect(parsed[0].label).toBe('key#1 (hex)');
    expect(parsed[0].label).not.toContain(hexNoPrefix.slice(0, 8));

    expect(parsed[1].rawKind).toBe('private_key_hex');
    expect(parsed[1].secretOrValue).toBe(hexWithPrefix.slice(2));
    expect(parsed[1].label).toBe('key#2 (hex)');
    expect(parsed[1].label).not.toContain('abcdef01');
  });

  it('parses BTC WIF private keys (5..., K..., L...)', async () => {
    const wifUncompressed5 = makeWif(
      '0000000000000000000000000000000000000000000000000000000000000001',
      false,
    );
    const wifCompressedK = makeWif(
      '0000000000000000000000000000000000000000000000000000000000000001',
      true,
    );
    const wifCompressedL = makeWif(
      '8000000000000000000000000000000000000000000000000000000000000001',
      true,
    );

    expect(wifUncompressed5.startsWith('5')).toBe(true);
    expect(wifCompressedK.startsWith('K')).toBe(true);
    expect(wifCompressedL.startsWith('L')).toBe(true);

    const parsed = await parseInputsFromText(
      `${wifUncompressed5}\n${wifCompressedK}\n${wifCompressedL}`,
    );
    expect(parsed).toHaveLength(3);
    for (const [idx, item] of parsed.entries()) {
      expect(item.rawKind).toBe('private_key_wif');
      expect(item.label).toBe(`key#${idx + 1} (wif)`);
      expect(item.label).not.toContain(item.secretOrValue.slice(0, 6));
    }
  });

  it('parses Solana base58 64-byte and JSON byte-array private keys', async () => {
    const seed32 = hexToBytes('11'.repeat(32));
    const pub32 = ed25519.getPublicKey(seed32);
    const keypair64 = concatBytes(seed32, pub32);
    const base58Key = base58.encode(keypair64);
    const jsonKey = JSON.stringify(Array.from(keypair64));

    const parsed = await parseInputsFromText(`${base58Key}\n${jsonKey}`);
    expect(parsed).toHaveLength(2);

    expect(parsed[0].rawKind).toBe('private_key_solana');
    expect(parsed[0].secretOrValue).toBe(base58Key);
    expect(parsed[0].label).toBe('key#1 (sol)');
    expect(parsed[0].label).not.toContain(base58Key.slice(0, 8));

    expect(parsed[1].rawKind).toBe('private_key_solana');
    expect(parsed[1].secretOrValue).toBe(jsonKey);
    expect(parsed[1].label).toBe('key#2 (sol)');
    expect(parsed[1].label).not.toContain('[');
  });

  it('parses Sui suiprivkey1..., Stellar S..., and NEAR ed25519:... private keys', async () => {
    const seed32 = hexToBytes('22'.repeat(32));
    const pub32 = ed25519.getPublicKey(seed32);

    const suiPriv = makeSuiPrivKey('22'.repeat(32));
    const stellarPriv = makeStellarStrKey(18 << 3, seed32);
    const nearPriv = `ed25519:${base58.encode(concatBytes(seed32, pub32))}`;

    expect(suiPriv.startsWith('suiprivkey1')).toBe(true);
    expect(stellarPriv.startsWith('S')).toBe(true);

    const parsed = await parseInputsFromText(`${suiPriv}\n${stellarPriv}\n${nearPriv}`);
    expect(parsed).toHaveLength(3);

    expect(parsed[0].rawKind).toBe('private_key_sui');
    expect(parsed[0].secretOrValue).toBe(suiPriv);
    expect(parsed[0].label).toBe('key#1 (sui)');
    expect(parsed[0].label).not.toContain(suiPriv.slice(0, 14));

    expect(parsed[1].rawKind).toBe('private_key_stellar');
    expect(parsed[1].secretOrValue).toBe(stellarPriv);
    expect(parsed[1].label).toBe('key#2 (xlm)');
    expect(parsed[1].label).not.toContain(stellarPriv.slice(0, 8));

    expect(parsed[2].rawKind).toBe('private_key_near');
    expect(parsed[2].secretOrValue).toBe(nearPriv);
    expect(parsed[2].label).toBe('key#3 (near)');
    expect(parsed[2].label).not.toContain(nearPriv.slice(8, 16));
  });

  it('parses raw addresses across all supported chain formats', async () => {
    const stellarPub = makeStellarStrKey(6 << 3, hexToBytes('33'.repeat(32)));
    const rawAddresses = [
      '0x9858EfFD232B4033E47d90003D41EC34EcaEda94', // EVM
      'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', // BTC bech32
      '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA', // BTC P2PKH
      '37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf', // BTC P2SH
      '11111111111111111111111111111111', // SOL (32 zero bytes)
      'TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH', // TRX
      'EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2', // TON EQ...
      'UQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p9CU', // TON UQ...
      `0x${'ab'.repeat(32)}`, // Note: valid secp256k1 key unless prefixed; let's test explicit below and unprefixed non-key or raw
      bech32.encode('cosmos', bech32.toWords(new Uint8Array(20).fill(1))),
      bech32.encode('osmo', bech32.toWords(new Uint8Array(20).fill(2))),
      bech32.encode('celestia', bech32.toWords(new Uint8Array(20).fill(3))),
      'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh', // XRP
      stellarPub, // Stellar G...
      'alice.near', // NEAR named
      '44'.repeat(32), // Note: 64 hex without 0x is also valid secp256k1 key unless prefixed or >= N
    ];

    // Replace the two 64-hex raw strings with > secp256k1 order N (0xff...ff) so they are unambiguously addresses even unprefixed
    rawAddresses[8] = `0x${'ff'.repeat(32)}`;
    rawAddresses[15] = 'ff'.repeat(32);

    const parsed = await parseInputsFromText(rawAddresses.join('\n'));
    expect(parsed).toHaveLength(rawAddresses.length);
    for (const item of parsed) {
      expect(item.rawKind).toBe('address');
      expect(item.label.startsWith('addr#')).toBe(true);
    }
  });

  it('parses explicit chain:value prefixes (sui:0x..., aptos:0x..., ethereum:0x...)', async () => {
    // Use a valid 32-byte hex that WOULD otherwise look like a private key if unprefixed
    const sixtyFourHex = `0x${'12'.repeat(32)}`;
    const evmAddr = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';

    const parsed = await parseInputsFromText(
      `sui:${sixtyFourHex}\naptos:${sixtyFourHex}\nethereum:${evmAddr}`,
    );
    expect(parsed).toHaveLength(3);

    expect(parsed[0]).toMatchObject({
      rawKind: 'address',
      explicitChain: 'sui',
      secretOrValue: sixtyFourHex,
    });
    expect(parsed[1]).toMatchObject({
      rawKind: 'address',
      explicitChain: 'aptos',
      secretOrValue: sixtyFourHex,
    });
    expect(parsed[2]).toMatchObject({
      rawKind: 'address',
      explicitChain: 'ethereum',
      secretOrValue: evmAddr,
    });
  });

  it('ignores comments (# ...) and blank lines', async () => {
    const text = [
      '# header comment',
      '',
      '   ',
      '// another comment',
      '# 0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
      '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
      '',
      '# trailing comment',
    ].join('\n');

    const parsed = await parseInputsFromText(text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].rawKind).toBe('address');
    expect(parsed[0].secretOrValue).toBe('0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
  });

  it('loads .csv and .json files via temp dir without leaking secrets in labels', async () => {
    const dir = createTempDir();
    const csvPath = join(dir, 'wallets.csv');
    const jsonPath = join(dir, 'wallets.json');

    const hexKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const sixtyFourHex = `0x${'12'.repeat(32)}`;

    writeFileSync(
      csvPath,
      [
        '# comment row',
        'chain,value',
        `sui,${sixtyFourHex}`,
        `,"${MNEMONIC_12}"`,
        `ethereum,0x9858EfFD232B4033E47d90003D41EC34EcaEda94`,
      ].join('\n'),
      'utf8',
    );

    const solBytes = Array.from(
      concatBytes(hexToBytes('11'.repeat(32)), ed25519.getPublicKey(hexToBytes('11'.repeat(32)))),
    );
    writeFileSync(
      jsonPath,
      JSON.stringify([
        { mnemonic: MNEMONIC_12 },
        { privateKey: hexKey },
        { chain: 'aptos', address: sixtyFourHex },
        { secret: solBytes },
      ]),
      'utf8',
    );

    const csvParsed = await loadInputs(csvPath);
    expect(csvParsed).toHaveLength(3);
    expect(csvParsed[0]).toMatchObject({ rawKind: 'address', explicitChain: 'sui' });
    expect(csvParsed[1]).toMatchObject({ rawKind: 'mnemonic', label: 'seed#2 (12w)' });
    expect(csvParsed[2]).toMatchObject({ rawKind: 'address', explicitChain: 'ethereum' });

    const jsonParsed = await loadInputs(jsonPath);
    expect(jsonParsed).toHaveLength(4);
    expect(jsonParsed[0]).toMatchObject({ rawKind: 'mnemonic', label: 'seed#1 (12w)' });
    expect(jsonParsed[1]).toMatchObject({ rawKind: 'private_key_hex', label: 'key#2 (hex)' });
    expect(jsonParsed[2]).toMatchObject({ rawKind: 'address', explicitChain: 'aptos' });
    expect(jsonParsed[3]).toMatchObject({ rawKind: 'private_key_solana', label: 'key#4 (sol)' });

    for (const item of [...csvParsed, ...jsonParsed]) {
      expect(item.label).not.toContain('abandon');
      expect(item.label).not.toContain('01234567');
    }
  });
});
