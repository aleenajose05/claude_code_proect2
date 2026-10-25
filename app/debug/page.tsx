import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { SESSION_COOKIES, verifySessionToken } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { DebugDashboard } from "@/components/debug/DebugDashboard";

export const metadata: Metadata = { title: "Debug · StockLens AI", robots: { index: false } };

/** Verifies the debug session on the server (the proxy check alone is not relied on). */
async function AuthorizedDashboard() {
  const token = (await cookies()).get(SESSION_COOKIES.debug)?.value;
  // Session expiry depends on the current time, so this must never be prerendered.
  await connection();
  const env = getEnv();
  if (!env.debugEnabled || !env.SESSION_SECRET) notFound();
  if (!verifySessionToken(env.SESSION_SECRET, "debug", token)) redirect("/debug/login");
  return <DebugDashboard />;
}

export default function DebugPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm">Checking access…</p>}>
      <AuthorizedDashboard />
    </Suspense>
  );
}
