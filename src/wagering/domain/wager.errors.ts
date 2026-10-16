import { DomainError } from '../../shared/domain/errors';

export class InvalidTransactionStateError extends DomainError {
  readonly code = 'INVALID_TRANSACTION_STATE';
}

export class MissingReferenceError extends DomainError {
  readonly code = 'MISSING_REFERENCE';
}

export class IdempotencyConflictError extends DomainError {
  readonly code = 'IDEMPOTENCY_CONFLICT';
}

export class UnsupportedTransactionKindError extends DomainError {
  readonly code = 'UNSUPPORTED_TRANSACTION_KIND';
}

export class WalletPlayerMismatchError extends DomainError {
  readonly code = 'WALLET_PLAYER_MISMATCH';
}
