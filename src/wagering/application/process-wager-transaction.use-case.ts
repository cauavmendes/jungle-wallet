import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { InboxMessage } from '../../inbox/domain/inbox-message';
import type {
  IntegrationEvent,
  IntegrationEventContext,
} from '../../shared/application/integration-event';
import { CurrencyMismatchError } from '../../shared/domain/errors';
import type { Money } from '../../shared/domain/money';
import type { Wallet } from '../../wallet/domain/wallet';
import type { WalletLedgerEntry } from '../../wallet/domain/wallet-ledger-entry';
import {
  InsufficientFundsError,
  WalletNotFoundError,
} from '../../wallet/domain/wallet.errors';
import {
  FailureCode,
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../domain/wager-transaction';
import {
  DuplicateTransactionError,
  IdempotencyConflictError,
  UnsupportedTransactionKindError,
  WalletPlayerMismatchError,
} from '../domain/wager.errors';
import { hashWagerPayload } from './payload-hash';
import {
  WagerTransactionProcessed,
  WagerTransactionRejected,
  WalletBalanceChanged,
} from './wager-events';
import {
  type StoredWagerTransaction,
  WAGER_PROCESSING_STORE,
  type WagerProcessingStore,
  type WalletSession,
} from './wager-processing.store';

const SUPPORTED_KINDS = new Set([
  WagerTransactionKind.Bet,
  WagerTransactionKind.Win,
  WagerTransactionKind.Loss,
]);

export interface ProcessWagerCommand {
  idempotencyKey: string;
  correlationId: string;
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: Money;
  referenceExternalTransactionId: string | undefined;
  inboxMessage?: InboxMessage;
}

export interface ProcessWagerResult {
  transactionId: string;
  status: WagerTransactionStatus;
  failureCode: FailureCode | undefined;
  balance: Money | undefined;
  idempotentReplay: boolean;
}

@Injectable()
export class ProcessWagerTransactionUseCase {
  private readonly logger = new Logger(ProcessWagerTransactionUseCase.name);

  constructor(
    @Inject(WAGER_PROCESSING_STORE)
    private readonly store: WagerProcessingStore,
  ) {}

  async execute(command: ProcessWagerCommand): Promise<ProcessWagerResult> {
    if (!SUPPORTED_KINDS.has(command.kind)) {
      throw new UnsupportedTransactionKindError(
        `${command.kind} is not supported`,
      );
    }

    const payloadHash = hashWagerPayload({
      providerId: command.providerId,
      externalTransactionId: command.externalTransactionId,
      playerId: command.playerId,
      walletId: command.walletId,
      roundId: command.roundId,
      gameId: command.gameId,
      kind: command.kind,
      money: command.money.toJSON(),
      referenceExternalTransactionId:
        command.referenceExternalTransactionId ?? null,
    });

    try {
      return await this.process(command, payloadHash);
    } catch (error) {
      if (error instanceof DuplicateTransactionError) {
        return this.process(command, payloadHash);
      }

      throw error;
    }
  }

  private process(
    command: ProcessWagerCommand,
    payloadHash: string,
  ): Promise<ProcessWagerResult> {
    return this.store.withLockedWallet(command.walletId, async (session) => {
      const result = await this.decide(session, command, payloadHash);

      if (command.inboxMessage) {
        command.inboxMessage.markProcessed(new Date());
        await session.recordInboxMessage(command.inboxMessage);
      }

      this.logger.log({
        message: 'Wager transaction handled',
        correlationId: command.correlationId,
        messageId: command.inboxMessage?.messageId,
        transactionId: result.transactionId,
        walletId: command.walletId,
        providerId: command.providerId,
        status: result.status,
        failureCode: result.failureCode,
        idempotentReplay: result.idempotentReplay,
      });

      return result;
    });
  }

  private async decide(
    session: WalletSession,
    command: ProcessWagerCommand,
    payloadHash: string,
  ): Promise<ProcessWagerResult> {
    const existing = await session.findByIdempotencyKey(command.idempotencyKey);

    if (existing) {
      return replay(existing, payloadHash);
    }

    const wallet = requireWalletFor(session, command);
    const now = new Date();
    const transaction = WagerTransaction.create({
      id: randomUUID(),
      providerId: command.providerId,
      externalTransactionId: command.externalTransactionId,
      idempotencyKey: command.idempotencyKey,
      payloadHash,
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: command.roundId,
      gameId: command.gameId,
      kind: command.kind,
      money: command.money,
      referenceExternalTransactionId: command.referenceExternalTransactionId,
      createdAt: now,
    });
    const previousVersion = wallet.version;
    const ledgerEntry = applyToWallet(transaction, wallet, now);
    const events = buildEvents(transaction, wallet, ledgerEntry, {
      correlationId: command.correlationId,
      causationId: command.idempotencyKey,
    });

    await session.save({
      transaction,
      wallet,
      previousVersion,
      ledgerEntry,
      events,
    });

    return toResult(transaction, wallet.balance, false);
  }
}

function requireWalletFor(
  session: WalletSession,
  command: ProcessWagerCommand,
): Wallet {
  const { wallet } = session;

  if (!wallet) {
    throw new WalletNotFoundError(`Wallet not found: ${command.walletId}`);
  }

  if (wallet.playerId !== command.playerId) {
    throw new WalletPlayerMismatchError(
      `Wallet ${wallet.id} does not belong to player ${command.playerId}`,
    );
  }

  if (wallet.currency !== command.money.currency) {
    throw new CurrencyMismatchError(
      `Currency mismatch: wallet ${wallet.currency}, transaction ${command.money.currency}`,
    );
  }

  return wallet;
}

function applyToWallet(
  transaction: WagerTransaction,
  wallet: Wallet,
  at: Date,
): WalletLedgerEntry | undefined {
  switch (transaction.kind) {
    case WagerTransactionKind.Bet:
      return applyBet(transaction, wallet, at);
    case WagerTransactionKind.Win: {
      const entry = wallet.credit(transaction.money, transaction.id, at);
      transaction.markProcessed(undefined, at);
      return entry;
    }
    case WagerTransactionKind.Loss:
      transaction.markProcessed(undefined, at);
      return undefined;
    default:
      throw new UnsupportedTransactionKindError(
        `${transaction.kind} is not supported`,
      );
  }
}

function applyBet(
  transaction: WagerTransaction,
  wallet: Wallet,
  at: Date,
): WalletLedgerEntry | undefined {
  try {
    const entry = wallet.debit(transaction.money, transaction.id, at);
    transaction.markProcessed(undefined, at);
    return entry;
  } catch (error) {
    if (error instanceof InsufficientFundsError) {
      transaction.reject(FailureCode.InsufficientFunds, at);
      return undefined;
    }

    throw error;
  }
}

function buildEvents(
  transaction: WagerTransaction,
  wallet: Wallet,
  ledgerEntry: WalletLedgerEntry | undefined,
  context: IntegrationEventContext,
): IntegrationEvent<unknown>[] {
  if (transaction.status === WagerTransactionStatus.Rejected) {
    return [
      WagerTransactionRejected.from(transaction, wallet.balance, context),
    ];
  }

  const events: IntegrationEvent<unknown>[] = [
    WagerTransactionProcessed.from(transaction, wallet.balance, context),
  ];

  if (ledgerEntry) {
    events.push(WalletBalanceChanged.from(wallet, ledgerEntry, context));
  }

  return events;
}

function replay(
  existing: StoredWagerTransaction,
  payloadHash: string,
): ProcessWagerResult {
  if (!existing.transaction.matchesPayload(payloadHash)) {
    throw new IdempotencyConflictError(
      `Idempotency key ${existing.transaction.idempotencyKey} was already used with a different payload`,
    );
  }

  return toResult(existing.transaction, existing.balanceAfter, true);
}

function toResult(
  transaction: WagerTransaction,
  balance: Money | undefined,
  idempotentReplay: boolean,
): ProcessWagerResult {
  return {
    transactionId: transaction.id,
    status: transaction.status,
    failureCode: transaction.failureCode,
    balance,
    idempotentReplay,
  };
}
