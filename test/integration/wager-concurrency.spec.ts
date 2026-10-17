import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import mikroOrmConfig from '../../src/infrastructure/database/mikro-orm.config';
import { Money } from '../../src/shared/domain/money';
import {
  type ProcessWagerCommand,
  ProcessWagerTransactionUseCase,
} from '../../src/wagering/application/process-wager-transaction.use-case';
import {
  FailureCode,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../src/wagering/domain/wager-transaction';
import { SqlWagerProcessingStore } from '../../src/wagering/infrastructure/sql-wager-processing.store';
import { CreateWalletUseCase } from '../../src/wallet/application/create-wallet.use-case';
import type { Wallet } from '../../src/wallet/domain/wallet';
import { SqlWalletRepository } from '../../src/wallet/infrastructure/sql-wallet.repository';

let orm: MikroORM;
let createWallet: CreateWalletUseCase;
let processWager: ProcessWagerTransactionUseCase;

const brl = (amount: string) => Money.from({ amount, currency: 'BRL' });

beforeAll(async () => {
  orm = await MikroORM.init(mikroOrmConfig);
  await orm.migrator.up();
  createWallet = new CreateWalletUseCase(
    new SqlWalletRepository(orm.em.fork()),
  );
  processWager = new ProcessWagerTransactionUseCase(
    new SqlWagerProcessingStore(orm.em),
  );
});

afterAll(async () => {
  await orm.close(true);
});

function openWallet(initialBalance: string): Promise<Wallet> {
  return createWallet.execute({
    playerId: randomUUID(),
    initialBalance: brl(initialBalance),
  });
}

function betCommand(
  wallet: Wallet,
  overrides: Partial<ProcessWagerCommand> = {},
): ProcessWagerCommand {
  const externalTransactionId = randomUUID();

  return {
    idempotencyKey: `provider-a:${externalTransactionId}`,
    correlationId: randomUUID(),
    providerId: 'provider-a',
    externalTransactionId,
    playerId: wallet.playerId,
    walletId: wallet.id,
    roundId: 'round-1',
    gameId: 'game-1',
    kind: WagerTransactionKind.Bet,
    money: brl('25.00'),
    referenceExternalTransactionId: undefined,
    ...overrides,
  };
}

async function balances(walletId: string) {
  const em = orm.em.fork();
  const [wallet] = (await em.execute(
    'SELECT balance_cents FROM wallets WHERE id = :walletId',
    { walletId },
  )) as { balance_cents: string }[];
  const [ledger] = (await em.execute(
    `SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount_cents ELSE -amount_cents END), 0)::text AS balance
       FROM wallet_ledger_entries
      WHERE wallet_id = :walletId`,
    { walletId },
  )) as { balance: string }[];

  return {
    stored: BigInt(wallet?.balance_cents ?? '0'),
    fromLedger: BigInt(ledger?.balance ?? '0'),
  };
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

async function eventTypesFor(transactionId: string): Promise<string[]> {
  const rows = (await orm.em.fork().execute(
    `SELECT event_type
       FROM outbox_messages
      WHERE payload -> 'data' ->> 'transactionId' = :transactionId
      ORDER BY event_type`,
    { transactionId },
  )) as { event_type: string }[];

  return rows.map((row) => row.event_type);
}

describe('wager processing under concurrency', () => {
  it('debits only once when the same bet arrives 50 times in parallel', async () => {
    const wallet = await openWallet('1000.00');
    const command = betCommand(wallet);

    const results = await Promise.all(
      Array.from({ length: 50 }, () => processWager.execute(command)),
    );

    expect(results.filter((result) => !result.idempotentReplay)).toHaveLength(
      1,
    );
    expect(new Set(results.map((result) => result.transactionId)).size).toBe(1);
    expect(
      results.every(
        (result) => result.status === WagerTransactionStatus.Processed,
      ),
    ).toBe(true);
    expect(
      results.every((result) => result.balance?.toJSON().amount === '975.00'),
    ).toBe(true);
    expect(await countDebits(wallet.id)).toBe(1);

    const transactionId = results[0]?.transactionId ?? '';
    expect(await eventTypesFor(transactionId)).toEqual([
      'WagerTransactionProcessed',
      'WalletBalanceChanged',
    ]);

    const { stored, fromLedger } = await balances(wallet.id);
    expect(stored).toBe(97500n);
    expect(fromLedger).toBe(stored);
  });

  it('accepts only one of two simultaneous 80.00 bets on 100.00', async () => {
    const wallet = await openWallet('100.00');

    const results = await Promise.all([
      processWager.execute(betCommand(wallet, { money: brl('80.00') })),
      processWager.execute(betCommand(wallet, { money: brl('80.00') })),
    ]);

    const statuses = results.map((result) => result.status).sort();
    expect(statuses).toEqual([
      WagerTransactionStatus.Processed,
      WagerTransactionStatus.Rejected,
    ]);

    const rejected = results.find(
      (result) => result.status === WagerTransactionStatus.Rejected,
    );
    expect(rejected?.failureCode).toBe(FailureCode.InsufficientFunds);
    expect(await eventTypesFor(rejected?.transactionId ?? '')).toEqual([
      'WagerTransactionRejected',
    ]);
    expect(await countDebits(wallet.id)).toBe(1);

    const { stored, fromLedger } = await balances(wallet.id);
    expect(stored).toBe(2000n);
    expect(fromLedger).toBe(stored);
  });

  it('never loses an update when 20 different bets race on the same wallet', async () => {
    const wallet = await openWallet('100.00');

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        processWager.execute(betCommand(wallet, { money: brl('10.00') })),
      ),
    );

    const processed = results.filter(
      (result) => result.status === WagerTransactionStatus.Processed,
    );
    const rejected = results.filter(
      (result) => result.status === WagerTransactionStatus.Rejected,
    );
    expect(processed).toHaveLength(10);
    expect(rejected).toHaveLength(10);

    const { stored, fromLedger } = await balances(wallet.id);
    expect(stored).toBe(0n);
    expect(fromLedger).toBe(stored);
  });

  it('processes bets on different wallets in parallel', async () => {
    const wallets = await Promise.all(
      Array.from({ length: 10 }, () => openWallet('100.00')),
    );

    const results = await Promise.all(
      wallets.map((wallet) => processWager.execute(betCommand(wallet))),
    );

    expect(
      results.every(
        (result) => result.status === WagerTransactionStatus.Processed,
      ),
    ).toBe(true);

    for (const wallet of wallets) {
      const { stored, fromLedger } = await balances(wallet.id);
      expect(stored).toBe(7500n);
      expect(fromLedger).toBe(stored);
    }
  });
});
