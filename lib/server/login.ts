import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { clientId, createSessionToken, passwordMatches, SESSION_COOKIES, sessionCookie, type AuthScope } from "@/lib/auth";
import { ConfigError, getEnv } from "@/lib/env";
import { checkLoginLimit } from "@/lib/ratelimit";
import { getRedis } from "@/lib/store/redis";
import { jsonError } from "./session";

const loginBody = z.object({ password: z.string().min(1).max(200) }).strict();

/** Shared login handler; each scope checks only its own password and sets only its own cookie. */
export async function handleLogin(request: NextRequest, scope: AuthScope): Promise<Response> {
  let env;
  try {
    env = getEnv();
  } catch (error) {
    if (error instanceof ConfigError) return jsonError(503, "CONFIG_ERROR", `Server configuration is incomplete: ${error.problems.join("; ")}`);
    throw error;
  }
  if (scope === "demo" && env.DEMO_MODE === "public") return jsonError(400, "NOT_REQUIRED", "This deployment does not use a demo password.");
  if (scope === "debug" && !env.debugEnabled) return jsonError(404, "DEBUG_DISABLED", "The debug dashboard is disabled because DEBUG_PASSWORD is not set.");
  const secret = env.SESSION_SECRET;
  const expected = scope === "demo" ? env.DEMO_PASSWORD : env.DEBUG_PASSWORD;
  if (!secret || !expected) return jsonError(503, "CONFIG_ERROR", "Login is not configured on this deployment.");

  const limit = await checkLoginLimit(getRedis(), scope, clientId(request.headers, secret));
  if (!limit.ok) return jsonError(429, "RATE_LIMITED", limit.message, { "Retry-After": String(limit.retryAfterSeconds) });

  const parsed = loginBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !passwordMatches(parsed.data.password, expected)) {
    return jsonError(401, "INVALID_PASSWORD", "Incorrect password.");
  }

  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(sessionCookie(scope, createSessionToken(secret, scope), process.env.NODE_ENV === "production"));
  return response;
}

export function handleLogout(scope: AuthScope): Response {
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set({ name: SESSION_COOKIES[scope], value: "", path: "/", maxAge: 0, httpOnly: true });
  return response;
}
