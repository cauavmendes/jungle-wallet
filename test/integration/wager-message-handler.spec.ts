import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import mikroOrmConfig from '../../src/infrastructure/database/mikro-orm.config';
import { Money } from '../../src/shared/domain/money';
import { ProcessWagerTransactionUseCase } from '../../src/wagering/application/process-wager-transaction.use-case';
import { SqlWagerProcessingStore } from '../../src/wagering/infrastructure/sql-wager-processing.store';
import {
  MessageDisposition,
  WagerMessageHandler,
} from '../../src/wagering/interface/sqs/wager-message.handler';
import { CreateWalletUseCase } from '../../src/wallet/application/create-wallet.use-case';
import type { Wallet } from '../../src/wallet/domain/wallet';
import { SqlWalletRepository } from '../../src/wallet/infrastructure/sql-wallet.repository';

let orm: MikroORM;
let createWallet: CreateWalletUseCase;
let handler: WagerMessageHandler;

beforeAll(async () => {
  orm = await MikroORM.init(mikroOrmConfig);
  await orm.migrator.up();
  createWallet = new CreateWalletUseCase(
    new SqlWalletRepository(orm.em.fork()),
  );
  const store = new SqlWagerProcessingStore(orm.em);
  handler = new WagerMessageHandler(
    new ProcessWagerTransactionUseCase(store),
    store,
  );
});

afterAll(async () => {
  await orm.close(true);
});

function openWallet(initialBalance: string): Promise<Wallet> {
  return createWallet.execute({
    playerId: randomUUID(),
    initialBalance: Money.from({ amount: initialBalance, currency: 'BRL' }),
  });
}

function messageBody(
  wallet: Wallet,
  data: Record<string, unknown> = {},
): string {
  const externalTransactionId = randomUUID();

  return JSON.stringify({
    messageId: randomUUID(),
    type: 'WagerTransactionRequested',
    occurredAt: new Date().toISOString(),
    data: {
      providerId: 'provider-a',
      externalTransactionId,
      idempotencyKey: `provider-a:${externalTransactionId}`,
      playerId: wallet.playerId,
      walletId: wallet.id,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: 'BET',
      money: { amount: '25.00', currency: 'BRL' },
      ...data,
    },
  });
}

async function balanceOf(walletId: string): Promise<string> {
  const [row] = (await orm.em
    .fork()
    .execute('SELECT balance_cents FROM wallets WHERE id = :walletId', {
      walletId,
    })) as { balance_cents: string }[];

  return row?.balance_cents ?? '';
}

async function countDebits(walletId: string): Promise<number> {
  const [row] = (await orm.em.fork().execute(
    `SELECT COUNT(*)::int AS total
       FROM wallet_ledger_entries
      WHERE wallet_id = :walletId AND direction = 'DEBIT'`,
    { walletId },
  )) as { total: number }[];

  return row?.total ?? 0;
}

describe('wager message handler', () => {
  it('processes a message and acknowledges it', async () => {
    const wallet = await openWallet('100.00');

    const result = await handler.handle(messageBody(wallet));

    expect(result.disposition).toBe(MessageDisposition.Ack);
    expect(await balanceOf(wallet.id)).toBe('7500');
  });

  it('does not debit twice when a message is redelivered after the commit', async () => {
    const wallet = await openWallet('100.00');
    const body = messageBody(wallet);

    const firstDelivery = await handler.handle(body);
    const redelivery = await handler.handle(body);

    expect(firstDelivery.disposition).toBe(MessageDisposition.Ack);
    expect(redelivery.disposition).toBe(MessageDisposition.Ack);
    expect(redelivery.reason).toBe('duplicate message');
    expect(await countDebits(wallet.id)).toBe(1);
    expect(await balanceOf(wallet.id)).toBe('7500');
  });

  it('debits once when the same message is delivered concurrently', async () => {
    const wallet = await openWallet('100.00');
    const body = messageBody(wallet);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => handler.handle(body)),
    );

    expect(
      results.every((result) => result.disposition === MessageDisposition.Ack),
    ).toBe(true);
    expect(await countDebits(wallet.id)).toBe(1);
  });

  it('acknowledges a business rejection', async () => {
    const wallet = await openWallet('100.00');

    const result = await handler.handle(
      messageBody(wallet, { money: { amount: '500.00', currency: 'BRL' } }),
    );

    expect(result.disposition).toBe(MessageDisposition.Ack);
    expect(await balanceOf(wallet.id)).toBe('10000');
  });

  it('sends malformed messages to the dead letter queue', async () => {
    const wallet = await openWallet('100.00');

    const notJson = await handler.handle('not json');
    const internalKind = await handler.handle(
      messageBody(wallet, { kind: 'OPENING' }),
    );

    expect(notJson.disposition).toBe(MessageDisposition.DeadLetter);
    expect(internalKind.disposition).toBe(MessageDisposition.DeadLetter);
    expect(await balanceOf(wallet.id)).toBe('10000');
  });
});
