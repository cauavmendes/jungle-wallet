import { describe, expect, it } from 'bun:test';
import { InboxMessage } from './inbox-message';

const receivedAt = new Date('2026-10-16T12:00:00Z');
const later = new Date('2026-10-16T12:00:05Z');

function receive(): InboxMessage {
  return InboxMessage.receive({
    messageId: 'msg-1',
    consumerName: 'wager-transactions',
    payloadHash: 'hash-1',
    receivedAt,
  });
}

describe('InboxMessage', () => {
  it('starts unprocessed', () => {
    expect(receive().isProcessed()).toBe(false);
  });

  it('records when it was processed', () => {
    const message = receive();

    message.markProcessed(later);

    expect(message.isProcessed()).toBe(true);
    expect(message.processedAt).toEqual(later);
  });

  it('keeps the first processing time', () => {
    const message = receive();

    message.markProcessed(receivedAt);
    message.markProcessed(later);

    expect(message.processedAt).toEqual(receivedAt);
  });
});
