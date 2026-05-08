import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings" };

/**
 * /settings — profile preferences page. Daily goal and timezone are the two
 * settings the streak system is sensitive to, so we explain that inline.
 *
 * The current streak/longest are shown as a sanity-check so the user can see
 * what the system thinks before fiddling with knobs.
 */
export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profileResp, streakResp] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, email, timezone, daily_goal, preferred_voice, estimated_level, estimated_level_sub")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("streak_state")
      .select("current_streak, longest_streak, last_completed_date, freezes_used_iso_week")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const profile = profileResp.data ?? {
    display_name: null,
    email: user.email ?? "",
    timezone: "UTC",
    daily_goal: 20,
    preferred_voice: "es-ES",
    estimated_level: null,
    estimated_level_sub: null,
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Personal preferences. Daily goal and timezone control how your streak is calculated.
        </p>
      </div>

      <SettingsForm
        initial={{
          display_name: profile.display_name ?? "",
          email: profile.email ?? user.email ?? "",
          timezone: profile.timezone ?? "UTC",
          daily_goal: profile.daily_goal ?? 20,
          preferred_voice: (profile.preferred_voice as "es-ES" | "es-MX" | "es-AR" | "es-CO" | "es-419") ?? "es-ES",
        }}
        streak={streakResp.data ?? null}
        levelLabel={
          profile.estimated_level
            ? `${profile.estimated_level}${profile.estimated_level_sub != null ? `.${profile.estimated_level_sub}` : ""}`
            : null
        }
      />
    </div>
  );
}
