import { Money } from '../../../shared/domain/money';
import { InvalidRequestError } from '../../../shared/interface/http/invalid-request.error';
import type { CreateWalletCommand } from '../../application/create-wallet.use-case';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseCreateWalletRequest(body: unknown): CreateWalletCommand {
  if (!isRecord(body)) {
    throw new InvalidRequestError('Request body must be a JSON object');
  }

  const { playerId, initialBalance } = body;

  if (typeof playerId !== 'string' || !UUID_PATTERN.test(playerId)) {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
