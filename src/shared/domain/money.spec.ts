import { describe, expect, it } from 'bun:test';
import { Money } from './money';

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
});
