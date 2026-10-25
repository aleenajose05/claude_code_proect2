import "server-only";
import type { z } from "zod";

import { AppError } from "@/lib/errors";

export const DEFAULT_TIMEOUT_MS = 6_000;

export interface FetchJsonOptions<T> {
  provider: string;
  url: URL;
  schema: z.ZodType<T>;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Status codes that should resolve to `null` instead of throwing (e.g. 404 for unknown tickers). */
  nullOnStatus?: number[];
  /** Called before the request; throws PROVIDER_QUOTA when the app's own provider budget is spent. */
  guard?: ProviderGuard;
}

export type ProviderGuard = (provider: string) => Promise<void>;

export interface ClientOptions {
  signal?: AbortSignal;
  guard?: ProviderGuard;
}

/** Host and path only: query strings may carry API keys and are never logged or returned. */
export function describeUrl(url: URL): string {
  return `${url.host}${url.pathname}`;
}

export async function fetchJson<T>(options: FetchJsonOptions<T>): Promise<T | null> {
  const { provider, url, schema } = options;
  await options.guard?.(provider);
  const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json", ...options.headers },
      signal,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new AppError("PROVIDER_TIMEOUT", `${provider} did not respond in time`, { provider });
    }
    throw new AppError("PROVIDER_ERROR", `${provider} could not be reached`, { provider });
  }

  if (options.nullOnStatus?.includes(response.status)) return null;
  if (response.status === 429) {
    throw new AppError("PROVIDER_QUOTA", `${provider} rate limit or quota reached`, { provider, status: 429 });
  }
  if (response.status === 401 || response.status === 403) {
    throw new AppError("PROVIDER_AUTH", `${provider} rejected the request (invalid key or plan does not include this data)`, {
      provider,
      status: response.status,
    });
  }
  if (!response.ok) {
    throw new AppError("PROVIDER_ERROR", `${provider} returned HTTP ${response.status} for ${describeUrl(url)}`, {
      provider,
      status: response.status,
    });
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AppError("INVALID_PROVIDER_RESPONSE", `${provider} returned a non-JSON response`, { provider });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("INVALID_PROVIDER_RESPONSE", `${provider} response did not match the expected format`, {
      provider,
    });
  }
  return parsed.data;
}
