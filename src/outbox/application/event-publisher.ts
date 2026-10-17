import type { OutboxMessage } from '../domain/outbox-message';

export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');

export interface EventPublisher {
  publish(message: OutboxMessage): Promise<void>;
}
