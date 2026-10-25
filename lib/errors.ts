/**
 * Typed application errors. `message` is always safe to show to users and to log:
 * it must never contain credentials, credential-bearing URLs or raw provider bodies.
 */
export type AppErrorCode =
  | "CONFIG_ERROR"
  | "TICKER_NOT_FOUND"
  | "TICKER_AMBIGUOUS"
  | "UNSUPPORTED_INSTRUMENT"
  | "NOT_LISTED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_QUOTA"
  | "PROVIDER_AUTH"
  | "PROVIDER_ERROR"
  | "INVALID_PROVIDER_RESPONSE"
  | "DATA_UNAVAILABLE";

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly details: { provider?: string; status?: number } = {},
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** Errors worth retrying with a fallback provider (the provider failed, not the request). */
export function isProviderFailure(error: unknown): boolean {
  return (
    error instanceof AppError &&
    ["PROVIDER_TIMEOUT", "PROVIDER_QUOTA", "PROVIDER_AUTH", "PROVIDER_ERROR", "INVALID_PROVIDER_RESPONSE"].includes(
      error.code,
    )
  );
}
