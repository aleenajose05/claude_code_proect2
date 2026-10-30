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

    // Optional backup AI, used only when Gemini fails (https://openrouter.ai/keys)
    OPENROUTER_API_KEY: z.string().trim().min(1).optional(),
    OPENROUTER_MODEL: z.string().trim().min(1).default("openrouter/free"),

    // Market data
    FINNHUB_API_KEY: nonEmpty("FINNHUB_API_KEY"),
    TIINGO_API_KEY: nonEmpty("TIINGO_API_KEY"),
    ALPHA_VANTAGE_API_KEY: z.string().trim().min(1).optional(),

    // Cache, logs and rate limits
    UPSTASH_REDIS_REST_URL: z.url({ protocol: /^https$/, error: "UPSTASH_REDIS_REST_URL must be an https URL" }),
    UPSTASH_REDIS_REST_TOKEN: nonEmpty("UPSTASH_REDIS_REST_TOKEN"),

    // Authentication (all optional). Without DEMO_PASSWORD the chat is public; without
    // DEBUG_PASSWORD the debug dashboard and its APIs are switched off, never left open.
    SESSION_SECRET: z
      .string()
      .min(MIN_SECRET_LENGTH, `SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters`)
      .optional(),
    DEBUG_PASSWORD: z.string().min(12, "DEBUG_PASSWORD must be at least 12 characters").optional(),
    DEMO_MODE: z.enum(["password", "public"]).optional(),
    DEMO_PASSWORD: z.string().min(12, "DEMO_PASSWORD must be at least 12 characters").optional(),

    // Usage limits
    RATE_LIMIT_PER_MINUTE: positiveInt(10),
    RATE_LIMIT_PER_DAY: positiveInt(50),
    GLOBAL_DAILY_CAP: positiveInt(40),
  })
  .superRefine((env, ctx) => {
    const demoMode = env.DEMO_MODE ?? (env.DEMO_PASSWORD ? "password" : "public");
    if (demoMode === "password" && !env.DEMO_PASSWORD) {
      ctx.addIssue({ code: "custom", path: ["DEMO_PASSWORD"], message: "DEMO_PASSWORD is required when DEMO_MODE=password" });
    }
    if ((demoMode === "password" || env.DEBUG_PASSWORD) && !env.SESSION_SECRET) {
      ctx.addIssue({ code: "custom", path: ["SESSION_SECRET"], message: "SESSION_SECRET is required when a demo or debug password is set" });
    }
    if (env.DEMO_PASSWORD && env.DEMO_PASSWORD === env.DEBUG_PASSWORD) {
      ctx.addIssue({ code: "custom", path: ["DEMO_PASSWORD"], message: "DEMO_PASSWORD must be different from DEBUG_PASSWORD" });
    }
  })
  .transform((env) => ({
    ...env,
    DEMO_MODE: env.DEMO_MODE ?? (env.DEMO_PASSWORD ? ("password" as const) : ("public" as const)),
    /** The debug dashboard exists only when it can be protected. */
    debugEnabled: Boolean(env.DEBUG_PASSWORD && env.SESSION_SECRET),
  }));

/** Key for hashing client IPs in rate limiting; a fixed label when no SESSION_SECRET is configured. */
export function clientIdSalt(env: { SESSION_SECRET?: string }): string {
  return env.SESSION_SECRET ?? "stocklens-ai-client-id";
}

export type ServerEnv = z.output<typeof envSchema>;

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

/**
 * Every variable is read by its literal name. Some runtimes (proxy/middleware bundles on
 * hosting platforms) only expose variables that the code references as `process.env.NAME`,
 * so passing `process.env` around as a whole object can make set variables look missing.
 */
function readProcessEnv(): Record<string, string | undefined> {
  return {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    GEMINI_FALLBACK_MODEL: process.env.GEMINI_FALLBACK_MODEL,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    FINNHUB_API_KEY: process.env.FINNHUB_API_KEY,
    TIINGO_API_KEY: process.env.TIINGO_API_KEY,
    ALPHA_VANTAGE_API_KEY: process.env.ALPHA_VANTAGE_API_KEY,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    SESSION_SECRET: process.env.SESSION_SECRET,
    DEBUG_PASSWORD: process.env.DEBUG_PASSWORD,
    DEMO_MODE: process.env.DEMO_MODE,
    DEMO_PASSWORD: process.env.DEMO_PASSWORD,
    RATE_LIMIT_PER_MINUTE: process.env.RATE_LIMIT_PER_MINUTE,
    RATE_LIMIT_PER_DAY: process.env.RATE_LIMIT_PER_DAY,
    GLOBAL_DAILY_CAP: process.env.GLOBAL_DAILY_CAP,
  };
}

let cached: ServerEnv | undefined;

export function getEnv(): ServerEnv {
  cached ??= parseEnv(readProcessEnv());
  return cached;
}
