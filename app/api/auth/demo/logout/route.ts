import { handleLogout } from "@/lib/server/login";

export function POST() {
  return handleLogout("demo");
}
