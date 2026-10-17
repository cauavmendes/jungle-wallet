import { randomUUID } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import mikroOrmConfig from '../../src/infrastructure/database/mikro-orm.config';
import type { EventPublisher } from '../../src/outbox/application/event-publisher';
import type { OutboxMessage } from '../../src/outbox/domain/outbox-message';
import { OutboxRelay } from '../../src/outbox/infrastructure/outbox-relay';

class RecordingPublisher implements EventPublisher {
  readonly published: string[] = [];

  async publish(message: OutboxMessage): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 5));
    this.published.push(message.id);
  }
}

class FailingPublisher implements EventPublisher {
  async publish(): Promise<void> {
    throw new Error('SQS unavailable');
  }
}

let orm: MikroORM;

beforeAll(async () => {
  orm = await MikroORM.init(mikroOrmConfig);
  await orm.migrator.up();
});

beforeEach(async () => {
  await orm.em.fork().execute('DELETE FROM outbox_messages');
});

afterAll(async () => {
  await orm.close(true);
});

async function insertPendingEvents(count: number): Promise<string[]> {
  const em = orm.em.fork();
  const ids = Array.from({ length: count }, () => randomUUID());

  for (const id of ids) {
    await em.execute(
      `INSERT INTO outbox_messages (id, aggregate_id, event_type, payload, occurred_at)
       VALUES (:id, :aggregateId, 'TestEvent', CAST(:payload AS jsonb), now())`,
      {
        id,
        aggregateId: randomUUID(),
        payload: JSON.stringify({ eventId: id }),
      },
    );
  }

  return ids;
}

async function drain(relay: OutboxRelay): Promise<void> {
  let published: number;

  do {
    published = await relay.publishPending(5);
  } while (published > 0);
}

async function pendingCount(): Promise<number> {
  const [row] = (await orm.em
    .fork()
    .execute(
      'SELECT COUNT(*)::int AS total FROM outbox_messages WHERE published_at IS NULL',
    )) as { total: number }[];

  return row?.total ?? 0;
}

describe('outbox relay', () => {
  it('publishes every pending event exactly once with two concurrent relays', async () => {
    const ids = await insertPendingEvents(30);
    const firstPublisher = new RecordingPublisher();
    const secondPublisher = new RecordingPublisher();

    await Promise.all([
      drain(new OutboxRelay(orm.em, firstPublisher)),
      drain(new OutboxRelay(orm.em, secondPublisher)),
    ]);

    const published = [
      ...firstPublisher.published,
      ...secondPublisher.published,
    ];
    expect(published).toHaveLength(30);
    expect(new Set(published)).toEqual(new Set(ids));
    expect(await pendingCount()).toBe(0);
  });

  it('publishes events left behind by a process that died after the commit', async () => {
    const ids = await insertPendingEvents(3);
    const publisher = new RecordingPublisher();

    await drain(new OutboxRelay(orm.em, publisher));

    expect(new Set(publisher.published)).toEqual(new Set(ids));
    expect(await pendingCount()).toBe(0);
  });

  it('keeps the event pending and schedules a retry when publishing fails', async () => {
    const [id] = await insertPendingEvents(1);
    const relay = new OutboxRelay(orm.em, new FailingPublisher());

    expect(await relay.publishPending()).toBe(1);

    const [row] = (await orm.em.fork().execute(
      `SELECT attempts, published_at, next_attempt_at > now() AS scheduled_in_future
         FROM outbox_messages
        WHERE id = :id`,
      { id },
    )) as {
      attempts: number;
      published_at: Date | null;
      scheduled_in_future: boolean;
    }[];

    expect(row?.attempts).toBe(1);
    expect(row?.published_at).toBeNull();
    expect(row?.scheduled_in_future).toBe(true);
    expect(await relay.publishPending()).toBe(0);
  });
});
