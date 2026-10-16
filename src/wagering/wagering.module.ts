import { Module } from '@nestjs/common';
import { ProcessWagerTransactionUseCase } from './application/process-wager-transaction.use-case';
import { WAGER_PROCESSING_STORE } from './application/wager-processing.store';
import { SqlWagerProcessingStore } from './infrastructure/sql-wager-processing.store';
import { WagerTransactionController } from './interface/http/wager-transaction.controller';

@Module({
  controllers: [WagerTransactionController],
  providers: [
    ProcessWagerTransactionUseCase,
    { provide: WAGER_PROCESSING_STORE, useClass: SqlWagerProcessingStore },
  ],
})
export class WageringModule {}
