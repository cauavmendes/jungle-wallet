import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Metrics } from '../../../metrics/metrics';
import type { MoneyProps } from '../../../shared/domain/money';
import { InvalidRequestError } from '../../../shared/interface/http/invalid-request.error';
import {
  isNonEmptyString,
  isUuid,
} from '../../../shared/interface/http/validation';
import { GetWagerTransactionUseCase } from '../../application/get-wager-transaction.use-case';
import {
  type ProcessWagerResult,
  ProcessWagerTransactionUseCase,
} from '../../application/process-wager-transaction.use-case';
import { WagerTransactionStatus } from '../../domain/wager-transaction';
import { parseProcessWagerRequest } from '../process-wager.request';
import {
  toWagerTransactionResponse,
  type WagerTransactionResponse,
} from './wager-transaction.response';

export interface ProcessWagerResponse {
  transactionId: string;
  status: string;
  failureCode?: string;
  balance?: MoneyProps;
  idempotentReplay: boolean;
}

@Controller('wagering/transactions')
export class WagerTransactionController {
  constructor(
    private readonly processWager: ProcessWagerTransactionUseCase,
    private readonly getWagerTransaction: GetWagerTransactionUseCase,
    private readonly metrics: Metrics,
  ) {}

  @Post()
  async process(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ProcessWagerResponse> {
    const command = parseProcessWagerRequest(idempotencyKey, body);
    const stopTimer = this.metrics.processingDuration.startTimer({
      source: 'http',
    });

    let result: ProcessWagerResult;

    try {
      result = await this.processWager.execute({
        ...command,
        correlationId: isNonEmptyString(correlationId)
          ? correlationId
          : randomUUID(),
      });
    } finally {
      stopTimer();
    }

    this.metrics.transactionsTotal.inc({
      status: result.status,
      source: 'http',
    });

    if (result.idempotentReplay) {
      this.metrics.duplicatesTotal.inc({ source: 'http' });
    }

    response.status(statusFor(result));

    return toResponse(result);
  }

  @Get(':transactionId')
  async findOne(
    @Param('transactionId') transactionId: string,
  ): Promise<WagerTransactionResponse> {
    if (!isUuid(transactionId)) {
      throw new InvalidRequestError('transactionId must be a UUID');
    }

    return toWagerTransactionResponse(
      await this.getWagerTransaction.byId(transactionId),
    );
  }
}

function statusFor(result: ProcessWagerResult): number {
  if (result.status === WagerTransactionStatus.Rejected) {
    return HttpStatus.UNPROCESSABLE_ENTITY;
  }

  return result.idempotentReplay ? HttpStatus.OK : HttpStatus.CREATED;
}

function toResponse(result: ProcessWagerResult): ProcessWagerResponse {
  return {
    transactionId: result.transactionId,
    status: result.status,
    ...(result.failureCode && { failureCode: result.failureCode }),
    ...(result.balance && { balance: result.balance.toJSON() }),
    idempotentReplay: result.idempotentReplay,
  };
}
