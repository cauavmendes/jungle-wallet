import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Metrics } from '../../../metrics/metrics';
import type { MoneyProps } from '../../../shared/domain/money';
import { InvalidRequestError } from '../../../shared/interface/http/invalid-request.error';
import { isUuid } from '../../../shared/interface/http/validation';
import { CreateWalletUseCase } from '../../application/create-wallet.use-case';
import { GetWalletLedgerUseCase } from '../../application/get-wallet-ledger.use-case';
import { GetWalletUseCase } from '../../application/get-wallet.use-case';
import {
  type ReconciliationResult,
  ReconcileWalletUseCase,
} from '../../application/reconcile-wallet.use-case';
import type { Wallet } from '../../domain/wallet';
import type { WalletLedgerEntry } from '../../domain/wallet-ledger-entry';
import { parseCreateWalletRequest } from './create-wallet.request';

const DEFAULT_LEDGER_LIMIT = 50;
const MAX_LEDGER_LIMIT = 100;

export interface WalletResponse {
  id: string;
  playerId: string;
  balance: MoneyProps;
  version: number;
}

export interface LedgerEntryResponse {
  id: string;
  transactionId: string;
  direction: string;
  money: MoneyProps;
  balanceBefore: MoneyProps;
  balanceAfter: MoneyProps;
  createdAt: string;
}

export interface LedgerPageResponse {
  items: LedgerEntryResponse[];
  nextCursor?: string;
}

export interface ReconciliationResponse {
  walletId: string;
  storedBalance: MoneyProps;
  calculatedBalance: MoneyProps;
  difference: MoneyProps;
  consistent: boolean;
  checkedEntries: number;
}

@Controller('wallets')
export class WalletController {
  constructor(
    private readonly createWallet: CreateWalletUseCase,
    private readonly getWallet: GetWalletUseCase,
    private readonly getWalletLedger: GetWalletLedgerUseCase,
    private readonly reconcileWallet: ReconcileWalletUseCase,
    private readonly metrics: Metrics,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: unknown): Promise<WalletResponse> {
    const command = parseCreateWalletRequest(body);
    const wallet = await this.createWallet.execute(command);

    return toWalletResponse(wallet);
  }

  @Get(':walletId')
  async findOne(@Param('walletId') walletId: string): Promise<WalletResponse> {
    const wallet = await this.getWallet.execute(requireWalletId(walletId));

    return toWalletResponse(wallet);
  }

  @Get(':walletId/ledger')
  async ledger(
    @Param('walletId') walletId: string,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
  ): Promise<LedgerPageResponse> {
    const page = await this.getWalletLedger.execute(
      requireWalletId(walletId),
      cursor,
      parseLimit(limit),
    );

    return {
      items: page.entries.map(toLedgerEntryResponse),
      ...(page.nextCursor && { nextCursor: page.nextCursor }),
    };
  }

  @Post(':walletId/reconciliation')
  @HttpCode(HttpStatus.OK)
  async reconcile(
    @Param('walletId') walletId: string,
  ): Promise<ReconciliationResponse> {
    const result = await this.reconcileWallet.execute(
      requireWalletId(walletId),
    );

    if (!result.consistent) {
      this.metrics.reconciliationDivergencesTotal.inc();
    }

    return toReconciliationResponse(result);
  }
}

function requireWalletId(walletId: string): string {
  if (!isUuid(walletId)) {
    throw new InvalidRequestError('walletId must be a UUID');
  }

  return walletId;
}

function parseLimit(limit: string | undefined): number {
  if (limit === undefined) {
    return DEFAULT_LEDGER_LIMIT;
  }

  const value = Number(limit);

  if (!/^\d+$/.test(limit) || value < 1 || value > MAX_LEDGER_LIMIT) {
    throw new InvalidRequestError(
      `limit must be an integer between 1 and ${MAX_LEDGER_LIMIT}`,
    );
  }

  return value;
}

function toWalletResponse(wallet: Wallet): WalletResponse {
  return {
    id: wallet.id,
    playerId: wallet.playerId,
    balance: wallet.balance.toJSON(),
    version: wallet.version,
  };
}

function toLedgerEntryResponse(entry: WalletLedgerEntry): LedgerEntryResponse {
  return {
    id: entry.id,
    transactionId: entry.transactionId,
    direction: entry.direction,
    money: entry.money.toJSON(),
    balanceBefore: entry.balanceBefore.toJSON(),
    balanceAfter: entry.balanceAfter.toJSON(),
    createdAt: entry.createdAt.toISOString(),
  };
}

function toReconciliationResponse(
  result: ReconciliationResult,
): ReconciliationResponse {
  return {
    walletId: result.walletId,
    storedBalance: result.storedBalance.toJSON(),
    calculatedBalance: result.calculatedBalance.toJSON(),
    difference: result.difference.toJSON(),
    consistent: result.consistent,
    checkedEntries: result.checkedEntries,
  };
}
