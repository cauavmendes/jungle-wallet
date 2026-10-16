import {
  Body,
  Controller,
  Headers,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { MoneyProps } from '../../../shared/domain/money';
import {
  type ProcessWagerResult,
  ProcessWagerTransactionUseCase,
} from '../../application/process-wager-transaction.use-case';
import { WagerTransactionStatus } from '../../domain/wager-transaction';
import { parseProcessWagerRequest } from './process-wager.request';

export interface ProcessWagerResponse {
  transactionId: string;
  status: string;
  failureCode?: string;
  balance?: MoneyProps;
  idempotentReplay: boolean;
}

@Controller('wagering/transactions')
export class WagerTransactionController {
  constructor(private readonly processWager: ProcessWagerTransactionUseCase) {}

  @Post()
  async process(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ProcessWagerResponse> {
    const command = parseProcessWagerRequest(idempotencyKey, body);
    const result = await this.processWager.execute(command);

    response.status(statusFor(result));

    return toResponse(result);
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
