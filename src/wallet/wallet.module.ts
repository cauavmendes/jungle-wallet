import { Module } from '@nestjs/common';
import { CreateWalletUseCase } from './application/create-wallet.use-case';
import { GetWalletLedgerUseCase } from './application/get-wallet-ledger.use-case';
import { GetWalletUseCase } from './application/get-wallet.use-case';
import { ReconcileWalletUseCase } from './application/reconcile-wallet.use-case';
import { WALLET_LEDGER_READER } from './application/wallet-ledger.reader';
import { WALLET_REPOSITORY } from './application/wallet.repository';
import { SqlWalletLedgerReader } from './infrastructure/sql-wallet-ledger.reader';
import { SqlWalletRepository } from './infrastructure/sql-wallet.repository';
import { WalletController } from './interface/http/wallet.controller';

@Module({
  controllers: [WalletController],
  providers: [
    CreateWalletUseCase,
    GetWalletUseCase,
    GetWalletLedgerUseCase,
    ReconcileWalletUseCase,
    { provide: WALLET_REPOSITORY, useClass: SqlWalletRepository },
    { provide: WALLET_LEDGER_READER, useClass: SqlWalletLedgerReader },
  ],
})
export class WalletModule {}
