import type { WalletLedgerEntry } from '../domain/wallet-ledger-entry';

export const WALLET_LEDGER_READER = Symbol('WALLET_LEDGER_READER');

export interface LedgerPage {
  entries: WalletLedgerEntry[];
  nextCursor: string | undefined;
}

export interface ReconciliationSnapshot {
  currency: string;
  storedCents: bigint;
  calculatedCents: bigint;
  checkedEntries: number;
}

export interface WalletLedgerReader {
  findPage(
    walletId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<LedgerPage>;
  reconcile(walletId: string): Promise<ReconciliationSnapshot | null>;
}
