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
    return new Money(toCents(props.amount), props.currency);
  }

  toJSON(): MoneyProps {
    return { amount: formatCents(this.cents), currency: this.currency };
  }
}

function toCents(amount: string): bigint {
  const [wholePart, fractionPart = ''] = amount.split('.');
  const fraction = fractionPart.padEnd(2, '0');

  return BigInt(wholePart) * 100n + BigInt(fraction);
}

function formatCents(cents: bigint): string {
  const whole = cents / 100n;
  const fraction = (cents % 100n).toString().padStart(2, '0');

  return `${whole}.${fraction}`;
}
