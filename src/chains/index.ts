import type { AccountBalanceResult, DerivedAccount } from '../types.js';
import { fetchAptosBalance } from './aptos.js';
import { fetchCosmosBalance } from './cosmos.js';
import { fetchEvmBalance } from './evm.js';
import { fetchNearBalance } from './near.js';
import { fetchSolanaBalance } from './solana.js';
import { fetchStellarBalance } from './stellar.js';
import { fetchSuiBalance } from './sui.js';
import { fetchTonBalance } from './ton.js';
import { fetchTronBalance } from './tron.js';
import { type BalanceFetchOptions, buildErrorResult } from './utils.js';
import { fetchUtxoBalance } from './utxo.js';
import { fetchXrpBalance } from './xrp.js';

export type { BalanceFetchOptions } from './utils.js';

export async function fetchAccountBalance(
  account: DerivedAccount,
  options: BalanceFetchOptions,
): Promise<AccountBalanceResult> {
  try {
    switch (account.family) {
      case 'evm':
        return await fetchEvmBalance(account, options);
      case 'utxo':
        return await fetchUtxoBalance(account, options);
      case 'solana':
        return await fetchSolanaBalance(account, options);
      case 'tron':
        return await fetchTronBalance(account, options);
      case 'ton':
        return await fetchTonBalance(account, options);
      case 'sui':
        return await fetchSuiBalance(account, options);
      case 'aptos':
        return await fetchAptosBalance(account, options);
      case 'cosmos':
        return await fetchCosmosBalance(account, options);
      case 'xrp':
        return await fetchXrpBalance(account, options);
      case 'stellar':
        return await fetchStellarBalance(account, options);
      case 'near':
        return await fetchNearBalance(account, options);
      default: {
        const exhaustive: never = account.family;
        throw new Error(`Unsupported chain family: ${String(exhaustive)}`);
      }
    }
  } catch (err) {
    return buildErrorResult(account, err);
  }
}
