import { Inject, Injectable } from '@nestjs/common';
import { Wallet } from '../domain/wallet';
import { WalletNotFoundError } from '../domain/wallet.errors';
import { WALLET_REPOSITORY, type WalletRepository } from './wallet.repository';

@Injectable()
export class GetWalletUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY)
    private readonly wallets: WalletRepository,
  ) {}

  async execute(walletId: string): Promise<Wallet> {
    const wallet = await this.wallets.findById(walletId);

    if (!wallet) {
      throw new WalletNotFoundError(`Wallet not found: ${walletId}`);
    }

    return wallet;
  }
}
