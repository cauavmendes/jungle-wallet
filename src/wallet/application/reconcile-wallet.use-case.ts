import { Inject, Injectable, Logger } from '@nestjs/common';
import { Money } from '../../shared/domain/money';
import { WalletNotFoundError } from '../domain/wallet.errors';
import {
  WALLET_LEDGER_READER,
  type WalletLedgerReader,
} from './wallet-ledger.reader';

export interface ReconciliationResult {
  walletId: string;
  storedBalance: Money;
  calculatedBalance: Money;
  difference: Money;
  consistent: boolean;
  checkedEntries: number;
}

@Injectable()
export class ReconcileWalletUseCase {
  private readonly logger = new Logger(ReconcileWalletUseCase.name);

  constructor(
    @Inject(WALLET_LEDGER_READER)
    private readonly ledger: WalletLedgerReader,
  ) {}

  async execute(walletId: string): Promise<ReconciliationResult> {
    const snapshot = await this.ledger.reconcile(walletId);

    if (!snapshot) {
      throw new WalletNotFoundError(`Wallet not found: ${walletId}`);
    }

    const storedBalance = Money.fromCents(
      snapshot.storedCents,
      snapshot.currency,
    );
    const calculatedBalance = Money.fromCents(
      snapshot.calculatedCents,
      snapshot.currency,
    );
    const difference = storedBalance.subtract(calculatedBalance);
    const consistent = difference.isZero();

    if (!consistent) {
      this.logger.error({
        message: 'Wallet balance diverges from the ledger',
        walletId,
        checkedEntries: snapshot.checkedEntries,
      });
    }

    return {
      walletId,
      storedBalance,
      calculatedBalance,
      difference,
      consistent,
      checkedEntries: snapshot.checkedEntries,
    };
  }
}
