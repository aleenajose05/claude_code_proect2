import { Chat } from "@/components/chat/Chat";

export default function Home() {
  // Route protection happens in proxy.ts and again in /api/chat.
  return <Chat showLogout={process.env.DEMO_MODE !== "public"} />;
}
