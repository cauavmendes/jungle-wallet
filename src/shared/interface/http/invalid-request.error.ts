import { DomainError } from '../../domain/errors';

export class InvalidRequestError extends DomainError {
  readonly code = 'INVALID_REQUEST';
}
