import { Module } from '@nestjs/common';
import { GetWagerTransactionUseCase } from './application/get-wager-transaction.use-case';
import { ProcessWagerTransactionUseCase } from './application/process-wager-transaction.use-case';
import { WAGER_PROCESSING_STORE } from './application/wager-processing.store';
import { WAGER_TRANSACTION_READER } from './application/wager-transaction.reader';
import { SqlWagerProcessingStore } from './infrastructure/sql-wager-processing.store';
import { SqlWagerTransactionReader } from './infrastructure/sql-wager-transaction.reader';
import { ProviderWagerTransactionController } from './interface/http/provider-wager-transaction.controller';
import { WagerTransactionController } from './interface/http/wager-transaction.controller';
import { WagerMessageHandler } from './interface/sqs/wager-message.handler';
import { WagerTransactionConsumer } from './interface/sqs/wager-transaction.consumer';

@Module({
  controllers: [WagerTransactionController, ProviderWagerTransactionController],
  providers: [
    ProcessWagerTransactionUseCase,
    GetWagerTransactionUseCase,
    WagerMessageHandler,
    WagerTransactionConsumer,
    { provide: WAGER_PROCESSING_STORE, useClass: SqlWagerProcessingStore },
    { provide: WAGER_TRANSACTION_READER, useClass: SqlWagerTransactionReader },
  ],
})
export class WageringModule {}
