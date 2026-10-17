import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { InboxMessage } from '../../../inbox/domain/inbox-message';
import {
  DomainError,
  InvalidCurrencyError,
  InvalidMoneyAmountError,
} from '../../../shared/domain/errors';
import { InvalidRequestError } from '../../../shared/interface/http/invalid-request.error';
import {
  isNonEmptyString,
  isRecord,
} from '../../../shared/interface/http/validation';
import { ProcessWagerTransactionUseCase } from '../../application/process-wager-transaction.use-case';
import {
  WAGER_PROCESSING_STORE,
  type WagerProcessingStore,
} from '../../application/wager-processing.store';
import {
  ConcurrentWalletModificationError,
  MissingReferenceError,
  UnsupportedTransactionKindError,
  WalletLockTimeoutError,
} from '../../domain/wager.errors';
import { parseProcessWagerRequest } from '../process-wager.request';

export const WAGER_CONSUMER_NAME = 'wager-transactions';
const MESSAGE_TYPE = 'WagerTransactionRequested';

export enum MessageDisposition {
  Ack = 'ACK',
  Retry = 'RETRY',
  DeadLetter = 'DEAD_LETTER',
}

export interface HandledMessage {
  disposition: MessageDisposition;
  reason?: string;
}

interface WagerMessageEnvelope {
  messageId: string;
  data: Record<string, unknown>;
}

const PERMANENT_ERRORS = [
  InvalidRequestError,
  InvalidMoneyAmountError,
  InvalidCurrencyError,
  MissingReferenceError,
  UnsupportedTransactionKindError,
];

const TRANSIENT_ERRORS = [
  WalletLockTimeoutError,
  ConcurrentWalletModificationError,
];

@Injectable()
export class WagerMessageHandler {
  constructor(
    private readonly processWager: ProcessWagerTransactionUseCase,
    @Inject(WAGER_PROCESSING_STORE)
    private readonly store: WagerProcessingStore,
  ) {}

  async handle(body: string): Promise<HandledMessage> {
    let envelope: WagerMessageEnvelope;

    try {
      envelope = parseEnvelope(body);
    } catch (error) {
      return {
        disposition: MessageDisposition.DeadLetter,
        reason: describe(error),
      };
    }

    const alreadyProcessed = await this.store.isInboxMessageProcessed(
      WAGER_CONSUMER_NAME,
      envelope.messageId,
    );

    if (alreadyProcessed) {
      return {
        disposition: MessageDisposition.Ack,
        reason: 'duplicate message',
      };
    }

    try {
      const command = parseProcessWagerRequest(
        envelope.data.idempotencyKey,
        envelope.data,
      );

      await this.processWager.execute({
        ...command,
        correlationId: envelope.messageId,
        inboxMessage: InboxMessage.receive({
          messageId: envelope.messageId,
          consumerName: WAGER_CONSUMER_NAME,
          payloadHash: createHash('sha256').update(body).digest('hex'),
          receivedAt: new Date(),
        }),
      });

      return { disposition: MessageDisposition.Ack };
    } catch (error) {
      return { disposition: classify(error), reason: describe(error) };
    }
  }
}

function parseEnvelope(body: string): WagerMessageEnvelope {
  let parsed: unknown;

  try {
    parsed = JSON.parse(body);
  } catch {
    throw new InvalidRequestError('Message body is not valid JSON');
  }

  if (!isRecord(parsed) || parsed.type !== MESSAGE_TYPE) {
    throw new InvalidRequestError(`Message type must be ${MESSAGE_TYPE}`);
  }

  if (!isNonEmptyString(parsed.messageId) || !isRecord(parsed.data)) {
    throw new InvalidRequestError(
      'Message must have a messageId and a data object',
    );
  }

  return { messageId: parsed.messageId, data: parsed.data };
}

function classify(error: unknown): MessageDisposition {
  if (TRANSIENT_ERRORS.some((type) => error instanceof type)) {
    return MessageDisposition.Retry;
  }

  if (PERMANENT_ERRORS.some((type) => error instanceof type)) {
    return MessageDisposition.DeadLetter;
  }

  if (error instanceof DomainError) {
    return MessageDisposition.Ack;
  }

  return MessageDisposition.Retry;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
