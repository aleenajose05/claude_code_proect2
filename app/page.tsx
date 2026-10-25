import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Placeholder until the chat interface is built in Phase 6. It deliberately has no
// controls, so nothing on the page pretends to work before it does.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">StockLens AI</CardTitle>
          <CardDescription>
            Understand US stocks through simple, data-backed AI analysis.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Project setup is complete. The stock analysis chat is not built yet.
        </CardContent>
      </Card>
    </main>
  );
}
