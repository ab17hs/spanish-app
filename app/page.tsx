import { redirect } from "next/navigation";

// Root URL: always send users to /login. The login page will detect an
// existing session and bounce them to /dashboard if they're already signed in.
// Kept synchronous (no Supabase call here) to avoid any cookie/runtime issues
// on the root route.
export default function Root() {
  redirect("/login");
}
