import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { MoneyProps } from '../../../shared/domain/money';
import { CreateWalletUseCase } from '../../application/create-wallet.use-case';
import type { Wallet } from '../../domain/wallet';
import { parseCreateWalletRequest } from './create-wallet.request';

export interface WalletResponse {
  id: string;
  playerId: string;
  balance: MoneyProps;
  version: number;
}

@Controller('wallets')
export class WalletController {
  constructor(private readonly createWallet: CreateWalletUseCase) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: unknown): Promise<WalletResponse> {
    const command = parseCreateWalletRequest(body);
    const wallet = await this.createWallet.execute(command);

    return toWalletResponse(wallet);
  }
}

function toWalletResponse(wallet: Wallet): WalletResponse {
  return {
    id: wallet.id,
    playerId: wallet.playerId,
    balance: wallet.balance.toJSON(),
    version: wallet.version,
  };
}
