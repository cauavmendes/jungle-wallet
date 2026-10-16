import { Money } from '../../../shared/domain/money';
import { InvalidRequestError } from '../../../shared/interface/http/invalid-request.error';
import { isRecord, isUuid } from '../../../shared/interface/http/validation';
import type { CreateWalletCommand } from '../../application/create-wallet.use-case';

export function parseCreateWalletRequest(body: unknown): CreateWalletCommand {
  if (!isRecord(body)) {
    throw new InvalidRequestError('Request body must be a JSON object');
  }

  const { playerId, initialBalance } = body;

  if (!isUuid(playerId)) {
    throw new InvalidRequestError('playerId must be a UUID');
  }

  if (
    !isRecord(initialBalance) ||
    typeof initialBalance.amount !== 'string' ||
    typeof initialBalance.currency !== 'string'
  ) {
    throw new InvalidRequestError(
      'initialBalance must be an object with string "amount" and "currency"',
    );
  }

  return {
    playerId,
    initialBalance: Money.from({
      amount: initialBalance.amount,
      currency: initialBalance.currency,
    }),
  };
}
