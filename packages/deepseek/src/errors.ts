/**
 * Typed errors for `@lemonwoo/deepseek`.
 *
 * All thrown errors are subclasses of `DeepSeekError`, so callers can either
 * branch by `instanceof` or by `name`. Every message is redacted before being
 * stored on the error so secrets never leak via `.message` or `.toString()`.
 */

export class DeepSeekError extends Error {
  override name = "DeepSeekError";
  // ES2022 Error already supports { cause } on the base constructor.
}

export class DeepSeekAuthError extends DeepSeekError {
  override name = "DeepSeekAuthError";
}

export class DeepSeekRateLimitError extends DeepSeekError {
  override name = "DeepSeekRateLimitError";
  readonly retryAfterMs: number | undefined;
  constructor(
    message: string,
    options: { cause?: unknown; retryAfterMs?: number } = {}
  ) {
    super(message, { cause: options.cause });
    this.retryAfterMs = options.retryAfterMs;
  }
}

export class DeepSeekServerError extends DeepSeekError {
  override name = "DeepSeekServerError";
  readonly status: number;
  constructor(
    message: string,
    options: { cause?: unknown; status: number }
  ) {
    super(message, { cause: options.cause });
    this.status = options.status;
  }
}

export class DeepSeekTimeoutError extends DeepSeekError {
  override name = "DeepSeekTimeoutError";
}

export class DeepSeekAbortError extends DeepSeekError {
  override name = "DeepSeekAbortError";
}

export class DeepSeekNetworkError extends DeepSeekError {
  override name = "DeepSeekNetworkError";
}

export class DeepSeekModelsUnavailableError extends DeepSeekError {
  override name = "DeepSeekModelsUnavailableError";
  readonly available: readonly string[];
  constructor(
    message: string,
    options: { cause?: unknown; available: readonly string[] }
  ) {
    super(message, { cause: options.cause });
    this.available = options.available;
  }
}
