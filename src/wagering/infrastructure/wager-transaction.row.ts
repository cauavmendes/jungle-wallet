import { Money } from '../../shared/domain/money';
import type { StoredWagerTransaction } from '../application/wager-processing.store';
import {
  type FailureCode,
  WagerTransaction,
  type WagerTransactionKind,
  type WagerTransactionStatus,
} from '../domain/wager-transaction';

export interface WagerTransactionRow {
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
  created_at: Date | string;
  processed_at: Date | string | null;
  balance_after_cents: string | null;
}

export function toStoredTransaction(
  row: WagerTransactionRow,
): StoredWagerTransaction {
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
      createdAt: new Date(row.created_at),
      status: row.status as WagerTransactionStatus,
      referenceTransactionId: row.reference_transaction_id ?? undefined,
      failureCode: (row.failure_code ?? undefined) as FailureCode | undefined,
      processedAt:
        row.processed_at === null ? undefined : new Date(row.processed_at),
    }),
    balanceAfter:
      row.balance_after_cents === null
        ? undefined
        : Money.fromCents(BigInt(row.balance_after_cents), row.currency),
  };
}
