import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  Counter,
  collectDefaultMetrics,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

@Injectable()
export class Metrics {
  readonly registry = new Registry();

  readonly transactionsTotal = new Counter({
    name: 'wager_transactions_total',
    help: 'Wager transactions handled, by final status and entry point',
    labelNames: ['status', 'source'],
    registers: [this.registry],
  });

  readonly duplicatesTotal = new Counter({
    name: 'wager_duplicates_total',
    help: 'Duplicate requests or messages detected',
    labelNames: ['source'],
    registers: [this.registry],
  });

  readonly retriesTotal = new Counter({
    name: 'sqs_message_retries_total',
    help: 'SQS messages returned to the queue for a retry',
    registers: [this.registry],
  });

  readonly deadLetteredTotal = new Counter({
    name: 'sqs_dead_lettered_total',
    help: 'SQS messages moved to the dead letter queue',
    registers: [this.registry],
  });

  readonly lockConflictsTotal = new Counter({
    name: 'wallet_lock_conflicts_total',
    help: 'Wallet lock timeouts and version conflicts',
    labelNames: ['reason'],
    registers: [this.registry],
  });

  readonly processingDuration = new Histogram({
    name: 'wager_processing_duration_seconds',
    help: 'Time to process a wager transaction',
    labelNames: ['source'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });

  readonly outboxLag: Gauge;

  constructor(em: EntityManager) {
    collectDefaultMetrics({ register: this.registry });

    this.outboxLag = new Gauge({
      name: 'outbox_lag_seconds',
      help: 'Age of the oldest unpublished outbox message',
      registers: [this.registry],
      async collect() {
        const [row] = (await em.fork().execute(
          `SELECT COALESCE(EXTRACT(EPOCH FROM now() - MIN(occurred_at)), 0)::float AS lag
             FROM outbox_messages
            WHERE published_at IS NULL`,
        )) as { lag: number }[];

        this.set(Number(row?.lag ?? 0));
      },
    });
  }
}
