import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/LoginForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Log in · StockLens AI" };

export default function DemoLoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">StockLens AI</CardTitle>
          <CardDescription>Understand US stocks through simple, data-backed AI analysis.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            This is a private portfolio demo. The free market-data plans it uses are licensed for personal use, so access is password-protected.
          </p>
          <LoginForm scope="demo" redirectTo="/" />
        </CardContent>
      </Card>
      <p className="text-muted-foreground text-center text-xs">
        Not financial advice. Stock market investments involve risk. Market data may be delayed.
      </p>
    </main>
  );
}
