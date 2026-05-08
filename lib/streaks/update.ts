/**
 * Streak + daily goal logic.
 *
 * Rules:
 *   - "Goal met today" = today's session_event count (in user's local TZ)
 *     >= profile.daily_goal.
 *   - On the first day the goal is met, current_streak becomes 1.
 *   - On subsequent calendar days where the goal is met:
 *       - If last_completed_date is yesterday → streak += 1.
 *       - If last_completed_date is older than yesterday → streak resets to 1
 *         UNLESS the user has a freeze available this ISO week, in which
 *         case the gap is patched and the streak continues.
 *   - Each ISO week the user gets exactly 1 freeze (freezes_used_iso_week).
 *   - longest_streak tracks the high-water mark.
 *
 * Timezone handling: dates are stored as plain `date` in the user's TZ,
 * derived via Intl.DateTimeFormat. UTC mid-day boundaries are explicitly
 * not used — a 23:55 review in Tokyo should count as "today" for that user.
 *
 * This module is server-only (uses the SSR Supabase client). It's safe to
 * call after every session end; the work is a single round trip plus an
 * upsert.
 */

import { createClient } from "@/lib/supabase/server";

export interface StreakResult {
  current_streak: number;
  longest_streak: number;
  last_completed_date: string | null;
  goal_met_today: boolean;
  events_today: number;
  daily_goal: number;
  used_freeze: boolean;
}

/**
 * Re-evaluate the user's streak based on activity through right now.
 * Idempotent — calling twice the same day with no new activity is a no-op.
 */
export async function tickStreak(): Promise<StreakResult | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Pull profile (timezone, daily_goal) and existing streak row in parallel.
  const [profileResp, streakResp] = await Promise.all([
    supabase.from("profiles").select("timezone, daily_goal").eq("id", user.id).maybeSingle(),
    supabase.from("streak_state").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  const tz = profileResp.data?.timezone || "UTC";
  const dailyGoal = profileResp.data?.daily_goal ?? 20;
  const today = todayInTz(tz);
  const yesterday = shiftDate(today, -1);
  const isoWeek = isoYearWeek(today);

  // Count events that occurred "today" in the user's local TZ.
  const { startUtc, endUtc } = localDayBoundsUtc(today, tz);
  const { count } = await supabase
    .from("session_events")
    .select("*", { count: "exact", head: true })
    .gte("occurred_at", startUtc)
    .lt("occurred_at", endUtc);

  const eventsToday = count ?? 0;
  const goalMet = eventsToday >= dailyGoal;

  const prev = streakResp.data ?? {
    user_id: user.id,
    current_streak: 0,
    longest_streak: 0,
    last_completed_date: null as string | null,
    freezes_used_iso_week: 0,
    iso_week: null as number | null,
  };

  // Reset weekly freeze allowance if we crossed into a new ISO week.
  let freezesUsed = prev.freezes_used_iso_week;
  let isoWeekStored = prev.iso_week;
  if (isoWeekStored !== isoWeek) {
    freezesUsed = 0;
    isoWeekStored = isoWeek;
  }

  let current = prev.current_streak;
  let longest = prev.longest_streak;
  let lastDate = prev.last_completed_date;
  let usedFreezeThisCall = false;

  if (goalMet) {
    if (lastDate === today) {
      // Already counted today; no streak change.
    } else if (lastDate === yesterday || current === 0) {
      // Continuing yesterday's streak (or starting a new one from zero).
      current = current + 1;
      lastDate = today;
    } else {
      // Gap: try to use a freeze.
      const gapDays = daysBetween(lastDate, today);
      const canFreeze = gapDays === 2 && freezesUsed < 1;
      if (canFreeze) {
        freezesUsed += 1;
        usedFreezeThisCall = true;
        current = current + 1; // patched; today extends the streak
        lastDate = today;
      } else {
        current = 1;
        lastDate = today;
      }
    }
    if (current > longest) longest = current;
  } else {
    // Goal not met today — don't touch current_streak yet (the user might
    // still hit the goal later in the day). We do still flush the iso_week
    // reset above so that a missed week's freeze allowance refreshes.
  }

  // Persist (upsert: handles first-time users with no streak_state row).
  const { error } = await supabase
    .from("streak_state")
    .upsert(
      {
        user_id: user.id,
        current_streak: current,
        longest_streak: longest,
        last_completed_date: lastDate,
        freezes_used_iso_week: freezesUsed,
        iso_week: isoWeekStored,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    console.warn("tickStreak upsert failed:", error.message);
  }

  return {
    current_streak: current,
    longest_streak: longest,
    last_completed_date: lastDate,
    goal_met_today: goalMet,
    events_today: eventsToday,
    daily_goal: dailyGoal,
    used_freeze: usedFreezeThisCall,
  };
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** "YYYY-MM-DD" in the given IANA timezone for `now`. */
function todayInTz(tz: string, when: Date = new Date()): string {
  // en-CA produces YYYY-MM-DD predictably; fall back to UTC if tz is bad.
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "numeric",
    });
    return fmt.format(when);
  } catch {
    return when.toISOString().slice(0, 10);
  }
}

function shiftDate(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const da = Date.UTC(ay, am - 1, ad);
  const db = Date.UTC(by, bm - 1, bd);
  return Math.round((db - da) / 86_400_000);
}

/**
 * ISO year/week as a single comparable integer: year*100 + week.
 * Per ISO 8601, weeks start Monday and week 1 contains the year's first Thursday.
 */
function isoYearWeek(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Move to Thursday of the same week (ISO week is the year of Thursday).
  const day = date.getUTCDay() || 7; // Sunday → 7
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const isoYear = date.getUTCFullYear();
  // Week number = days from Jan 1 of isoYear divided by 7, +1.
  const yearStart = Date.UTC(isoYear, 0, 1);
  const weekNo = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return isoYear * 100 + weekNo;
}

/**
 * Compute the UTC instants representing the start (inclusive) and end
 * (exclusive) of the given local-date in the given timezone. We use those
 * instants to query session_events with simple gte/lt.
 *
 * Note: this approximation works because IANA timezones have at most one
 * DST transition per day. We construct a Date for noon in tz, then shift
 * to find the boundaries.
 */
function localDayBoundsUtc(ymd: string, tz: string): { startUtc: string; endUtc: string } {
  const [y, m, d] = ymd.split("-").map(Number);
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12));
  // Find the offset between this UTC instant and the same wall-clock in tz.
  const offsetMs = tzOffsetMs(noonUtc, tz);
  // 00:00 local == noonUtc - 12h - offsetMs adjustment.
  const start = new Date(Date.UTC(y, m - 1, d, 0) - offsetMs);
  const end = new Date(Date.UTC(y, m - 1, d + 1, 0) - offsetMs);
  return { startUtc: start.toISOString(), endUtc: end.toISOString() };
}

/** Offset in ms (positive for east of UTC). */
function tzOffsetMs(when: Date, tz: string): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const parts = Object.fromEntries(dtf.formatToParts(when).map((p) => [p.type, p.value]));
    const local = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) === 24 ? 0 : Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    return local - when.getTime();
  } catch {
    return 0;
  }
}
