import { Module } from '@nestjs/common';
import { EVENT_PUBLISHER } from './application/event-publisher';
import { OutboxRelay } from './infrastructure/outbox-relay';
import { OutboxWorker } from './infrastructure/outbox-worker';
import { SqsEventPublisher } from './infrastructure/sqs-event-publisher';

@Module({
  providers: [
    OutboxRelay,
    OutboxWorker,
    { provide: EVENT_PUBLISHER, useClass: SqsEventPublisher },
  ],
})
export class OutboxModule {}
