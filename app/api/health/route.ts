import type { NextRequest } from "next/server";

import { ConfigError } from "@/lib/env";
import { runHealthChecks } from "@/lib/health";
import { getRedis } from "@/lib/store/redis";
import { hasSession, jsonError } from "@/lib/server/session";

export async function GET(request: NextRequest) {
  try {
    if (!hasSession(request, "debug")) return jsonError(401, "UNAUTHORIZED", "Debug login required.");
    const force = request.nextUrl.searchParams.get("refresh") === "1";
    const result = await runHealthChecks(getRedis(), { force });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ConfigError) return jsonError(503, "CONFIG_ERROR", `Server configuration is incomplete: ${error.problems.join("; ")}`);
    return jsonError(500, "HEALTH_FAILED", "Health checks could not be run.");
  }
}
