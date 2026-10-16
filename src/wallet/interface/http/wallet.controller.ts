import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import type { MoneyProps } from '../../../shared/domain/money';
import { InvalidRequestError } from '../../../shared/interface/http/invalid-request.error';
import { isUuid } from '../../../shared/interface/http/validation';
import { CreateWalletUseCase } from '../../application/create-wallet.use-case';
import { GetWalletUseCase } from '../../application/get-wallet.use-case';
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
  constructor(
    private readonly createWallet: CreateWalletUseCase,
    private readonly getWallet: GetWalletUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: unknown): Promise<WalletResponse> {
    const command = parseCreateWalletRequest(body);
    const wallet = await this.createWallet.execute(command);

    return toWalletResponse(wallet);
  }

  @Get(':walletId')
  async findOne(@Param('walletId') walletId: string): Promise<WalletResponse> {
    if (!isUuid(walletId)) {
      throw new InvalidRequestError('walletId must be a UUID');
    }

    const wallet = await this.getWallet.execute(walletId);

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
