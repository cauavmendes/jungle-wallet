import type { StoredWagerTransaction } from './wager-processing.store';

export const WAGER_TRANSACTION_READER = Symbol('WAGER_TRANSACTION_READER');

export interface WagerTransactionReader {
  findById(transactionId: string): Promise<StoredWagerTransaction | null>;
  findByExternalId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<StoredWagerTransaction | null>;
}
