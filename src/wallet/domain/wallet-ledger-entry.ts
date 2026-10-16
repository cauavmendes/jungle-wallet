import { randomUUID } from 'node:crypto';
import { Money } from '../../shared/domain/money';
import {
  InvalidLedgerAmountError,
  UnbalancedLedgerEntryError,
} from './wallet.errors';

export enum LedgerDirection {
  Debit = 'DEBIT',
  Credit = 'CREDIT',
}

export interface CreateLedgerEntryProps {
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  money: Money;
  balanceBefore: Money;
  balanceAfter: Money;
  createdAt: Date;
}

export interface LedgerEntryState extends CreateLedgerEntryProps {
  id: string;
}

export class WalletLedgerEntry {
  private constructor(
    public readonly id: string,
    public readonly walletId: string,
    public readonly transactionId: string,
    public readonly direction: LedgerDirection,
    public readonly money: Money,
    public readonly balanceBefore: Money,
    public readonly balanceAfter: Money,
    public readonly createdAt: Date,
  ) {}

  static create(props: CreateLedgerEntryProps): WalletLedgerEntry {
    if (!props.money.isPositive()) {
      throw new InvalidLedgerAmountError(
        `Ledger amount must be positive: ${props.money.toString()}`,
      );
    }

    const entry = WalletLedgerEntry.rehydrate({ ...props, id: randomUUID() });

    if (!entry.isBalanced()) {
      throw new UnbalancedLedgerEntryError(
        `Unbalanced ledger entry: ${props.balanceBefore.toString()} ${props.direction} ${props.money.toString()} != ${props.balanceAfter.toString()}`,
      );
    }

    return entry;
  }

  static rehydrate(state: LedgerEntryState): WalletLedgerEntry {
    return new WalletLedgerEntry(
      state.id,
      state.walletId,
      state.transactionId,
      state.direction,
      state.money,
      state.balanceBefore,
      state.balanceAfter,
      state.createdAt,
    );
  }

  isBalanced(): boolean {
    const expectedAfter =
      this.direction === LedgerDirection.Credit
        ? this.balanceBefore.add(this.money)
        : this.balanceBefore.subtract(this.money);

    return expectedAfter.equals(this.balanceAfter);
  }
}
