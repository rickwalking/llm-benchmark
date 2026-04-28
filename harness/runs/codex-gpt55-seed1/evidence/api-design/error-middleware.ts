export class DomainError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 409);
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message, 404);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message: string) {
    super(message, 403);
  }
}

export class PaymentRequiredError extends DomainError {
  constructor(message: string) {
    super(message, 402);
  }
}

export class BadRequestError extends DomainError {
  constructor(message: string) {
    super(message, 400);
  }
}
