export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class ForbiddenError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class PaymentRequiredError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentRequiredError';
  }
}

export class ValidationError extends DomainError {
  details?: unknown;
  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export function statusForError(err: unknown): number {
  if (err instanceof NotFoundError) return 404;
  if (err instanceof ConflictError) return 409;
  if (err instanceof ForbiddenError) return 403;
  if (err instanceof PaymentRequiredError) return 402;
  if (err instanceof ValidationError) return 400;
  return 500;
}
