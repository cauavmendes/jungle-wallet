import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  type Message,
  ReceiveMessageCommand,
  SendMessageCommand,
} from '@aws-sdk/client-sqs';
import {
  type BeforeApplicationShutdown,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { Metrics } from '../../../metrics/metrics';
import { createSqsClient } from '../../../shared/infrastructure/sqs-client';
import {
  type HandledMessage,
  MessageDisposition,
  WagerMessageHandler,
} from './wager-message.handler';

const MAX_MESSAGES_PER_POLL = 10;
const LONG_POLL_SECONDS = 5;
const BASE_RETRY_VISIBILITY_SECONDS = 2;
const MAX_RETRY_VISIBILITY_SECONDS = 300;
const ERROR_PAUSE_MS = 1_000;

@Injectable()
export class WagerTransactionConsumer
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger(WagerTransactionConsumer.name);
  private readonly client = createSqsClient();
  private readonly queueUrl =
    process.env.WAGER_QUEUE_URL ??
    'http://localhost:4566/000000000000/wager-transactions.fifo';
  private readonly deadLetterQueueUrl =
    process.env.WAGER_DLQ_URL ??
    'http://localhost:4566/000000000000/wager-transactions-dlq.fifo';
  private running = false;
  private loop: Promise<void> | undefined;

  constructor(
    private readonly handler: WagerMessageHandler,
    private readonly metrics: Metrics,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.SQS_CONSUMER_ENABLED === 'false') {
      return;
    }

    this.running = true;
    this.loop = this.run();
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.running = false;
    await this.loop;
  }

  private async run(): Promise<void> {
    while (this.running) {
      try {
        const { Messages: messages = [] } = await this.client.send(
          new ReceiveMessageCommand({
            QueueUrl: this.queueUrl,
            MaxNumberOfMessages: MAX_MESSAGES_PER_POLL,
            WaitTimeSeconds: LONG_POLL_SECONDS,
            MessageSystemAttributeNames: [
              'ApproximateReceiveCount',
              'MessageGroupId',
            ],
          }),
        );

        for (const [index, message] of messages.entries()) {
          if (!this.running) {
            await this.release(messages.slice(index));
            break;
          }

          await this.process(message);
        }
      } catch (error) {
        this.logger.error(`SQS consumer failed: ${describe(error)}`);
        await sleep(ERROR_PAUSE_MS);
      }
    }
  }

  private async process(message: Message): Promise<void> {
    const result = await this.handler.handle(message.Body ?? '');

    switch (result.disposition) {
      case MessageDisposition.Ack:
        await this.delete(message);
        break;
      case MessageDisposition.DeadLetter:
        this.metrics.deadLetteredTotal.inc();
        await this.moveToDeadLetterQueue(message, result);
        break;
      case MessageDisposition.Retry:
        this.metrics.retriesTotal.inc();
        await this.scheduleRetry(message, result);
        break;
    }
  }

  private async delete(message: Message): Promise<void> {
    await this.client.send(
      new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: message.ReceiptHandle,
      }),
    );
  }

  private async moveToDeadLetterQueue(
    message: Message,
    result: HandledMessage,
  ): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.deadLetterQueueUrl,
        MessageBody: message.Body ?? '',
        MessageGroupId: message.Attributes?.MessageGroupId ?? 'dead-letter',
        MessageDeduplicationId: message.MessageId,
        MessageAttributes: {
          failureReason: {
            DataType: 'String',
            StringValue: result.reason ?? 'unknown',
          },
        },
      }),
    );
    await this.delete(message);
    this.logger.warn({
      message: 'Message moved to the dead letter queue',
      messageId: message.MessageId,
      reason: result.reason,
    });
  }

  private async scheduleRetry(
    message: Message,
    result: HandledMessage,
  ): Promise<void> {
    const receiveCount = Number(
      message.Attributes?.ApproximateReceiveCount ?? '1',
    );
    const visibilityTimeout = Math.min(
      BASE_RETRY_VISIBILITY_SECONDS * 2 ** (receiveCount - 1),
      MAX_RETRY_VISIBILITY_SECONDS,
    );

    await this.client.send(
      new ChangeMessageVisibilityCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: message.ReceiptHandle,
        VisibilityTimeout: visibilityTimeout,
      }),
    );
    this.logger.warn({
      message: 'Message scheduled for retry',
      messageId: message.MessageId,
      retryInSeconds: visibilityTimeout,
      reason: result.reason,
    });
  }

  private async release(messages: Message[]): Promise<void> {
    for (const message of messages) {
      await this.client.send(
        new ChangeMessageVisibilityCommand({
          QueueUrl: this.queueUrl,
          ReceiptHandle: message.ReceiptHandle,
          VisibilityTimeout: 0,
        }),
      );
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
