import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { Money } from '../../shared/domain/money';
import { InvalidRequestError } from '../../shared/interface/http/invalid-request.error';
import type {
  LedgerPage,
  ReconciliationSnapshot,
  WalletLedgerReader,
} from '../application/wallet-ledger.reader';
import {
  type LedgerDirection,
  WalletLedgerEntry,
} from '../domain/wallet-ledger-entry';

interface LedgerRow {
  id: string;
  sequence: string;
  wallet_id: string;
  transaction_id: string;
  direction: string;
  amount_cents: string;
  balance_before_cents: string;
  balance_after_cents: string;
  created_at: Date | string;
  currency: string;
}

interface ReconciliationRow {
  currency: string;
  stored_cents: string;
  calculated_cents: string;
  checked_entries: number;
}

@Injectable()
export class SqlWalletLedgerReader implements WalletLedgerReader {
  constructor(private readonly em: EntityManager) {}

  async findPage(
    walletId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<LedgerPage> {
    const rows = (await this.em.fork().execute(
      `SELECT l.id, l.sequence::text AS sequence, l.wallet_id, l.transaction_id, l.direction,
              l.amount_cents, l.balance_before_cents, l.balance_after_cents, l.created_at,
              w.currency
         FROM wallet_ledger_entries l
         JOIN wallets w ON w.id = l.wallet_id
        WHERE l.wallet_id = :walletId
          AND l.sequence > :afterSequence
        ORDER BY l.sequence
        LIMIT :limit`,
      {
        walletId,
        afterSequence: decodeCursor(cursor),
        limit: limit + 1,
      },
    )) as LedgerRow[];

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = pageRows.at(-1);

    return {
      entries: pageRows.map(toLedgerEntry),
      nextCursor:
        hasMore && lastRow ? encodeCursor(lastRow.sequence) : undefined,
    };
  }

  async reconcile(walletId: string): Promise<ReconciliationSnapshot | null> {
    const [row] = (await this.em.fork().execute(
      `SELECT w.currency,
              w.balance_cents::text AS stored_cents,
              COALESCE(SUM(CASE WHEN l.direction = 'CREDIT' THEN l.amount_cents
                                ELSE -l.amount_cents END), 0)::text AS calculated_cents,
              COUNT(l.id)::int AS checked_entries
         FROM wallets w
         LEFT JOIN wallet_ledger_entries l ON l.wallet_id = w.id
        WHERE w.id = :walletId
        GROUP BY w.id`,
      { walletId },
    )) as ReconciliationRow[];

    if (!row) {
      return null;
    }

    return {
      currency: row.currency,
      storedCents: BigInt(row.stored_cents),
      calculatedCents: BigInt(row.calculated_cents),
      checkedEntries: row.checked_entries,
    };
  }
}

function encodeCursor(sequence: string): string {
  return Buffer.from(sequence).toString('base64url');
}

function decodeCursor(cursor: string | undefined): string {
  if (cursor === undefined) {
    return '0';
  }

  const sequence = Buffer.from(cursor, 'base64url').toString();

  if (!/^\d+$/.test(sequence)) {
    throw new InvalidRequestError('Invalid cursor');
  }

  return sequence;
}

function toLedgerEntry(row: LedgerRow): WalletLedgerEntry {
  return WalletLedgerEntry.rehydrate({
    id: row.id,
    walletId: row.wallet_id,
    transactionId: row.transaction_id,
    direction: row.direction as LedgerDirection,
    money: Money.fromCents(BigInt(row.amount_cents), row.currency),
    balanceBefore: Money.fromCents(
      BigInt(row.balance_before_cents),
      row.currency,
    ),
    balanceAfter: Money.fromCents(
      BigInt(row.balance_after_cents),
      row.currency,
    ),
    createdAt: new Date(row.created_at),
  });
}
