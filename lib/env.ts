import "server-only";
import { z } from "zod";

/**
 * Server-side environment validation.
 *
 * Variables are read lazily (on first use, not at import time) so that
 * `next build` can run without secrets present. Error messages name the
 * offending variables but never include their values.
 */

const MIN_SECRET_LENGTH = 32;

const nonEmpty = (name: string) =>
  z.string({ error: `${name} is required` }).trim().min(1, `${name} is required`);

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

export const envSchema = z
  .object({
    // AI provider (Google Gemini)
    GEMINI_API_KEY: nonEmpty("GEMINI_API_KEY"),
    GEMINI_MODEL: nonEmpty("GEMINI_MODEL"),
    GEMINI_FALLBACK_MODEL: z.string().trim().min(1).optional(),

    // Market data
    FINNHUB_API_KEY: nonEmpty("FINNHUB_API_KEY"),
    TIINGO_API_KEY: nonEmpty("TIINGO_API_KEY"),
    ALPHA_VANTAGE_API_KEY: z.string().trim().min(1).optional(),

    // Cache, logs and rate limits
    UPSTASH_REDIS_REST_URL: z.url({ protocol: /^https$/, error: "UPSTASH_REDIS_REST_URL must be an https URL" }),
    UPSTASH_REDIS_REST_TOKEN: nonEmpty("UPSTASH_REDIS_REST_TOKEN"),

    // Authentication
    SESSION_SECRET: z
      .string({ error: "SESSION_SECRET is required" })
      .min(MIN_SECRET_LENGTH, `SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters`),
    DEBUG_PASSWORD: z
      .string({ error: "DEBUG_PASSWORD is required" })
      .min(12, "DEBUG_PASSWORD must be at least 12 characters"),
    DEMO_MODE: z.enum(["password", "public"]).default("password"),
    DEMO_PASSWORD: z.string().optional(),

    // Usage limits
    RATE_LIMIT_PER_MINUTE: positiveInt(10),
    RATE_LIMIT_PER_DAY: positiveInt(50),
    GLOBAL_DAILY_CAP: positiveInt(40),
  })
  .superRefine((env, ctx) => {
    if (env.DEMO_MODE !== "password") return;
    if (!env.DEMO_PASSWORD || env.DEMO_PASSWORD.length < 12) {
      ctx.addIssue({
        code: "custom",
        path: ["DEMO_PASSWORD"],
        message: "DEMO_PASSWORD (at least 12 characters) is required when DEMO_MODE=password",
      });
    } else if (env.DEMO_PASSWORD === env.DEBUG_PASSWORD) {
      ctx.addIssue({
        code: "custom",
        path: ["DEMO_PASSWORD"],
        message: "DEMO_PASSWORD must be different from DEBUG_PASSWORD",
      });
    }
  });

export type ServerEnv = z.infer<typeof envSchema>;

export class ConfigError extends Error {
  readonly code = "CONFIG_ERROR";
  constructor(readonly problems: string[]) {
    super(`Server configuration is invalid: ${problems.join("; ")}`);
    this.name = "ConfigError";
  }
}

/** Validates an env-like record. Exported separately so it can be unit-tested. */
export function parseEnv(source: Record<string, string | undefined>): ServerEnv {
  // Treat empty strings as unset, so `FOO=` in .env.local behaves like a missing variable.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value.trim() !== ""),
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const name = issue.path.join(".") || "environment";
      // Zod's default messages never include the received value for these checks.
      return issue.message.includes(name) ? issue.message : `${name}: ${issue.message}`;
    });
    throw new ConfigError(problems);
  }
  return result.data;
}

let cached: ServerEnv | undefined;

export function getEnv(): ServerEnv {
  cached ??= parseEnv(process.env);
  return cached;
}
