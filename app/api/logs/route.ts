import type { NextRequest } from "next/server";

import { ConfigError } from "@/lib/env";
import { readRequestLogs } from "@/lib/store/logger";
import { getRedis } from "@/lib/store/redis";
import { hasSession, jsonError } from "@/lib/server/session";

export async function GET(request: NextRequest) {
  try {
    if (!hasSession(request, "debug")) return jsonError(401, "UNAUTHORIZED", "Debug login required.");
    const result = await readRequestLogs(getRedis());
    return Response.json({ ...result, available: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ConfigError) return jsonError(503, "CONFIG_ERROR", `Server configuration is incomplete: ${error.problems.join("; ")}`);
    return Response.json({ logs: [], lifetime: {}, available: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
