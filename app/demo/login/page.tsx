import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/LoginForm";
import { BrandMark } from "@/components/chat/BrandMark";

export const metadata: Metadata = { title: "Log in · StockLens AI" };

export default function DemoLoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-4 py-12">
      <div className="space-y-3 text-center">
        <BrandMark className="mx-auto size-10 rounded-xl [&_svg]:size-5" />
        <h1 className="font-serif text-3xl tracking-tight">Welcome to StockLens</h1>
        <p className="text-muted-foreground text-sm">
          Understand US stocks through simple, data-backed AI analysis. This private demo is password-protected.
        </p>
      </div>
      <div className="bg-card rounded-2xl border p-6 shadow-[0_10px_30px_-14px_rgba(30,25,15,0.18)]">
        <LoginForm scope="demo" redirectTo="/" />
      </div>
      <p className="text-muted-foreground text-center text-xs">Not financial advice. Market data may be delayed.</p>
    </main>
  );
}
