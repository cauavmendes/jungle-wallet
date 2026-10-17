import { Money } from '../../shared/domain/money';
import { Wallet } from '../domain/wallet';

export interface WalletRow {
  id: string;
  player_id: string;
  currency: string;
  balance_cents: string;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
}

export const WALLET_COLUMNS =
  'id, player_id, currency, balance_cents, version, created_at, updated_at';

export function toWallet(row: WalletRow): Wallet {
  return Wallet.rehydrate({
    id: row.id,
    playerId: row.player_id,
    currency: row.currency,
    balance: Money.fromCents(BigInt(row.balance_cents), row.currency),
    version: row.version,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });
}
