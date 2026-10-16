import { describe, expect, it } from 'bun:test';
import { Money } from './money';

describe('Money', () => {
  describe('from', () => {
    it('accepts a valid decimal string', () => {
      const money = Money.from({ amount: '25.00', currency: 'BRL' });

      expect(money.toJSON()).toEqual({ amount: '25.00', currency: 'BRL' });
    });
  });
});
