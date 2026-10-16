import { CurrencyMismatchError } from '../../shared/domain/errors';
import { Money } from '../../shared/domain/money';
import { LedgerDirection, WalletLedgerEntry } from './wallet-ledger-entry';
import { InsufficientFundsError } from './wallet.errors';

export interface WalletState {
  id: string;
  playerId: string;
  currency: string;
  balance: Money;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OpenWalletProps {
  id: string;
  playerId: string;
  initialBalance: Money;
  openingTransactionId: string;
  at: Date;
}

export interface OpenedWallet {
  wallet: Wallet;
  openingEntry?: WalletLedgerEntry;
}

export class Wallet {
  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly currency: string,
    private _balance: Money,
    private _version: number,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static open(props: OpenWalletProps): OpenedWallet {
    const { id, playerId, initialBalance, openingTransactionId, at } = props;
    const wallet = new Wallet(
      id,
      playerId,
      initialBalance.currency,
      initialBalance,
      1,
      at,
      at,
    );

    if (initialBalance.isZero()) {
      return { wallet };
    }

    const openingEntry = WalletLedgerEntry.create({
      walletId: id,
      transactionId: openingTransactionId,
      direction: LedgerDirection.Credit,
      money: initialBalance,
      balanceBefore: Money.zero(initialBalance.currency),
      balanceAfter: initialBalance,
      createdAt: at,
    });

    return { wallet, openingEntry };
  }

  static rehydrate(state: WalletState): Wallet {
    return new Wallet(
      state.id,
      state.playerId,
      state.currency,
      state.balance,
      state.version,
      state.createdAt,
      state.updatedAt,
    );
  }

  get balance(): Money {
    return this._balance;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  debit(money: Money, transactionId: string, at: Date): WalletLedgerEntry {
    this.assertSameCurrency(money);

    if (this._balance.isLessThan(money)) {
      throw new InsufficientFundsError(
        `Insufficient funds: balance ${this._balance.toString()}, debit ${money.toString()}`,
      );
    }

    return this.apply(
      LedgerDirection.Debit,
      money,
      this._balance.subtract(money),
      transactionId,
      at,
    );
  }

  credit(money: Money, transactionId: string, at: Date): WalletLedgerEntry {
    this.assertSameCurrency(money);

    return this.apply(
      LedgerDirection.Credit,
      money,
      this._balance.add(money),
      transactionId,
      at,
    );
  }

  private apply(
    direction: LedgerDirection,
    money: Money,
    newBalance: Money,
    transactionId: string,
    at: Date,
  ): WalletLedgerEntry {
    const entry = WalletLedgerEntry.create({
      walletId: this.id,
      transactionId,
      direction,
      money,
      balanceBefore: this._balance,
      balanceAfter: newBalance,
      createdAt: at,
    });

    this._balance = newBalance;
    this._version += 1;
    this._updatedAt = at;

    return entry;
  }

  private assertSameCurrency(money: Money): void {
    if (money.currency !== this.currency) {
      throw new CurrencyMismatchError(
        `Currency mismatch: wallet ${this.currency}, operation ${money.currency}`,
      );
    }
  }
}
