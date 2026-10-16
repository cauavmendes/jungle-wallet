import {
  CurrencyMismatchError,
  InvalidCurrencyError,
  InvalidMoneyAmountError,
} from './errors';

const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export interface MoneyProps {
  amount: string;
  currency: string;
}

export class Money {
  private constructor(
    private readonly cents: bigint,
    public readonly currency: string,
  ) {}

  static from(props: MoneyProps): Money {
    if (!CURRENCY_PATTERN.test(props.currency)) {
      throw new InvalidCurrencyError(`Invalid currency: "${props.currency}"`);
    }

    return new Money(toCents(props.amount), props.currency);
  }

  static zero(currency: string): Money {
    return Money.from({ amount: '0.00', currency });
  }

  toJSON(): MoneyProps {
    return { amount: formatCents(this.cents), currency: this.currency };
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);

    return new Money(this.cents + other.cents, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);

    return new Money(this.cents - other.cents, this.currency);
  }

  negate(): Money {
    return new Money(-this.cents, this.currency);
  }

  isZero(): boolean {
    return this.cents === 0n;
  }

  isPositive(): boolean {
    return this.cents > 0n;
  }

  isNegative(): boolean {
    return this.cents < 0n;
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);

    return this.cents < other.cents;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.cents === other.cents;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(
        `Currency mismatch: ${this.currency} and ${other.currency}`,
      );
    }
  }
}

function toCents(amount: string): bigint {
  if (!AMOUNT_PATTERN.test(amount)) {
    throw new InvalidMoneyAmountError(`Invalid money amount: "${amount}"`);
  }

  const [wholePart, fractionPart = ''] = amount.split('.');
  const fraction = fractionPart.padEnd(2, '0');

  return BigInt(wholePart) * 100n + BigInt(fraction);
}

function formatCents(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const absolute = cents < 0n ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, '0');

  return `${sign}${whole}.${fraction}`;
}
