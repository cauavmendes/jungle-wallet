import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { Injectable } from '@nestjs/common';
import { createSqsClient } from '../../shared/infrastructure/sqs-client';
import type { EventPublisher } from '../application/event-publisher';
import type { OutboxMessage } from '../domain/outbox-message';

@Injectable()
export class SqsEventPublisher implements EventPublisher {
  private readonly client = createSqsClient();

  private readonly queueUrl =
    process.env.EVENTS_QUEUE_URL ??
    'http://localhost:4566/000000000000/wallet-events.fifo';

  async publish(message: OutboxMessage): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(message.payload),
        MessageGroupId: message.aggregateId,
        MessageDeduplicationId: message.id,
        MessageAttributes: {
          eventType: { DataType: 'String', StringValue: message.eventType },
        },
      }),
    );
  }
}
