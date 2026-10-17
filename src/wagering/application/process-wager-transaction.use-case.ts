import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
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
  type WagerTransactionStatus,
} from '../domain/wager-transaction';
import {
  DuplicateTransactionError,
  IdempotencyConflictError,
  UnsupportedTransactionKindError,
  WalletPlayerMismatchError,
} from '../domain/wager.errors';
import { hashWagerPayload } from './payload-hash';
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
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: Money;
  referenceExternalTransactionId: string | undefined;
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
      const existing = await session.findByIdempotencyKey(
        command.idempotencyKey,
      );

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

      await session.save({ transaction, wallet, previousVersion, ledgerEntry });

      return toResult(transaction, wallet.balance, false);
    });
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
