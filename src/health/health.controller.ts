import { GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { EntityManager } from '@mikro-orm/postgresql';
import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { createSqsClient } from '../shared/infrastructure/sqs-client';

const CHECK_TIMEOUT_MS = 2_000;

type CheckStatus = 'up' | 'down';

export interface ReadinessResponse {
  status: 'ok' | 'unavailable';
  checks: { database: CheckStatus; queue: CheckStatus };
}

@Controller('health')
export class HealthController {
  private readonly sqs = createSqsClient();
  private readonly queueUrl =
    process.env.WAGER_QUEUE_URL ??
    'http://localhost:4566/000000000000/wager-transactions.fifo';

  constructor(private readonly em: EntityManager) {}

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReadinessResponse> {
    const [database, queue] = await Promise.all([
      check(() => this.em.fork().execute('SELECT 1')),
      check(() =>
        this.sqs.send(
          new GetQueueAttributesCommand({
            QueueUrl: this.queueUrl,
            AttributeNames: ['QueueArn'],
          }),
        ),
      ),
    ]);
    const ready = database === 'up' && queue === 'up';

    response.status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return {
      status: ready ? 'ok' : 'unavailable',
      checks: { database, queue },
    };
  }
}

async function check(probe: () => Promise<unknown>): Promise<CheckStatus> {
  try {
    await Promise.race([
      probe(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS),
      ),
    ]);
    return 'up';
  } catch {
    return 'down';
  }
}
