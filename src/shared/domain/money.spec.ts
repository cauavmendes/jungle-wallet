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
});
