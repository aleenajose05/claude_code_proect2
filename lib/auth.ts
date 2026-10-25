import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, HttpOnly session cookies for two independent scopes. Each scope has its own
 * cookie name, its own password and its own HMAC key derived from SESSION_SECRET, so a
 * demo session can never be presented as (or upgraded to) a debug session.
 */

export type AuthScope = "demo" | "debug";

export const SESSION_COOKIES: Record<AuthScope, string> = { demo: "sl_demo", debug: "sl_debug" };
export const SESSION_TTL_SECONDS: Record<AuthScope, number> = { demo: 7 * 24 * 3600, debug: 8 * 3600 };

const b64url = (buf: Buffer) => buf.toString("base64url");

function scopeKey(secret: string, scope: AuthScope): Buffer {
  return createHmac("sha256", secret).update(`stocklens-session:${scope}`).digest();
}

export function createSessionToken(secret: string, scope: AuthScope, now = Date.now()): string {
  const payload = b64url(Buffer.from(JSON.stringify({ s: scope, exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS[scope] })));
  const signature = b64url(createHmac("sha256", scopeKey(secret, scope)).update(payload).digest());
  return `${payload}.${signature}`;
}

export function verifySessionToken(secret: string, scope: AuthScope, token: string | undefined, now = Date.now()): boolean {
  if (!token || token.length > 512) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return false;
  const expected = createHmac("sha256", scopeKey(secret, scope)).update(payload).digest();
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { s?: unknown; exp?: unknown };
    return data.s === scope && typeof data.exp === "number" && data.exp > Math.floor(now / 1000);
  } catch {
    return false;
  }
}

/** Constant-time comparison (hashing first makes the lengths equal). */
export function passwordMatches(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function sessionCookie(scope: AuthScope, token: string, secure: boolean) {
  return {
    name: SESSION_COOKIES[scope],
    value: token,
    httpOnly: true,
    secure,
    sameSite: scope === "debug" ? ("strict" as const) : ("lax" as const),
    path: "/",
    maxAge: SESSION_TTL_SECONDS[scope],
  };
}

/**
 * Client identifier for rate limiting. Vercel documents that it overwrites x-forwarded-for
 * (so clients cannot spoof it) and that the leftmost entry is the real client IP when Vercel
 * is the outermost edge. x-real-ip is only a fallback. The IP is hashed before use as a key.
 */
export function clientId(headers: Headers, secret: string): string {
  const ip =
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "unknown";
  return createHmac("sha256", secret).update(`client:${ip}`).digest("hex").slice(0, 32);
}
