import { Money } from '../../../shared/domain/money';
import { InvalidRequestError } from '../../../shared/interface/http/invalid-request.error';
import {
  isNonEmptyString,
  isRecord,
  isUuid,
} from '../../../shared/interface/http/validation';
import type { ProcessWagerCommand } from '../../application/process-wager-transaction.use-case';
import { WagerTransactionKind } from '../../domain/wager-transaction';

const SUBMITTABLE_KINDS = new Set<string>([
  WagerTransactionKind.Bet,
  WagerTransactionKind.Win,
  WagerTransactionKind.Loss,
  WagerTransactionKind.Refund,
  WagerTransactionKind.Rollback,
]);

export function parseProcessWagerRequest(
  idempotencyKey: unknown,
  body: unknown,
): Omit<ProcessWagerCommand, 'correlationId'> {
  if (!isNonEmptyString(idempotencyKey)) {
    throw new InvalidRequestError('Idempotency-Key header is required');
  }

  if (!isRecord(body)) {
    throw new InvalidRequestError('Request body must be a JSON object');
  }

  const { kind, money, playerId, walletId, referenceExternalTransactionId } =
    body;

  if (typeof kind !== 'string' || !SUBMITTABLE_KINDS.has(kind)) {
    throw new InvalidRequestError(
      'kind must be one of BET, WIN, LOSS, REFUND, ROLLBACK',
    );
  }

  if (!isUuid(playerId) || !isUuid(walletId)) {
    throw new InvalidRequestError('playerId and walletId must be UUIDs');
  }

  if (
    !isRecord(money) ||
    typeof money.amount !== 'string' ||
    typeof money.currency !== 'string'
  ) {
    throw new InvalidRequestError(
      'money must be an object with string "amount" and "currency"',
    );
  }

  if (
    referenceExternalTransactionId !== undefined &&
    !isNonEmptyString(referenceExternalTransactionId)
  ) {
    throw new InvalidRequestError(
      'referenceExternalTransactionId must be a non-empty string',
    );
  }

  return {
    idempotencyKey,
    providerId: requireText(body.providerId, 'providerId'),
    externalTransactionId: requireText(
      body.externalTransactionId,
      'externalTransactionId',
    ),
    playerId,
    walletId,
    roundId: requireText(body.roundId, 'roundId'),
    gameId: requireText(body.gameId, 'gameId'),
    kind: kind as WagerTransactionKind,
    money: Money.from({ amount: money.amount, currency: money.currency }),
    referenceExternalTransactionId,
  };
}

function requireText(value: unknown, field: string): string {
  if (!isNonEmptyString(value)) {
    throw new InvalidRequestError(`${field} must be a non-empty string`);
  }

  return value;
}
