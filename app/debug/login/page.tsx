import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/LoginForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Debug login · StockLens AI", robots: { index: false } };

export default function DebugLoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Debug dashboard</CardTitle>
          <CardDescription>Uses the separate debug password. A demo login does not grant access here.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm scope="debug" redirectTo="/debug" />
        </CardContent>
      </Card>
    </main>
  );
}
