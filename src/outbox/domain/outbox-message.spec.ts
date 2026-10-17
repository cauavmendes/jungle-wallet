import { describe, expect, it } from 'bun:test';
import { OutboxMessage } from './outbox-message';

const now = new Date('2026-10-16T12:00:00Z');

function pendingMessage(): OutboxMessage {
  return OutboxMessage.rehydrate({
    id: 'event-1',
    aggregateId: 'wallet-1',
    eventType: 'WalletBalanceChanged',
    payload: {},
    occurredAt: now,
    attempts: 0,
    nextAttemptAt: undefined,
    publishedAt: undefined,
  });
}

describe('OutboxMessage', () => {
  it('is due while pending and never scheduled', () => {
    expect(pendingMessage().isDue(now)).toBe(true);
  });

  it('is no longer pending after being published', () => {
    const message = pendingMessage();

    message.markPublished(now);

    expect(message.isPending()).toBe(false);
    expect(message.isDue(now)).toBe(false);
  });

  it('doubles the retry delay on each failure', () => {
    const message = pendingMessage();

    message.scheduleRetry(now);
    expect(message.nextAttemptAt?.getTime()).toBe(now.getTime() + 1_000);

    message.scheduleRetry(now);
    expect(message.nextAttemptAt?.getTime()).toBe(now.getTime() + 2_000);

    message.scheduleRetry(now);
    expect(message.nextAttemptAt?.getTime()).toBe(now.getTime() + 4_000);
    expect(message.attempts).toBe(3);
  });

  it('caps the retry delay at five minutes', () => {
    const message = pendingMessage();

    for (let attempt = 0; attempt < 20; attempt += 1) {
      message.scheduleRetry(now);
    }

    expect(message.nextAttemptAt?.getTime()).toBe(now.getTime() + 300_000);
  });

  it('is not due before the scheduled retry', () => {
    const message = pendingMessage();

    message.scheduleRetry(now);

    expect(message.isDue(now)).toBe(false);
    expect(message.isDue(new Date(now.getTime() + 1_000))).toBe(true);
  });
});
