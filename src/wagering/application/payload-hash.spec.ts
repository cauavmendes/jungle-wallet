import { describe, expect, it } from 'bun:test';
import {
  canonicalJson,
  hashWagerPayload,
  type WagerPayload,
} from './payload-hash';

const payload: WagerPayload = {
  providerId: 'provider-a',
  externalTransactionId: 'transaction-123',
  playerId: 'player-1',
  walletId: 'wallet-1',
  roundId: 'round-987',
  gameId: 'fortune-chimp',
  kind: 'BET',
  money: { amount: '25.00', currency: 'BRL' },
  referenceExternalTransactionId: null,
};

describe('canonicalJson', () => {
  it('sorts keys at every level', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      '{"a":{"c":3,"d":2},"b":1}',
    );
  });
});

describe('hashWagerPayload', () => {
  it('produces a 64 character hex digest', () => {
    expect(hashWagerPayload(payload)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ignores key order', () => {
    const reordered: WagerPayload = {
      referenceExternalTransactionId: null,
      money: { currency: 'BRL', amount: '25.00' },
      kind: 'BET',
      gameId: 'fortune-chimp',
      roundId: 'round-987',
      walletId: 'wallet-1',
      playerId: 'player-1',
      externalTransactionId: 'transaction-123',
      providerId: 'provider-a',
    };

    expect(hashWagerPayload(reordered)).toBe(hashWagerPayload(payload));
  });

  it('changes when a business field changes', () => {
    const changed: WagerPayload = {
      ...payload,
      money: { amount: '30.00', currency: 'BRL' },
    };

    expect(hashWagerPayload(changed)).not.toBe(hashWagerPayload(payload));
  });
});
