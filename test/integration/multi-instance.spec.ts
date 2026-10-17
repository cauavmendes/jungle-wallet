import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import type { Subprocess } from 'bun';
import mikroOrmConfig from '../../src/infrastructure/database/mikro-orm.config';

const PORTS = [3101, 3102, 3103];
const STARTUP_TIMEOUT_MS = 20_000;

interface CreatedWallet {
  id: string;
  playerId: string;
}

interface ReconciliationBody {
  storedBalance: { amount: string };
  consistent: boolean;
}

let instances: Subprocess[] = [];

beforeAll(async () => {
  const orm = await MikroORM.init(mikroOrmConfig);
  await orm.migrator.up();
  await orm.close(true);

  instances = PORTS.map((port) =>
    Bun.spawn([process.execPath, 'src/main.ts'], {
      env: {
        ...process.env,
        PORT: String(port),
        SQS_CONSUMER_ENABLED: 'false',
        OUTBOX_WORKER_ENABLED: 'false',
      },
      stdout: 'ignore',
      stderr: 'ignore',
    }),
  );

  await Promise.all(PORTS.map(waitUntilLive));
});

afterAll(() => {
  for (const instance of instances) {
    instance.kill();
  }
});

function instanceUrl(index: number): string {
  return `http://localhost:${PORTS[index % PORTS.length]}`;
}

async function waitUntilLive(port: number): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://localhost:${port}/health/live`);

      if (response.ok) {
        return;
      }
    } catch {
      await Bun.sleep(200);
    }
  }

  throw new Error(`Instance on port ${port} did not start`);
}

async function createWallet(amount: string): Promise<CreatedWallet> {
  const response = await fetch(`${instanceUrl(0)}/wallets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      playerId: randomUUID(),
      initialBalance: { amount, currency: 'BRL' },
    }),
  });

  return (await response.json()) as CreatedWallet;
}

function bet(
  wallet: CreatedWallet,
  externalTransactionId: string,
  amount: string,
  instance: number,
): Promise<Response> {
  return fetch(`${instanceUrl(instance)}/wagering/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `provider-a:${externalTransactionId}`,
    },
    body: JSON.stringify({
      providerId: 'provider-a',
      externalTransactionId,
      playerId: wallet.playerId,
      walletId: wallet.id,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: 'BET',
      money: { amount, currency: 'BRL' },
    }),
  });
}

async function reconcile(walletId: string): Promise<ReconciliationBody> {
  const response = await fetch(
    `${instanceUrl(1)}/wallets/${walletId}/reconciliation`,
    { method: 'POST' },
  );

  return (await response.json()) as ReconciliationBody;
}

describe('three application instances', () => {
  it('debits once when the same bet hits three instances 60 times in parallel', async () => {
    const wallet = await createWallet('100.00');
    const externalTransactionId = randomUUID();

    const responses = await Promise.all(
      Array.from({ length: 60 }, (_, index) =>
        bet(wallet, externalTransactionId, '25.00', index),
      ),
    );
    const statuses = responses.map((response) => response.status);

    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 200)).toHaveLength(59);

    const reconciliation = await reconcile(wallet.id);
    expect(reconciliation.storedBalance.amount).toBe('75.00');
    expect(reconciliation.consistent).toBe(true);
  });

  it('accepts only one of two 80.00 bets sent to different instances', async () => {
    const wallet = await createWallet('100.00');

    const responses = await Promise.all([
      bet(wallet, randomUUID(), '80.00', 0),
      bet(wallet, randomUUID(), '80.00', 1),
    ]);
    const statuses = responses.map((response) => response.status).sort();

    expect(statuses).toEqual([201, 422]);

    const reconciliation = await reconcile(wallet.id);
    expect(reconciliation.storedBalance.amount).toBe('20.00');
    expect(reconciliation.consistent).toBe(true);
  });

  it('never loses an update when 30 bets race across three instances', async () => {
    const wallet = await createWallet('100.00');

    const responses = await Promise.all(
      Array.from({ length: 30 }, (_, index) =>
        bet(wallet, randomUUID(), '10.00', index),
      ),
    );
    const statuses = responses.map((response) => response.status);

    expect(statuses.filter((status) => status === 201)).toHaveLength(10);
    expect(statuses.filter((status) => status === 422)).toHaveLength(20);

    const reconciliation = await reconcile(wallet.id);
    expect(reconciliation.storedBalance.amount).toBe('0.00');
    expect(reconciliation.consistent).toBe(true);
  });
});
