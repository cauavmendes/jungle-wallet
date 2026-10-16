import { DomainError } from '../../shared/domain/errors';

export class InsufficientFundsError extends DomainError {
  readonly code = 'INSUFFICIENT_FUNDS';
}

export class InvalidLedgerAmountError extends DomainError {
  readonly code = 'INVALID_LEDGER_AMOUNT';
}

export class UnbalancedLedgerEntryError extends DomainError {
  readonly code = 'UNBALANCED_LEDGER_ENTRY';
}

export class WalletAlreadyExistsError extends DomainError {
  readonly code = 'WALLET_ALREADY_EXISTS';
}

export class WalletNotFoundError extends DomainError {
  readonly code = 'WALLET_NOT_FOUND';
}
