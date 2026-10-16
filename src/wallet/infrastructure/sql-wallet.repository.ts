import { createHash } from 'node:crypto';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { Money } from '../../shared/domain/money';
import type { WalletRepository } from '../application/wallet.repository';
import { type OpenedWallet, Wallet } from '../domain/wallet';
import { WalletAlreadyExistsError } from '../domain/wallet.errors';

interface WalletRow {
  id: string;
  player_id: string;
  currency: string;
  balance_cents: string;
  version: number;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class SqlWalletRepository implements WalletRepository {
  constructor(private readonly em: EntityManager) {}

  async saveOpened({ wallet, openingEntry }: OpenedWallet): Promise<void> {
    try {
      await this.em.transactional(async (em) => {
        await em.execute(
          `INSERT INTO wallets (id, player_id, currency, balance_cents, version, created_at, updated_at)
           VALUES (:id, :playerId, :currency, :balanceCents, :version, :createdAt, :updatedAt)`,
          {
            id: wallet.id,
            playerId: wallet.playerId,
            currency: wallet.currency,
            balanceCents: wallet.balance.toCents().toString(),
            version: wallet.version,
            createdAt: wallet.createdAt,
            updatedAt: wallet.updatedAt,
          },
        );

        if (!openingEntry) {
          return;
        }

        await em.execute(
          `INSERT INTO wager_transactions (id, provider_id, external_transaction_id, idempotency_key,
             payload_hash, wallet_id, player_id, currency, kind, amount_cents, status, created_at, processed_at)
           VALUES (:id, 'internal', :id, :idempotencyKey, :payloadHash, :walletId, :playerId, :currency,
             'OPENING', :amountCents, 'PROCESSED', :at, :at)`,
          {
            id: openingEntry.transactionId,
            idempotencyKey: `internal:opening:${wallet.id}`,
            payloadHash: sha256(
              `${wallet.id}:${openingEntry.money.toString()}`,
            ),
            walletId: wallet.id,
            playerId: wallet.playerId,
            currency: wallet.currency,
            amountCents: openingEntry.money.toCents().toString(),
            at: openingEntry.createdAt,
          },
        );

        await em.execute(
          `INSERT INTO wallet_ledger_entries (id, wallet_id, transaction_id, direction,
             amount_cents, balance_before_cents, balance_after_cents, created_at)
           VALUES (:id, :walletId, :transactionId, :direction,
             :amountCents, :balanceBeforeCents, :balanceAfterCents, :createdAt)`,
          {
            id: openingEntry.id,
            walletId: openingEntry.walletId,
            transactionId: openingEntry.transactionId,
            direction: openingEntry.direction,
            amountCents: openingEntry.money.toCents().toString(),
            balanceBeforeCents: openingEntry.balanceBefore.toCents().toString(),
            balanceAfterCents: openingEntry.balanceAfter.toCents().toString(),
            createdAt: openingEntry.createdAt,
          },
        );
      });
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) {
        throw new WalletAlreadyExistsError(
          `Wallet already exists for player ${wallet.playerId} in ${wallet.currency}`,
        );
      }

      throw error;
    }
  }

  async findById(id: string): Promise<Wallet | null> {
    const rows = (await this.em.execute(
      `SELECT id, player_id, currency, balance_cents, version, created_at, updated_at
         FROM wallets
        WHERE id = :id`,
      { id },
    )) as WalletRow[];

    const row = rows[0];

    if (!row) {
      return null;
    }

    return Wallet.rehydrate({
      id: row.id,
      playerId: row.player_id,
      currency: row.currency,
      balance: Money.fromCents(BigInt(row.balance_cents), row.currency),
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
