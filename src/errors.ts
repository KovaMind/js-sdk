export class KovaMindError extends Error {
  public readonly statusCode: number | undefined;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "KovaMindError";
    this.statusCode = statusCode;
  }
}

export class AuthError extends KovaMindError {
  constructor(message = "Invalid or missing API key") {
    super(message, 401);
    this.name = "AuthError";
  }
}

export class RateLimitError extends KovaMindError {
  public readonly retryAfter: number | undefined;

  constructor(message = "Rate limit exceeded", retryAfter?: number) {
    super(message, 429);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

export class NotFoundError extends KovaMindError {
  constructor(message = "Resource not found") {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

export class ServerError extends KovaMindError {
  constructor(message = "Internal server error", statusCode = 500) {
    super(message, statusCode);
    this.name = "ServerError";
  }
}
