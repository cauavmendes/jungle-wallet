import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EVENT_PUBLISHER,
  type EventPublisher,
} from '../application/event-publisher';
import { OutboxMessage } from '../domain/outbox-message';

interface OutboxRow {
  id: string;
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  occurred_at: Date;
  attempts: number;
  next_attempt_at: Date | null;
  published_at: Date | null;
}

@Injectable()
export class OutboxRelay {
  private readonly logger = new Logger(OutboxRelay.name);

  constructor(
    private readonly em: EntityManager,
    @Inject(EVENT_PUBLISHER)
    private readonly publisher: EventPublisher,
  ) {}

  async publishPending(batchSize = 10): Promise<number> {
    return this.em.fork().transactional(async (em) => {
      const rows = (await em.execute(
        `SELECT id, aggregate_id, event_type, payload, occurred_at,
                attempts, next_attempt_at, published_at
           FROM outbox_messages
          WHERE published_at IS NULL AND next_attempt_at <= now()
          ORDER BY occurred_at
          LIMIT :batchSize
          FOR UPDATE SKIP LOCKED`,
        { batchSize },
      )) as OutboxRow[];

      for (const row of rows) {
        await this.publishOne(em, toOutboxMessage(row));
      }

      return rows.length;
    });
  }

  private async publishOne(
    em: EntityManager,
    message: OutboxMessage,
  ): Promise<void> {
    const now = new Date();

    try {
      await this.publisher.publish(message);
      message.markPublished(now);
      await em.execute(
        'UPDATE outbox_messages SET published_at = :publishedAt WHERE id = :id',
        { id: message.id, publishedAt: now },
      );
    } catch (error) {
      message.scheduleRetry(now);
      await em.execute(
        `UPDATE outbox_messages
            SET attempts = :attempts, next_attempt_at = :nextAttemptAt
          WHERE id = :id`,
        {
          id: message.id,
          attempts: message.attempts,
          nextAttemptAt: message.nextAttemptAt,
        },
      );
      this.logger.warn(
        `Failed to publish outbox message ${message.id} (attempt ${message.attempts}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

function toOutboxMessage(row: OutboxRow): OutboxMessage {
  return OutboxMessage.rehydrate({
    id: row.id,
    aggregateId: row.aggregate_id,
    eventType: row.event_type,
    payload: row.payload,
    occurredAt: row.occurred_at,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at ?? undefined,
    publishedAt: row.published_at ?? undefined,
  });
}
