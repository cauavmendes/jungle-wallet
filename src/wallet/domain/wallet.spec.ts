import { describe, expect, it } from 'bun:test';
import { CurrencyMismatchError } from '../../shared/domain/errors';
import { Money } from '../../shared/domain/money';
import { Wallet } from './wallet';
import { LedgerDirection } from './wallet-ledger-entry';
import {
  InsufficientFundsError,
  InvalidLedgerAmountError,
} from './wallet.errors';

const brl = (amount: string) => Money.from({ amount, currency: 'BRL' });
const now = new Date('2026-10-16T12:00:00Z');

function openWallet(initialBalance: string): Wallet {
  return Wallet.open({
    id: 'wallet-1',
    playerId: 'player-1',
    initialBalance: brl(initialBalance),
    openingTransactionId: 'opening-tx',
    at: now,
  }).wallet;
}

describe('Wallet', () => {
  describe('open', () => {
    it('starts with the initial balance and version 1', () => {
      const wallet = openWallet('100.00');

      expect(wallet.balance.toJSON().amount).toBe('100.00');
      expect(wallet.version).toBe(1);
      expect(wallet.currency).toBe('BRL');
    });

    it('returns an opening credit entry for a positive initial balance', () => {
      const { openingEntry } = Wallet.open({
        id: 'wallet-1',
        playerId: 'player-1',
        initialBalance: brl('100.00'),
        openingTransactionId: 'opening-tx',
        at: now,
      });

      expect(openingEntry?.direction).toBe(LedgerDirection.Credit);
      expect(openingEntry?.balanceBefore.toJSON().amount).toBe('0.00');
      expect(openingEntry?.balanceAfter.toJSON().amount).toBe('100.00');
    });

    it('returns no opening entry for a zero initial balance', () => {
      const { openingEntry } = Wallet.open({
        id: 'wallet-1',
        playerId: 'player-1',
        initialBalance: brl('0.00'),
        openingTransactionId: 'opening-tx',
        at: now,
      });

      expect(openingEntry).toBeUndefined();
    });
  });

  describe('debit', () => {
    it('reduces the balance, bumps the version and returns a debit entry', () => {
      const wallet = openWallet('100.00');

      const entry = wallet.debit(brl('25.00'), 'tx-1', now);

      expect(wallet.balance.toJSON().amount).toBe('75.00');
      expect(wallet.version).toBe(2);
      expect(entry.direction).toBe(LedgerDirection.Debit);
      expect(entry.balanceBefore.toJSON().amount).toBe('100.00');
      expect(entry.balanceAfter.toJSON().amount).toBe('75.00');
    });

    it('allows debiting the entire balance', () => {
      const wallet = openWallet('100.00');

      wallet.debit(brl('100.00'), 'tx-1', now);

      expect(wallet.balance.isZero()).toBe(true);
    });

    it('rejects a debit larger than the balance without changing state', () => {
      const wallet = openWallet('100.00');

      expect(() => wallet.debit(brl('100.01'), 'tx-1', now)).toThrow(
        InsufficientFundsError,
      );
      expect(wallet.balance.toJSON().amount).toBe('100.00');
      expect(wallet.version).toBe(1);
    });

    it('accepts only one of two 80.00 bets on a 100.00 balance', () => {
      const wallet = openWallet('100.00');

      wallet.debit(brl('80.00'), 'bet-1', now);

      expect(() => wallet.debit(brl('80.00'), 'bet-2', now)).toThrow(
        InsufficientFundsError,
      );
      expect(wallet.balance.toJSON().amount).toBe('20.00');
    });

    it('rejects a zero amount without changing state', () => {
      const wallet = openWallet('100.00');

      expect(() => wallet.debit(brl('0.00'), 'tx-1', now)).toThrow(
        InvalidLedgerAmountError,
      );
      expect(wallet.version).toBe(1);
    });
  });

  describe('credit', () => {
    it('increases the balance, bumps the version and returns a credit entry', () => {
      const wallet = openWallet('100.00');

      const entry = wallet.credit(brl('50.00'), 'tx-1', now);

      expect(wallet.balance.toJSON().amount).toBe('150.00');
      expect(wallet.version).toBe(2);
      expect(entry.direction).toBe(LedgerDirection.Credit);
    });
  });

  describe('currency', () => {
    it('rejects operations in a different currency', () => {
      const wallet = openWallet('100.00');
      const usd = Money.from({ amount: '10.00', currency: 'USD' });

      expect(() => wallet.debit(usd, 'tx-1', now)).toThrow(
        CurrencyMismatchError,
      );
      expect(() => wallet.credit(usd, 'tx-2', now)).toThrow(
        CurrencyMismatchError,
      );
    });
  });

  describe('rehydrate', () => {
    it('restores persisted state as is', () => {
      const wallet = Wallet.rehydrate({
        id: 'wallet-1',
        playerId: 'player-1',
        currency: 'BRL',
        balance: brl('42.00'),
        version: 7,
        createdAt: now,
        updatedAt: now,
      });

      expect(wallet.balance.toJSON().amount).toBe('42.00');
      expect(wallet.version).toBe(7);
    });
  });
});
