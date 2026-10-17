import { randomUUID } from 'node:crypto';
import {
  IntegrationEvent,
  type IntegrationEventContext,
} from '../../shared/application/integration-event';
import type { Money, MoneyProps } from '../../shared/domain/money';
import type { Wallet } from '../../wallet/domain/wallet';
import type {
  LedgerDirection,
  WalletLedgerEntry,
} from '../../wallet/domain/wallet-ledger-entry';
import type { WagerTransaction } from '../domain/wager-transaction';

interface WagerTransactionData {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  walletId: string;
  playerId: string;
  roundId: string | null;
  gameId: string | null;
  kind: string;
  money: MoneyProps;
  balance: MoneyProps;
}

export type WagerTransactionProcessedData = WagerTransactionData;

export interface WagerTransactionRejectedData extends WagerTransactionData {
  failureCode: string;
}

export interface WalletBalanceChangedData {
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  money: MoneyProps;
  balanceBefore: MoneyProps;
  balanceAfter: MoneyProps;
  walletVersion: number;
}

export class WagerTransactionProcessed extends IntegrationEvent<WagerTransactionProcessedData> {
  readonly eventType = 'WagerTransactionProcessed';
  readonly version = 1;

  static from(
    transaction: WagerTransaction,
    balance: Money,
    context: IntegrationEventContext,
  ): WagerTransactionProcessed {
    return new WagerTransactionProcessed({
      ...context,
      eventId: randomUUID(),
      aggregateId: transaction.id,
      occurredAt: transaction.processedAt ?? transaction.createdAt,
      data: transactionData(transaction, balance),
    });
  }
}

export class WagerTransactionRejected extends IntegrationEvent<WagerTransactionRejectedData> {
  readonly eventType = 'WagerTransactionRejected';
  readonly version = 1;

  static from(
    transaction: WagerTransaction,
    balance: Money,
    context: IntegrationEventContext,
  ): WagerTransactionRejected {
    return new WagerTransactionRejected({
      ...context,
      eventId: randomUUID(),
      aggregateId: transaction.id,
      occurredAt: transaction.processedAt ?? transaction.createdAt,
      data: {
        ...transactionData(transaction, balance),
        failureCode: transaction.failureCode ?? 'UNKNOWN',
      },
    });
  }
}

export class WalletBalanceChanged extends IntegrationEvent<WalletBalanceChangedData> {
  readonly eventType = 'WalletBalanceChanged';
  readonly version = 1;

  static from(
    wallet: Wallet,
    entry: WalletLedgerEntry,
    context: IntegrationEventContext,
  ): WalletBalanceChanged {
    return new WalletBalanceChanged({
      ...context,
      eventId: randomUUID(),
      aggregateId: wallet.id,
      occurredAt: entry.createdAt,
      data: {
        walletId: wallet.id,
        transactionId: entry.transactionId,
        direction: entry.direction,
        money: entry.money.toJSON(),
        balanceBefore: entry.balanceBefore.toJSON(),
        balanceAfter: entry.balanceAfter.toJSON(),
        walletVersion: wallet.version,
      },
    });
  }
}

function transactionData(
  transaction: WagerTransaction,
  balance: Money,
): WagerTransactionData {
  return {
    transactionId: transaction.id,
    providerId: transaction.providerId,
    externalTransactionId: transaction.externalTransactionId,
    walletId: transaction.walletId,
    playerId: transaction.playerId,
    roundId: transaction.roundId ?? null,
    gameId: transaction.gameId ?? null,
    kind: transaction.kind,
    money: transaction.money.toJSON(),
    balance: balance.toJSON(),
  };
}
