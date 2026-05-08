import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Server-side root redirect. Replaces the previous middleware-based redirect.
export default async function Root() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  redirect(user ? "/dashboard" : "/login");
}
