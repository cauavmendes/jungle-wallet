import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { Money } from '../../shared/domain/money';
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
import {
  type FailureCode,
  WagerTransaction,
  type WagerTransactionKind,
  type WagerTransactionStatus,
} from '../domain/wager-transaction';
import {
  ConcurrentWalletModificationError,
  DuplicateTransactionError,
} from '../domain/wager.errors';

interface WagerTransactionRow {
  id: string;
  provider_id: string;
  external_transaction_id: string;
  idempotency_key: string;
  payload_hash: string;
  wallet_id: string;
  player_id: string;
  currency: string;
  round_id: string | null;
  game_id: string | null;
  kind: string;
  amount_cents: string;
  reference_external_transaction_id: string | null;
  reference_transaction_id: string | null;
  status: string;
  failure_code: string | null;
  created_at: Date;
  processed_at: Date | null;
  balance_after_cents: string | null;
}

@Injectable()
export class SqlWagerProcessingStore implements WagerProcessingStore {
  constructor(private readonly em: EntityManager) {}

  async withLockedWallet<T>(
    walletId: string,
    work: (session: WalletSession) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.em.fork().transactional(async (em) => {
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

      throw error;
    }
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
  }: WagerOutcome): Promise<void> {
    await this.insertTransaction(transaction, wallet);

    if (ledgerEntry) {
      await this.insertLedgerEntry(ledgerEntry);
    }

    if (wallet.version !== previousVersion) {
      await this.updateWallet(wallet, previousVersion);
    }
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
}

function toStoredTransaction(row: WagerTransactionRow): StoredWagerTransaction {
  return {
    transaction: WagerTransaction.rehydrate({
      id: row.id,
      providerId: row.provider_id,
      externalTransactionId: row.external_transaction_id,
      idempotencyKey: row.idempotency_key,
      payloadHash: row.payload_hash,
      walletId: row.wallet_id,
      playerId: row.player_id,
      roundId: row.round_id ?? undefined,
      gameId: row.game_id ?? undefined,
      kind: row.kind as WagerTransactionKind,
      money: Money.fromCents(BigInt(row.amount_cents), row.currency),
      referenceExternalTransactionId:
        row.reference_external_transaction_id ?? undefined,
      createdAt: row.created_at,
      status: row.status as WagerTransactionStatus,
      referenceTransactionId: row.reference_transaction_id ?? undefined,
      failureCode: (row.failure_code ?? undefined) as FailureCode | undefined,
      processedAt: row.processed_at ?? undefined,
    }),
    balanceAfter:
      row.balance_after_cents === null
        ? undefined
        : Money.fromCents(BigInt(row.balance_after_cents), row.currency),
  };
}
