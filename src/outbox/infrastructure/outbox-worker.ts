import {
  type BeforeApplicationShutdown,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { OutboxRelay } from './outbox-relay';

const POLL_INTERVAL_MS = 1_000;

@Injectable()
export class OutboxWorker
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger(OutboxWorker.name);
  private running = false;
  private loop: Promise<void> | undefined;

  constructor(private readonly relay: OutboxRelay) {}

  onApplicationBootstrap(): void {
    if (process.env.OUTBOX_WORKER_ENABLED === 'false') {
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
        const published = await this.relay.publishPending();

        if (published === 0) {
          await sleep(POLL_INTERVAL_MS);
        }
      } catch (error) {
        this.logger.error(
          `Outbox relay failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        await sleep(POLL_INTERVAL_MS);
      }
    }
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
