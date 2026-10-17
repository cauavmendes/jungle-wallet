import type { MoneyProps } from '../../../shared/domain/money';
import type { StoredWagerTransaction } from '../../application/wager-processing.store';

export interface WagerTransactionResponse {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  walletId: string;
  playerId: string;
  roundId?: string;
  gameId?: string;
  kind: string;
  money: MoneyProps;
  referenceExternalTransactionId?: string;
  status: string;
  failureCode?: string;
  balance?: MoneyProps;
  createdAt: string;
  processedAt?: string;
}

export function toWagerTransactionResponse({
  transaction,
  balanceAfter,
}: StoredWagerTransaction): WagerTransactionResponse {
  return {
    transactionId: transaction.id,
    providerId: transaction.providerId,
    externalTransactionId: transaction.externalTransactionId,
    walletId: transaction.walletId,
    playerId: transaction.playerId,
    ...(transaction.roundId && { roundId: transaction.roundId }),
    ...(transaction.gameId && { gameId: transaction.gameId }),
    kind: transaction.kind,
    money: transaction.money.toJSON(),
    ...(transaction.referenceExternalTransactionId && {
      referenceExternalTransactionId:
        transaction.referenceExternalTransactionId,
    }),
    status: transaction.status,
    ...(transaction.failureCode && { failureCode: transaction.failureCode }),
    ...(balanceAfter && { balance: balanceAfter.toJSON() }),
    createdAt: transaction.createdAt.toISOString(),
    ...(transaction.processedAt && {
      processedAt: transaction.processedAt.toISOString(),
    }),
  };
}
