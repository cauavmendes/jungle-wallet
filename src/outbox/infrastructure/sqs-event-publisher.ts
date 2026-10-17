import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { Injectable } from '@nestjs/common';
import type { EventPublisher } from '../application/event-publisher';
import type { OutboxMessage } from '../domain/outbox-message';

@Injectable()
export class SqsEventPublisher implements EventPublisher {
  private readonly client = new SQSClient({
    endpoint: process.env.SQS_ENDPOINT ?? 'http://localhost:4566',
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
    },
  });

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
