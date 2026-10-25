import "server-only";
import type { NextRequest } from "next/server";

import { SESSION_COOKIES, verifySessionToken, type AuthScope } from "@/lib/auth";
import { getEnv } from "@/lib/env";

/** Server-side session check used by every protected route handler (not only the proxy). */
export function hasSession(request: NextRequest, scope: AuthScope): boolean {
  const env = getEnv();
  if (scope === "demo" && env.DEMO_MODE === "public") return true;
  return verifySessionToken(env.SESSION_SECRET, scope, request.cookies.get(SESSION_COOKIES[scope])?.value);
}

export function jsonError(status: number, code: string, message: string, headers?: Record<string, string>) {
  return Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}
