import {
  LockWaitTimeoutException,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { InboxMessage } from '../../inbox/domain/inbox-message';
import type { IntegrationEvent } from '../../shared/application/integration-event';
import type { Wallet } from '../../wallet/domain/wallet';
import type { WalletLedgerEntry } from '../../wallet/domain/wallet-ledger-entry';
import {
  toWallet,
  WALLET_COLUMNS,
  type WalletRow,
} from '../../wallet/infrastructure/wallet.row';
import type {
  StoredWagerTransaction,
  WagerOutcome,
  WagerProcessingStore,
  WalletSession,
} from '../application/wager-processing.store';
import type { WagerTransaction } from '../domain/wager-transaction';
import {
  ConcurrentWalletModificationError,
  DuplicateTransactionError,
  WalletLockTimeoutError,
} from '../domain/wager.errors';
import {
  toStoredTransaction,
  type WagerTransactionRow,
} from './wager-transaction.row';

@Injectable()
export class SqlWagerProcessingStore implements WagerProcessingStore {
  constructor(private readonly em: EntityManager) {}

  async withLockedWallet<T>(
    walletId: string,
    work: (session: WalletSession) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.em.fork().transactional(async (em) => {
        await em.execute(`SET LOCAL lock_timeout = '5s'`);

        const rows = (await em.execute(
          `SELECT ${WALLET_COLUMNS} FROM wallets WHERE id = :walletId FOR UPDATE`,
          { walletId },
        )) as WalletRow[];
        const row = rows[0];

        return work(new SqlWalletSession(em, row ? toWallet(row) : null));
      });
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) {
        throw new DuplicateTransactionError(
          'Transaction was already recorded by a concurrent request',
        );
      }

      if (error instanceof LockWaitTimeoutException) {
        throw new WalletLockTimeoutError(
          `Timed out waiting for the lock on wallet ${walletId}`,
        );
      }

      throw error;
    }
  }

  async isInboxMessageProcessed(
    consumerName: string,
    messageId: string,
  ): Promise<boolean> {
    const rows = (await this.em.fork().execute(
      `SELECT 1
         FROM inbox_messages
        WHERE consumer_name = :consumerName
          AND message_id = :messageId
          AND processed_at IS NOT NULL`,
      { consumerName, messageId },
    )) as unknown[];

    return rows.length > 0;
  }
}

class SqlWalletSession implements WalletSession {
  constructor(
    private readonly em: EntityManager,
    readonly wallet: Wallet | null,
  ) {}

  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<StoredWagerTransaction | null> {
    const rows = (await this.em.execute(
      'SELECT * FROM wager_transactions WHERE idempotency_key = :idempotencyKey',
      { idempotencyKey },
    )) as WagerTransactionRow[];
    const row = rows[0];

    return row ? toStoredTransaction(row) : null;
  }

  async save({
    transaction,
    wallet,
    previousVersion,
    ledgerEntry,
    events,
  }: WagerOutcome): Promise<void> {
    await this.insertTransaction(transaction, wallet);

    if (ledgerEntry) {
      await this.insertLedgerEntry(ledgerEntry);
    }

    if (wallet.version !== previousVersion) {
      await this.updateWallet(wallet, previousVersion);
    }

    for (const event of events) {
      await this.insertOutboxMessage(event);
    }
  }

  async recordInboxMessage(message: InboxMessage): Promise<void> {
    await this.em.execute(
      `INSERT INTO inbox_messages (consumer_name, message_id, payload_hash, received_at, processed_at)
       VALUES (:consumerName, :messageId, :payloadHash, :receivedAt, :processedAt)
       ON CONFLICT (consumer_name, message_id) DO NOTHING`,
      {
        consumerName: message.consumerName,
        messageId: message.messageId,
        payloadHash: message.payloadHash,
        receivedAt: message.receivedAt,
        processedAt: message.processedAt ?? null,
      },
    );
  }

  private async insertTransaction(
    transaction: WagerTransaction,
    wallet: Wallet,
  ): Promise<void> {
    await this.em.execute(
      `INSERT INTO wager_transactions (id, provider_id, external_transaction_id, idempotency_key,
         payload_hash, wallet_id, player_id, currency, round_id, game_id, kind, amount_cents,
         reference_external_transaction_id, reference_transaction_id, status, failure_code,
         created_at, processed_at, balance_after_cents)
       VALUES (:id, :providerId, :externalTransactionId, :idempotencyKey,
         :payloadHash, :walletId, :playerId, :currency, :roundId, :gameId, :kind, :amountCents,
         :referenceExternalTransactionId, :referenceTransactionId, :status, :failureCode,
         :createdAt, :processedAt, :balanceAfterCents)`,
      {
        id: transaction.id,
        providerId: transaction.providerId,
        externalTransactionId: transaction.externalTransactionId,
        idempotencyKey: transaction.idempotencyKey,
        payloadHash: transaction.payloadHash,
        walletId: transaction.walletId,
        playerId: transaction.playerId,
        currency: transaction.money.currency,
        roundId: transaction.roundId ?? null,
        gameId: transaction.gameId ?? null,
        kind: transaction.kind,
        amountCents: transaction.money.toCents().toString(),
        referenceExternalTransactionId:
          transaction.referenceExternalTransactionId ?? null,
        referenceTransactionId: transaction.referenceTransactionId ?? null,
        status: transaction.status,
        failureCode: transaction.failureCode ?? null,
        createdAt: transaction.createdAt,
        processedAt: transaction.processedAt ?? null,
        balanceAfterCents: wallet.balance.toCents().toString(),
      },
    );
  }

  private async insertLedgerEntry(entry: WalletLedgerEntry): Promise<void> {
    await this.em.execute(
      `INSERT INTO wallet_ledger_entries (id, wallet_id, transaction_id, direction,
         amount_cents, balance_before_cents, balance_after_cents, created_at)
       VALUES (:id, :walletId, :transactionId, :direction,
         :amountCents, :balanceBeforeCents, :balanceAfterCents, :createdAt)`,
      {
        id: entry.id,
        walletId: entry.walletId,
        transactionId: entry.transactionId,
        direction: entry.direction,
        amountCents: entry.money.toCents().toString(),
        balanceBeforeCents: entry.balanceBefore.toCents().toString(),
        balanceAfterCents: entry.balanceAfter.toCents().toString(),
        createdAt: entry.createdAt,
      },
    );
  }

  private async updateWallet(
    wallet: Wallet,
    previousVersion: number,
  ): Promise<void> {
    const rows = (await this.em.execute(
      `UPDATE wallets
          SET balance_cents = :balanceCents, version = :version, updated_at = :updatedAt
        WHERE id = :id AND version = :previousVersion
        RETURNING id`,
      {
        id: wallet.id,
        balanceCents: wallet.balance.toCents().toString(),
        version: wallet.version,
        updatedAt: wallet.updatedAt,
        previousVersion,
      },
    )) as unknown[];

    if (rows.length !== 1) {
      throw new ConcurrentWalletModificationError(
        `Wallet ${wallet.id} was modified concurrently`,
      );
    }
  }

  private async insertOutboxMessage(
    event: IntegrationEvent<unknown>,
  ): Promise<void> {
    await this.em.execute(
      `INSERT INTO outbox_messages (id, aggregate_id, event_type, payload, occurred_at)
       VALUES (:id, :aggregateId, :eventType, CAST(:payload AS jsonb), :occurredAt)`,
      {
        id: event.eventId,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        payload: JSON.stringify(event.toJSON()),
        occurredAt: event.occurredAt,
      },
    );
  }
}
