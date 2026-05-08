/**
 * Dashboard data aggregator. Pulls everything the home page needs in a single
 * round-trip-batched call. Returned shape is consumed directly by the page
 * server component — no further filtering needed.
 *
 * All counts are scoped to the current user via Supabase RLS.
 */

import { createClient } from "@/lib/supabase/server";

export interface DashboardData {
  display_name: string | null;
  estimated_level: string | null;
  daily_goal: number;
  // Counts
  total_vocab: number;
  total_grammar: number;
  total_topics: number;
  total_cards: number;
  cards_due_now: number;
  cards_new: number;          // total_reviews = 0
  weakness_count: number;
  // Today
  reviews_today: number;
  correct_today: number;
  // Streak
  current_streak: number;
  longest_streak: number;
  last_completed_date: string | null;
  // 14-day activity heatmap (oldest first)
  daily_activity: Array<{ date: string; reviews: number; correct: number }>;
}

export async function getDashboardData(): Promise<DashboardData | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const today = startOfDayIso();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  // Fire all queries in parallel.
  const [
    profileResp,
    vocabResp,
    grammarResp,
    topicsResp,
    cardsResp,
    dueResp,
    newResp,
    weakResp,
    todayEventsResp,
    streakResp,
    recentEventsResp,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, estimated_level, daily_goal")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("vocab_entries").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("grammar_rules").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("topics").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("flashcards").select("id", { count: "exact", head: true }),
    supabase
      .from("srs_state")
      .select("card_id", { count: "exact", head: true })
      .lte("due_at", nowIso),
    supabase
      .from("srs_state")
      .select("card_id", { count: "exact", head: true })
      .eq("total_reviews", 0),
    supabase.from("weakness_flags").select("id", { count: "exact", head: true }),
    supabase
      .from("session_events")
      .select("is_correct")
      .gte("occurred_at", today),
    supabase
      .from("streak_state")
      .select("current_streak, longest_streak, last_completed_date")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("session_events")
      .select("is_correct, occurred_at")
      .gte("occurred_at", fourteenDaysAgo),
  ]);

  // 14-day activity bins (oldest → newest)
  const buckets = new Map<string, { reviews: number; correct: number }>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    buckets.set(d.toISOString().slice(0, 10), { reviews: 0, correct: 0 });
  }
  for (const row of recentEventsResp.data ?? []) {
    const day = (row.occurred_at as string).slice(0, 10);
    const b = buckets.get(day);
    if (b) {
      b.reviews += 1;
      if (row.is_correct) b.correct += 1;
    }
  }

  const todayEvents = todayEventsResp.data ?? [];
  const correctToday = todayEvents.filter((e) => e.is_correct).length;

  return {
    display_name: profileResp.data?.display_name ?? null,
    estimated_level: profileResp.data?.estimated_level ?? null,
    daily_goal: profileResp.data?.daily_goal ?? 20,
    total_vocab: vocabResp.count ?? 0,
    total_grammar: grammarResp.count ?? 0,
    total_topics: topicsResp.count ?? 0,
    total_cards: cardsResp.count ?? 0,
    cards_due_now: dueResp.count ?? 0,
    cards_new: newResp.count ?? 0,
    weakness_count: weakResp.count ?? 0,
    reviews_today: todayEvents.length,
    correct_today: correctToday,
    current_streak: streakResp.data?.current_streak ?? 0,
    longest_streak: streakResp.data?.longest_streak ?? 0,
    last_completed_date: streakResp.data?.last_completed_date ?? null,
    daily_activity: Array.from(buckets.entries()).map(([date, v]) => ({ date, ...v })),
  };
}

function startOfDayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
