import { describe, expect, it } from 'bun:test';
import { Money } from '../../shared/domain/money';
import {
  FailureCode,
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from './wager-transaction';
import {
  InvalidTransactionStateError,
  MissingReferenceError,
} from './wager.errors';

const now = new Date('2026-10-16T12:00:00Z');

function createTransaction(
  kind: WagerTransactionKind,
  referenceExternalTransactionId?: string,
): WagerTransaction {
  return WagerTransaction.create({
    id: 'tx-1',
    providerId: 'provider-a',
    externalTransactionId: 'external-1',
    idempotencyKey: 'provider-a:external-1',
    payloadHash: 'hash-1',
    walletId: 'wallet-1',
    playerId: 'player-1',
    roundId: 'round-1',
    gameId: 'game-1',
    kind,
    money: Money.from({ amount: '25.00', currency: 'BRL' }),
    referenceExternalTransactionId,
    createdAt: now,
  });
}

describe('WagerTransaction', () => {
  describe('create', () => {
    it('starts as PENDING', () => {
      const transaction = createTransaction(WagerTransactionKind.Bet);

      expect(transaction.status).toBe(WagerTransactionStatus.Pending);
      expect(transaction.isTerminal()).toBe(false);
    });

    it.each([WagerTransactionKind.Refund, WagerTransactionKind.Rollback])(
      'requires a reference for %p',
      (kind) => {
        expect(() => createTransaction(kind)).toThrow(MissingReferenceError);
      },
    );

    it('accepts a REFUND with a reference', () => {
      const transaction = createTransaction(
        WagerTransactionKind.Refund,
        'external-0',
      );

      expect(transaction.requiresReference()).toBe(true);
    });
  });

  describe('transitions', () => {
    it('marks the transaction as processed', () => {
      const transaction = createTransaction(WagerTransactionKind.Bet);

      transaction.markProcessed(undefined, now);

      expect(transaction.status).toBe(WagerTransactionStatus.Processed);
      expect(transaction.processedAt).toEqual(now);
      expect(transaction.isTerminal()).toBe(true);
    });

    it('rejects the transaction with a failure code', () => {
      const transaction = createTransaction(WagerTransactionKind.Bet);

      transaction.reject(FailureCode.InsufficientFunds, now);

      expect(transaction.status).toBe(WagerTransactionStatus.Rejected);
      expect(transaction.failureCode).toBe(FailureCode.InsufficientFunds);
    });

    it('allows leaving PENDING_REFERENCE', () => {
      const transaction = createTransaction(
        WagerTransactionKind.Refund,
        'external-0',
      );

      transaction.markPendingReference();
      transaction.markProcessed('tx-0', now);

      expect(transaction.status).toBe(WagerTransactionStatus.Processed);
      expect(transaction.referenceTransactionId).toBe('tx-0');
    });

    it('never leaves a terminal state', () => {
      const transaction = createTransaction(WagerTransactionKind.Bet);
      transaction.markProcessed(undefined, now);

      expect(() =>
        transaction.reject(FailureCode.InsufficientFunds, now),
      ).toThrow(InvalidTransactionStateError);
      expect(() => transaction.markPendingReference()).toThrow(
        InvalidTransactionStateError,
      );
      expect(transaction.status).toBe(WagerTransactionStatus.Processed);
    });
  });

  describe('queries', () => {
    it('does not affect the balance for LOSS', () => {
      expect(
        createTransaction(WagerTransactionKind.Loss).affectsBalance(),
      ).toBe(false);
      expect(createTransaction(WagerTransactionKind.Bet).affectsBalance()).toBe(
        true,
      );
    });

    it('matches only the same payload hash', () => {
      const transaction = createTransaction(WagerTransactionKind.Bet);

      expect(transaction.matchesPayload('hash-1')).toBe(true);
      expect(transaction.matchesPayload('hash-2')).toBe(false);
    });
  });
});
