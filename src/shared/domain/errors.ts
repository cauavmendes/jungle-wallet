export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidMoneyAmountError extends DomainError {
  readonly code = 'INVALID_MONEY_AMOUNT';
}

export class InvalidCurrencyError extends DomainError {
  readonly code = 'INVALID_CURRENCY';
}
