import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Response } from 'express';
import { Metrics } from '../../../metrics/metrics';
import { DomainError } from '../../domain/errors';

const STATUS_BY_CODE: Record<string, number> = {
  INVALID_REQUEST: HttpStatus.BAD_REQUEST,
  INVALID_MONEY_AMOUNT: HttpStatus.BAD_REQUEST,
  INVALID_CURRENCY: HttpStatus.BAD_REQUEST,
  MISSING_REFERENCE: HttpStatus.BAD_REQUEST,
  UNSUPPORTED_TRANSACTION_KIND: HttpStatus.BAD_REQUEST,
  WALLET_NOT_FOUND: HttpStatus.NOT_FOUND,
  WALLET_ALREADY_EXISTS: HttpStatus.CONFLICT,
  IDEMPOTENCY_CONFLICT: HttpStatus.CONFLICT,
  DUPLICATE_TRANSACTION: HttpStatus.CONFLICT,
  CONCURRENT_WALLET_MODIFICATION: HttpStatus.SERVICE_UNAVAILABLE,
  WALLET_LOCK_TIMEOUT: HttpStatus.SERVICE_UNAVAILABLE,
};

const LOCK_CONFLICT_REASONS: Record<string, string> = {
  WALLET_LOCK_TIMEOUT: 'lock_timeout',
  CONCURRENT_WALLET_MODIFICATION: 'version_mismatch',
};

@Injectable()
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  constructor(private readonly metrics: Metrics) {}

  catch(error: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      STATUS_BY_CODE[error.code] ?? HttpStatus.UNPROCESSABLE_ENTITY;
    const lockConflictReason = LOCK_CONFLICT_REASONS[error.code];

    if (lockConflictReason) {
      this.metrics.lockConflictsTotal.inc({ reason: lockConflictReason });
    }

    response.status(status).json({
      error: { code: error.code, message: error.message },
    });
  }
}
