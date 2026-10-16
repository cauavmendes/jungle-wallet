import { Module } from '@nestjs/common';
import { CreateWalletUseCase } from './application/create-wallet.use-case';
import { WALLET_REPOSITORY } from './application/wallet.repository';
import { SqlWalletRepository } from './infrastructure/sql-wallet.repository';
import { WalletController } from './interface/http/wallet.controller';

@Module({
  controllers: [WalletController],
  providers: [
    CreateWalletUseCase,
    { provide: WALLET_REPOSITORY, useClass: SqlWalletRepository },
  ],
})
export class WalletModule {}
