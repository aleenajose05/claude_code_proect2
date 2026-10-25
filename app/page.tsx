import { Chat } from "@/components/chat/Chat";

export default function Home() {
  // Route protection happens in proxy.ts and again in /api/chat. Same rule as lib/env.ts:
  // the chat is password-protected only when DEMO_PASSWORD is set (and DEMO_MODE isn't "public").
  const passwordProtected = Boolean(process.env.DEMO_PASSWORD) && process.env.DEMO_MODE !== "public";
  return <Chat showLogout={passwordProtected} />;
}
