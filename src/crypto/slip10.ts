import { ed25519 } from '@noble/curves/ed25519.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';

const HARDENED_OFFSET = 0x80000000;
const ED25519_SEED_KEY = utf8ToBytes('ed25519 seed');

export interface Slip10Node {
  key: Uint8Array;
  chainCode: Uint8Array;
}

/**
 * Pure-TypeScript SLIP-0010 Ed25519 HD key derivation.
 * Ed25519 in SLIP-0010 only supports hardened derivation indices.
 */
export function deriveEd25519Path(path: string, seed: Uint8Array): Slip10Node {
  if (!(seed instanceof Uint8Array) || seed.length === 0) {
    throw new Error('SLIP-0010 seed must be a non-empty Uint8Array');
  }

  let digest = hmac(sha512, ED25519_SEED_KEY, seed);
  let key = new Uint8Array(digest.subarray(0, 32));
  let chainCode = new Uint8Array(digest.subarray(32, 64));

  const trimmed = path.trim();
  if (trimmed === '' || trimmed === 'm' || trimmed === 'M') {
    return { key, chainCode };
  }

  const segments = trimmed.split('/');
  const startIndex = segments[0] === 'm' || segments[0] === 'M' ? 1 : 0;

  for (let i = startIndex; i < segments.length; i++) {
    const segment = segments[i];
    if (!segment) {
      throw new Error(`Invalid SLIP-0010 path segment in "${path}"`);
    }
    if (!segment.endsWith("'") && !segment.endsWith('h')) {
      throw new Error(`SLIP-0010 Ed25519 requires hardened derivation (got "${segment}" in "${path}")`);
    }

    const indexStr = segment.slice(0, -1);
    if (!/^\d+$/.test(indexStr)) {
      throw new Error(`Invalid SLIP-0010 path index "${segment}" in "${path}"`);
    }

    const index = Number(indexStr);
    if (!Number.isSafeInteger(index) || index < 0 || index >= HARDENED_OFFSET) {
      throw new Error(`SLIP-0010 index out of range: "${segment}"`);
    }

    const data = new Uint8Array(37);
    data[0] = 0x00;
    data.set(key, 1);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    view.setUint32(33, (HARDENED_OFFSET + index) >>> 0, false);

    digest = hmac(sha512, chainCode, data);
    key = new Uint8Array(digest.subarray(0, 32));
    chainCode = new Uint8Array(digest.subarray(32, 64));
  }

  return { key, chainCode };
}

export function getEd25519PublicKey(privKey32: Uint8Array): Uint8Array {
  if (!(privKey32 instanceof Uint8Array) || privKey32.length !== 32) {
    throw new Error('Ed25519 private key must be exactly 32 bytes');
  }
  return new Uint8Array(ed25519.getPublicKey(privKey32));
}
