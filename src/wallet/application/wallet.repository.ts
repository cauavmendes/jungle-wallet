import { OpenedWallet, Wallet } from '../domain/wallet';

export const WALLET_REPOSITORY = Symbol('WALLET_REPOSITORY');

export interface WalletRepository {
  saveOpened(opened: OpenedWallet): Promise<void>;
  findById(id: string): Promise<Wallet | null>;
}
