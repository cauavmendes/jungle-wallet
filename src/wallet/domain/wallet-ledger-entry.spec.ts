import { describe, expect, it } from 'bun:test';
import { Money } from '../../shared/domain/money';
import { LedgerDirection, WalletLedgerEntry } from './wallet-ledger-entry';
import {
  InvalidLedgerAmountError,
  UnbalancedLedgerEntryError,
} from './wallet.errors';

const brl = (amount: string) => Money.from({ amount, currency: 'BRL' });

const baseProps = {
  walletId: 'wallet-1',
  transactionId: 'tx-1',
  createdAt: new Date('2026-10-16T12:00:00Z'),
};

describe('WalletLedgerEntry', () => {
  it('creates a balanced debit entry', () => {
    const entry = WalletLedgerEntry.create({
      ...baseProps,
      direction: LedgerDirection.Debit,
      money: brl('25.00'),
      balanceBefore: brl('100.00'),
      balanceAfter: brl('75.00'),
    });

    expect(entry.isBalanced()).toBe(true);
    expect(entry.balanceAfter.toJSON().amount).toBe('75.00');
  });

  it('creates a balanced credit entry', () => {
    const entry = WalletLedgerEntry.create({
      ...baseProps,
      direction: LedgerDirection.Credit,
      money: brl('25.00'),
      balanceBefore: brl('100.00'),
      balanceAfter: brl('125.00'),
    });

    expect(entry.isBalanced()).toBe(true);
  });

  it('rejects an entry whose arithmetic does not balance', () => {
    expect(() =>
      WalletLedgerEntry.create({
        ...baseProps,
        direction: LedgerDirection.Debit,
        money: brl('25.00'),
        balanceBefore: brl('100.00'),
        balanceAfter: brl('80.00'),
      }),
    ).toThrow(UnbalancedLedgerEntryError);
  });

  it('rejects a zero amount', () => {
    expect(() =>
      WalletLedgerEntry.create({
        ...baseProps,
        direction: LedgerDirection.Credit,
        money: brl('0.00'),
        balanceBefore: brl('100.00'),
        balanceAfter: brl('100.00'),
      }),
    ).toThrow(InvalidLedgerAmountError);
  });
});
