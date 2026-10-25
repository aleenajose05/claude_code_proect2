import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIES, verifySessionToken } from "@/lib/auth";
import { ConfigError, getEnv } from "@/lib/env";

/**
 * Optimistic route protection (Next.js 16 Proxy). Route handlers and the debug page verify
 * the session again on the server, so this is a first line of defence, not the only one.
 * Demo and debug sessions are checked independently.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let env;
  try {
    env = getEnv();
  } catch (error) {
    if (error instanceof ConfigError) {
      return new NextResponse(`StockLens AI is not configured yet: ${error.problems.join("; ")}`, { status: 503 });
    }
    throw error;
  }

  const isDebugArea = pathname === "/debug" || pathname.startsWith("/api/health") || pathname.startsWith("/api/logs");
  if (isDebugArea) {
    if (verifySessionToken(env.SESSION_SECRET, "debug", request.cookies.get(SESSION_COOKIES.debug)?.value)) return NextResponse.next();
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Debug login required." } }, { status: 401 });
    return NextResponse.redirect(new URL("/debug/login", request.url));
  }

  if (env.DEMO_MODE === "public") return NextResponse.next();
  if (verifySessionToken(env.SESSION_SECRET, "demo", request.cookies.get(SESSION_COOKIES.demo)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Please log in." } }, { status: 401 });
  return NextResponse.redirect(new URL("/demo/login", request.url));
}

export const config = {
  // Everything except static assets, the two login pages and their login/logout endpoints.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|demo/login|debug/login|api/auth/).*)"],
};
