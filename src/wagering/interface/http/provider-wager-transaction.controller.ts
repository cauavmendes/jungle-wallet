import { Controller, Get, Param } from '@nestjs/common';
import { GetWagerTransactionUseCase } from '../../application/get-wager-transaction.use-case';
import {
  toWagerTransactionResponse,
  type WagerTransactionResponse,
} from './wager-transaction.response';

@Controller('providers/:providerId/wagering/transactions')
export class ProviderWagerTransactionController {
  constructor(
    private readonly getWagerTransaction: GetWagerTransactionUseCase,
  ) {}

  @Get(':externalTransactionId')
  async findOne(
    @Param('providerId') providerId: string,
    @Param('externalTransactionId') externalTransactionId: string,
  ): Promise<WagerTransactionResponse> {
    return toWagerTransactionResponse(
      await this.getWagerTransaction.byExternalId(
        providerId,
        externalTransactionId,
      ),
    );
  }
}
