import { Inject, Injectable } from '@nestjs/common';
import { WagerTransactionNotFoundError } from '../domain/wager.errors';
import type { StoredWagerTransaction } from './wager-processing.store';
import {
  WAGER_TRANSACTION_READER,
  type WagerTransactionReader,
} from './wager-transaction.reader';

@Injectable()
export class GetWagerTransactionUseCase {
  constructor(
    @Inject(WAGER_TRANSACTION_READER)
    private readonly transactions: WagerTransactionReader,
  ) {}

  async byId(transactionId: string): Promise<StoredWagerTransaction> {
    const stored = await this.transactions.findById(transactionId);

    if (!stored) {
      throw new WagerTransactionNotFoundError(
        `Wager transaction not found: ${transactionId}`,
      );
    }

    return stored;
  }

  async byExternalId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<StoredWagerTransaction> {
    const stored = await this.transactions.findByExternalId(
      providerId,
      externalTransactionId,
    );

    if (!stored) {
      throw new WagerTransactionNotFoundError(
        `Wager transaction not found: ${providerId}/${externalTransactionId}`,
      );
    }

    return stored;
  }
}
