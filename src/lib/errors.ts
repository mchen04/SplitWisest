export class DomainError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function invalidInput(message: string): never {
  throw new DomainError(message, 400);
}
