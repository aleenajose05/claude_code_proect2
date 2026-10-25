import type { NextRequest } from "next/server";

import { handleLogin } from "@/lib/server/login";

export function POST(request: NextRequest) {
  return handleLogin(request, "debug");
}
