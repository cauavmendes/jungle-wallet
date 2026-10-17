import { randomUUID } from 'node:crypto';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { createSqsClient } from '../src/shared/infrastructure/sqs-client';

async function main(): Promise<void> {
  const [
    walletId,
    playerId,
    amount = '25.00',
    kind = 'BET',
    messageId = randomUUID(),
  ] = process.argv.slice(2);

  if (!walletId || !playerId) {
    console.error(
      'Usage: bun run sqs:send <walletId> <playerId> [amount] [kind] [messageId]',
    );
    process.exit(1);
  }

  const externalTransactionId = randomUUID();
  const body = {
    messageId,
    type: 'WagerTransactionRequested',
    occurredAt: new Date().toISOString(),
    data: {
      providerId: 'provider-a',
      externalTransactionId,
      idempotencyKey: `provider-a:${externalTransactionId}`,
      playerId,
      walletId,
      roundId: 'round-1',
      gameId: 'fortune-chimp',
      kind,
      money: { amount, currency: 'BRL' },
    },
  };

  await createSqsClient().send(
    new SendMessageCommand({
      QueueUrl:
        process.env.WAGER_QUEUE_URL ??
        'http://localhost:4566/000000000000/wager-transactions.fifo',
      MessageBody: JSON.stringify(body),
      MessageGroupId: walletId,
      MessageDeduplicationId: randomUUID(),
    }),
  );

  console.log(`Sent message ${messageId}`);
}

void main();
