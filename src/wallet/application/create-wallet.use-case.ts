import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Money } from '../../shared/domain/money';
import { Wallet } from '../domain/wallet';
import { WALLET_REPOSITORY, type WalletRepository } from './wallet.repository';

export interface CreateWalletCommand {
  playerId: string;
  initialBalance: Money;
}

@Injectable()
export class CreateWalletUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY)
    private readonly wallets: WalletRepository,
  ) {}

  async execute(command: CreateWalletCommand): Promise<Wallet> {
    const opened = Wallet.open({
      id: randomUUID(),
      playerId: command.playerId,
      initialBalance: command.initialBalance,
      openingTransactionId: randomUUID(),
      at: new Date(),
    });

    await this.wallets.saveOpened(opened);

    return opened.wallet;
  }
}
