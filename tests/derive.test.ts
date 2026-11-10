import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, hexToBytes } from '@noble/hashes/utils.js';
import { base58, createBase58check } from '@scure/base';
import { mnemonicNew } from '@ton/crypto';
import { describe, expect, it } from 'vitest';
import { ALL_CHAIN_IDS } from '../src/config/chains.js';
import { deriveAccountsForInput } from '../src/crypto/derive.js';
import type { ParsedInput } from '../src/types.js';

const base58check = createBase58check(sha256);

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

function makeMnemonicInput(id = 'input-1'): ParsedInput {
  return {
    id,
    label: 'seed#1 (12w)',
    rawKind: 'mnemonic',
    secretOrValue: TEST_MNEMONIC,
  };
}

describe('deriveAccountsForInput', () => {
  it('derives exact EVM and BTC (BIP44/49/84/86) and Tron addresses for the standard BIP39 test mnemonic', async () => {
    const accounts = await deriveAccountsForInput(
      makeMnemonicInput(),
      ['ethereum', 'arbitrum', 'bitcoin', 'tron'],
      1,
    );

    const eth = accounts.find((a) => a.chain === 'ethereum');
    const arb = accounts.find((a) => a.chain === 'arbitrum');
    expect(eth?.address).toBe('0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
    expect(arb?.address).toBe('0x9858EfFD232B4033E47d90003D41EC34EcaEda94');

    const btcAccounts = accounts.filter((a) => a.chain === 'bitcoin');
    expect(btcAccounts.find((a) => a.path === "m/44'/0'/0'/0/0")?.address).toBe(
      '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA',
    );
    expect(btcAccounts.find((a) => a.path === "m/49'/0'/0'/0/0")?.address).toBe(
      '37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf',
    );
    expect(btcAccounts.find((a) => a.path === "m/84'/0'/0'/0/0")?.address).toBe(
      'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
    );
    expect(btcAccounts.find((a) => a.path === "m/86'/0'/0'/0/0")?.address).toBe(
      'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr',
    );

    const tron = accounts.find((a) => a.chain === 'tron');
    expect(tron?.address).toBe('TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH');
  });

  it('derives valid formatted addresses for LTC, DOGE, Solana, TON, Sui, Aptos, Cosmos, Osmosis, Celestia, XRP, Stellar, NEAR across accountCount = 2', async () => {
    const targetChains = [
      'litecoin',
      'dogecoin',
      'solana',
      'ton',
      'sui',
      'aptos',
      'cosmos',
      'osmosis',
      'celestia',
      'xrp',
      'stellar',
      'near',
    ] as const;

    const accounts = await deriveAccountsForInput(
      makeMnemonicInput(),
      [...targetChains],
      2,
    );

    // LTC: 2 types x 2 accounts
    const ltc = accounts.filter((a) => a.chain === 'litecoin');
    expect(ltc).toHaveLength(4);
    expect(ltc.some((a) => a.address.startsWith('L') && a.accountIndex === 0)).toBe(true);
    expect(ltc.some((a) => a.address.startsWith('ltc1q') && a.accountIndex === 1)).toBe(true);

    // DOGE: 1 type x 2 accounts
    const doge = accounts.filter((a) => a.chain === 'dogecoin');
    expect(doge).toHaveLength(2);
    expect(doge.every((a) => a.address.startsWith('D'))).toBe(true);
    expect(doge[0].address).not.toBe(doge[1].address);

    // Solana: standard m/44'/501'/i'/0' + legacy m/44'/501'/i'
    const sol = accounts.filter((a) => a.chain === 'solana');
    const solStd0 = sol.find((a) => a.path === "m/44'/501'/0'/0'");
    const solStd1 = sol.find((a) => a.path === "m/44'/501'/1'/0'");
    expect(solStd0).toBeDefined();
    expect(solStd1).toBeDefined();
    expect(base58.decode(solStd0!.address)).toHaveLength(32);
    expect(solStd0!.address).not.toBe(solStd1!.address);

    // TON: v4R2 + v5R1 across 2 indices
    const ton = accounts.filter((a) => a.chain === 'ton');
    expect(ton.some((a) => a.addressType === 'v4R2' && a.address.startsWith('UQ'))).toBe(true);
    expect(ton.some((a) => a.addressType === 'v5R1' && a.address.startsWith('UQ'))).toBe(true);
    expect(ton.filter((a) => a.accountIndex === 1).length).toBeGreaterThanOrEqual(2);

    // Sui
    const sui = accounts.filter((a) => a.chain === 'sui');
    expect(sui).toHaveLength(2);
    expect(sui.every((a) => /^0x[0-9a-f]{64}$/.test(a.address))).toBe(true);
    expect(sui[0].address).not.toBe(sui[1].address);

    // Aptos
    const aptos = accounts.filter((a) => a.chain === 'aptos');
    expect(aptos).toHaveLength(2);
    expect(aptos.every((a) => /^0x[0-9a-f]{64}$/.test(a.address))).toBe(true);
    expect(aptos[0].address).not.toBe(aptos[1].address);

    // Cosmos / Osmosis / Celestia
    const cosmos = accounts.filter((a) => a.chain === 'cosmos');
    const osmo = accounts.filter((a) => a.chain === 'osmosis');
    const tia = accounts.filter((a) => a.chain === 'celestia');
    expect(cosmos).toHaveLength(2);
    expect(osmo).toHaveLength(2);
    expect(tia).toHaveLength(2);
    expect(cosmos.every((a) => a.address.startsWith('cosmos1'))).toBe(true);
    expect(osmo.every((a) => a.address.startsWith('osmo1'))).toBe(true);
    expect(tia.every((a) => a.address.startsWith('celestia1'))).toBe(true);
    expect(cosmos[0].address).not.toBe(cosmos[1].address);

    // XRP
    const xrp = accounts.filter((a) => a.chain === 'xrp');
    expect(xrp).toHaveLength(2);
    expect(xrp.every((a) => a.address.startsWith('r') && a.address.length >= 25)).toBe(true);
    expect(xrp[0].address).not.toBe(xrp[1].address);

    // Stellar
    const xlm = accounts.filter((a) => a.chain === 'stellar');
    expect(xlm).toHaveLength(2);
    expect(xlm.every((a) => a.address.startsWith('G') && a.address.length === 56)).toBe(true);
    expect(xlm[0].address).not.toBe(xlm[1].address);

    // NEAR
    const near = accounts.filter((a) => a.chain === 'near');
    expect(near).toHaveLength(2);
    expect(near.every((a) => /^[0-9a-f]{64}$/.test(a.address))).toBe(true);
    expect(near[0].address).not.toBe(near[1].address);
  });

  it('derives expected target chains from WIF, 32-byte hex private key, Solana 64-byte base58 key, and raw addresses', async () => {
    // 1. WIF (privKey = 0x0000...0001 compressed BTC)
    const priv1 = hexToBytes('0000000000000000000000000000000000000000000000000000000000000001');
    const btcWif = base58check.encode(concatBytes(new Uint8Array([0x80]), priv1, new Uint8Array([0x01])));
    const wifAccounts = await deriveAccountsForInput(
      {
        id: 'wif-1',
        label: 'key#1 (wif)',
        rawKind: 'private_key_wif',
        secretOrValue: btcWif,
      },
      ALL_CHAIN_IDS,
      1,
    );
    expect(wifAccounts.every((a) => a.chain === 'bitcoin')).toBe(true);
    expect(wifAccounts.map((a) => a.address)).toEqual([
      '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH',
      'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    ]);

    // 2. 32-byte hex private key (privKey = 0x0000...0001)
    const hexAccounts = await deriveAccountsForInput(
      {
        id: 'hex-1',
        label: 'key#2 (hex)',
        rawKind: 'private_key_hex',
        secretOrValue: '0000000000000000000000000000000000000000000000000000000000000001',
      },
      ['ethereum', 'bitcoin', 'tron', 'cosmos', 'xrp', 'solana'],
      1,
    );
    expect(hexAccounts.find((a) => a.chain === 'ethereum')?.address).toBe(
      '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
    );
    expect(hexAccounts.some((a) => a.chain === 'bitcoin')).toBe(true);
    expect(hexAccounts.some((a) => a.chain === 'tron')).toBe(true);
    expect(hexAccounts.some((a) => a.chain === 'cosmos')).toBe(true);
    expect(hexAccounts.some((a) => a.chain === 'xrp')).toBe(true);
    expect(hexAccounts.some((a) => a.chain === 'solana')).toBe(false);

    // 3. Solana 64-byte base58 private key
    const solSeed = hexToBytes('44'.repeat(32));
    const solPub = ed25519.getPublicKey(solSeed);
    const solB58 = base58.encode(concatBytes(solSeed, solPub));
    const solAccounts = await deriveAccountsForInput(
      {
        id: 'sol-1',
        label: 'key#3 (sol)',
        rawKind: 'private_key_solana',
        secretOrValue: solB58,
      },
      ALL_CHAIN_IDS,
      1,
    );
    expect(solAccounts).toHaveLength(1);
    expect(solAccounts[0].chain).toBe('solana');
    expect(solAccounts[0].address).toBe(base58.encode(solPub));

    // 4. Raw address (EVM fans out to EVM chains; explicitChain restricts to single chain)
    const evmAddr = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
    const rawEvmAccounts = await deriveAccountsForInput(
      {
        id: 'addr-1',
        label: 'addr#1',
        rawKind: 'address',
        secretOrValue: evmAddr,
      },
      ['ethereum', 'base', 'bitcoin'],
      1,
    );
    expect(rawEvmAccounts.map((a) => a.chain)).toEqual(['ethereum', 'base']);

    const explicitSui = await deriveAccountsForInput(
      {
        id: 'addr-2',
        label: 'addr#2',
        rawKind: 'address',
        secretOrValue: `0x${'ab'.repeat(32)}`,
        explicitChain: 'sui',
      },
      ['sui', 'aptos'],
      1,
    );
    expect(explicitSui).toHaveLength(1);
    expect(explicitSui[0].chain).toBe('sui');
  });

  it('derives TON v4R2 and v5R1 addresses from a TON native 24-word mnemonic', async () => {
    const words = await mnemonicNew(24);
    const accounts = await deriveAccountsForInput(
      {
        id: 'ton-1',
        label: 'seed#1 (24w-ton)',
        rawKind: 'ton_mnemonic',
        secretOrValue: words.join(' '),
      },
      ['ethereum', 'ton'],
      1,
    );

    expect(accounts).toHaveLength(2);
    expect(accounts.every((a) => a.chain === 'ton' && a.path === 'ton-native')).toBe(true);
    expect(accounts[0].addressType).toBe('v4R2');
    expect(accounts[1].addressType).toBe('v5R1');
    expect(accounts[0].address).toMatch(/^[EU]Q[A-Za-z0-9_-]{46}$/);
    expect(accounts[1].address).toMatch(/^[EU]Q[A-Za-z0-9_-]{46}$/);
  });
});
