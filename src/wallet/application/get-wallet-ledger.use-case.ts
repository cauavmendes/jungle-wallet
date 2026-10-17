import { Inject, Injectable } from '@nestjs/common';
import { WalletNotFoundError } from '../domain/wallet.errors';
import {
  type LedgerPage,
  WALLET_LEDGER_READER,
  type WalletLedgerReader,
} from './wallet-ledger.reader';
import { WALLET_REPOSITORY, type WalletRepository } from './wallet.repository';

@Injectable()
export class GetWalletLedgerUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY)
    private readonly wallets: WalletRepository,
    @Inject(WALLET_LEDGER_READER)
    private readonly ledger: WalletLedgerReader,
  ) {}

  async execute(
    walletId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<LedgerPage> {
    const wallet = await this.wallets.findById(walletId);

    if (!wallet) {
      throw new WalletNotFoundError(`Wallet not found: ${walletId}`);
    }

    return this.ledger.findPage(walletId, cursor, limit);
  }
}
