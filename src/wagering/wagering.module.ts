import { Module } from '@nestjs/common';
import { ProcessWagerTransactionUseCase } from './application/process-wager-transaction.use-case';
import { WAGER_PROCESSING_STORE } from './application/wager-processing.store';
import { SqlWagerProcessingStore } from './infrastructure/sql-wager-processing.store';
import { WagerTransactionController } from './interface/http/wager-transaction.controller';
import { WagerMessageHandler } from './interface/sqs/wager-message.handler';
import { WagerTransactionConsumer } from './interface/sqs/wager-transaction.consumer';

@Module({
  controllers: [WagerTransactionController],
  providers: [
    ProcessWagerTransactionUseCase,
    WagerMessageHandler,
    WagerTransactionConsumer,
    { provide: WAGER_PROCESSING_STORE, useClass: SqlWagerProcessingStore },
  ],
})
export class WageringModule {}
