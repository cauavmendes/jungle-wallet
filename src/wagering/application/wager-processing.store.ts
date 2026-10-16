import type { Money } from '../../shared/domain/money';
import type { Wallet } from '../../wallet/domain/wallet';
import type { WalletLedgerEntry } from '../../wallet/domain/wallet-ledger-entry';
import type { WagerTransaction } from '../domain/wager-transaction';

export const WAGER_PROCESSING_STORE = Symbol('WAGER_PROCESSING_STORE');

export interface StoredWagerTransaction {
  transaction: WagerTransaction;
  balanceAfter: Money | undefined;
}

export interface WagerOutcome {
  transaction: WagerTransaction;
  wallet: Wallet;
  previousVersion: number;
  ledgerEntry: WalletLedgerEntry | undefined;
}

export interface WalletSession {
  readonly wallet: Wallet | null;
  findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<StoredWagerTransaction | null>;
  save(outcome: WagerOutcome): Promise<void>;
}

export interface WagerProcessingStore {
  withLockedWallet<T>(
    walletId: string,
    work: (session: WalletSession) => Promise<T>,
  ): Promise<T>;
}
