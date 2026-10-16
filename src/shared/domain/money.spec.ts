import { describe, expect, it } from 'bun:test';
import { Money } from './money';
import {
  CurrencyMismatchError,
  InvalidCurrencyError,
  InvalidMoneyAmountError,
} from './errors';

describe('Money', () => {
  describe('from', () => {
    it('accepts a valid decimal string', () => {
      const money = Money.from({ amount: '25.00', currency: 'BRL' });

      expect(money.toJSON()).toEqual({ amount: '25.00', currency: 'BRL' });
    });

    it('accepts zero', () => {
      const money = Money.from({ amount: '0.00', currency: 'BRL' });

      expect(money.toJSON()).toEqual({ amount: '0.00', currency: 'BRL' });
    });

    it('normalizes an integer amount to two decimal places', () => {
      const money = Money.from({ amount: '25', currency: 'BRL' });

      expect(money.toJSON()).toEqual({ amount: '25.00', currency: 'BRL' });
    });

    it('pads a single decimal digit with a trailing zero', () => {
      const money = Money.from({ amount: '25.5', currency: 'BRL' });

      expect(money.toJSON()).toEqual({ amount: '25.50', currency: 'BRL' });
    });
  });

  describe('invalid amounts', () => {
    it.each(['NaN', 'Infinity', '1e3', '', '-10.00', '25.001', 'abc', '10,00'])(
      'rejects %p',
      (amount) => {
        expect(() => Money.from({ amount, currency: 'BRL' })).toThrow(
          InvalidMoneyAmountError,
        );
      },
    );
  });

  describe('invalid currencies', () => {
    it.each(['real', 'brl', 'BR', 'BRLX', ''])('rejects %p', (currency) => {
      expect(() => Money.from({ amount: '10.00', currency })).toThrow(
        InvalidCurrencyError,
      );
    });
  });

  describe('add', () => {
    it('adds two amounts of the same currency', () => {
      const a = Money.from({ amount: '10.00', currency: 'BRL' });
      const b = Money.from({ amount: '5.50', currency: 'BRL' });

      expect(a.add(b).toJSON()).toEqual({ amount: '15.50', currency: 'BRL' });
    });

    it('does not change the original instance', () => {
      const a = Money.from({ amount: '10.00', currency: 'BRL' });
      const b = Money.from({ amount: '5.50', currency: 'BRL' });

      a.add(b);

      expect(a.toJSON()).toEqual({ amount: '10.00', currency: 'BRL' });
    });

    it('rejects amounts of different currencies', () => {
      const brl = Money.from({ amount: '10.00', currency: 'BRL' });
      const usd = Money.from({ amount: '5.00', currency: 'USD' });

      expect(() => brl.add(usd)).toThrow(CurrencyMismatchError);
    });
  });

  describe('subtract', () => {
    it('subtracts two amounts of the same currency', () => {
      const a = Money.from({ amount: '10.00', currency: 'BRL' });
      const b = Money.from({ amount: '5.50', currency: 'BRL' });

      expect(a.subtract(b).toJSON()).toEqual({
        amount: '4.50',
        currency: 'BRL',
      });
    });

    it('does not change the original instance', () => {
      const a = Money.from({ amount: '10.00', currency: 'BRL' });
      const b = Money.from({ amount: '5.50', currency: 'BRL' });

      a.subtract(b);

      expect(a.toJSON()).toEqual({ amount: '10.00', currency: 'BRL' });
    });

    it('rejects amounts of different currencies', () => {
      const brl = Money.from({ amount: '10.00', currency: 'BRL' });
      const usd = Money.from({ amount: '5.00', currency: 'USD' });

      expect(() => brl.subtract(usd)).toThrow(CurrencyMismatchError);
    });

    it('allows a negative result', () => {
      const a = Money.from({ amount: '5.00', currency: 'BRL' });
      const b = Money.from({ amount: '10.50', currency: 'BRL' });

      expect(a.subtract(b).toJSON()).toEqual({
        amount: '-5.50',
        currency: 'BRL',
      });
    });

    it('keeps the sign when the whole part is zero', () => {
      const a = Money.from({ amount: '0.00', currency: 'BRL' });
      const b = Money.from({ amount: '0.50', currency: 'BRL' });

      expect(a.subtract(b).toJSON()).toEqual({
        amount: '-0.50',
        currency: 'BRL',
      });
    });
  });

  describe('zero', () => {
    it('creates a zero amount in the given currency', () => {
      expect(Money.zero('BRL').toJSON()).toEqual({
        amount: '0.00',
        currency: 'BRL',
      });
    });

    it('rejects an invalid currency', () => {
      expect(() => Money.zero('real')).toThrow(InvalidCurrencyError);
    });
  });

  describe('negate', () => {
    it('inverts a positive amount', () => {
      const money = Money.from({ amount: '10.00', currency: 'BRL' });

      expect(money.negate().toJSON()).toEqual({
        amount: '-10.00',
        currency: 'BRL',
      });
    });

    it('inverts a negative amount', () => {
      const a = Money.from({ amount: '5.00', currency: 'BRL' });
      const b = Money.from({ amount: '10.50', currency: 'BRL' });
      const negative = a.subtract(b);

      expect(negative.negate().toJSON()).toEqual({
        amount: '5.50',
        currency: 'BRL',
      });
    });
  });

  describe('comparisons', () => {
    const zero = Money.zero('BRL');
    const ten = Money.from({ amount: '10.00', currency: 'BRL' });
    const negative = zero.subtract(ten);

    it('detects zero', () => {
      expect(zero.isZero()).toBe(true);
      expect(ten.isZero()).toBe(false);
    });

    it('detects positive amounts', () => {
      expect(ten.isPositive()).toBe(true);
      expect(zero.isPositive()).toBe(false);
    });

    it('detects negative amounts', () => {
      expect(negative.isNegative()).toBe(true);
      expect(zero.isNegative()).toBe(false);
    });

    it('compares amounts with isLessThan', () => {
      expect(zero.isLessThan(ten)).toBe(true);
      expect(ten.isLessThan(zero)).toBe(false);
    });

    it('rejects isLessThan between different currencies', () => {
      const usd = Money.from({ amount: '10.00', currency: 'USD' });

      expect(() => ten.isLessThan(usd)).toThrow(CurrencyMismatchError);
    });

    it('compares value and currency with equals', () => {
      const anotherTen = Money.from({ amount: '10.00', currency: 'BRL' });
      const tenDollars = Money.from({ amount: '10.00', currency: 'USD' });

      expect(ten.equals(anotherTen)).toBe(true);
      expect(ten.equals(tenDollars)).toBe(false);
    });
  });
});
