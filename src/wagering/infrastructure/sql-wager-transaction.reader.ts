import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { StoredWagerTransaction } from '../application/wager-processing.store';
import type { WagerTransactionReader } from '../application/wager-transaction.reader';
import {
  toStoredTransaction,
  type WagerTransactionRow,
} from './wager-transaction.row';

@Injectable()
export class SqlWagerTransactionReader implements WagerTransactionReader {
  constructor(private readonly em: EntityManager) {}

  async findById(
    transactionId: string,
  ): Promise<StoredWagerTransaction | null> {
    const rows = (await this.em
      .fork()
      .execute('SELECT * FROM wager_transactions WHERE id = :transactionId', {
        transactionId,
      })) as WagerTransactionRow[];
    const row = rows[0];

    return row ? toStoredTransaction(row) : null;
  }

  async findByExternalId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<StoredWagerTransaction | null> {
    const rows = (await this.em.fork().execute(
      `SELECT *
         FROM wager_transactions
        WHERE provider_id = :providerId
          AND external_transaction_id = :externalTransactionId`,
      { providerId, externalTransactionId },
    )) as WagerTransactionRow[];
    const row = rows[0];

    return row ? toStoredTransaction(row) : null;
  }
}
