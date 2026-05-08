import { Flame, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";

export async function TopBar() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email, estimated_level, estimated_level_sub")
    .eq("id", user.id)
    .single();

  const { data: streak } = await supabase
    .from("streak_state")
    .select("current_streak")
    .eq("user_id", user.id)
    .single();

  const flameColor =
    (streak?.current_streak ?? 0) >= 30
      ? "text-orange-500"
      : (streak?.current_streak ?? 0) >= 7
        ? "text-orange-400"
        : "text-cyan-500";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-background/80 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-2 md:hidden">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
        <span className="font-semibold tracking-tight">Spanish</span>
      </div>
      <div className="hidden md:flex md:flex-1" />
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-sm font-medium shadow-sm">
          <Flame className={cn("h-4 w-4 animate-flame-flicker", flameColor)} />
          <span className="tabular-nums">{streak?.current_streak ?? 0}</span>
        </div>
        {profile?.estimated_level && (
          <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-level px-3 py-1.5 text-sm font-semibold text-white shadow-sm">
            {profile.estimated_level}
            {profile.estimated_level_sub != null && (
              <span className="opacity-80">.{profile.estimated_level_sub.toString().split(".")[1] ?? "0"}</span>
            )}
          </div>
        )}
        <ThemeToggle />
        <UserMenu email={profile?.email ?? user.email ?? ""} />
      </div>
    </header>
  );
}
