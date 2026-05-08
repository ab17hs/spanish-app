"use server";

/**
 * Study session server actions.
 *
 *   startSession(kind)   -> sessions row, returns id
 *   gradeCard(...)       -> updates srs_state via gradeCard(), logs a
 *                           session_event, optionally toggles weakness_flag.
 *   endSession(id, ...)  -> sets ended_at + tallies, returns summary
 *                           including the freshly-recomputed streak.
 *
 * The SRS math lives in lib/srs/scheduler.ts and is tested as a pure function;
 * everything in this file is just I/O glue around it.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { gradeCard, type SrsState } from "@/lib/srs/scheduler";
import { tickStreak, type StreakResult } from "@/lib/streaks/update";

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const StartSchema = z.object({
  kind: z.enum(["study", "review", "grammar", "reading", "story"]).default("study"),
});

export async function startSession(input: unknown): Promise<ActionResult<{ session_id: string }>> {
  const parsed = StartSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "validation_failed" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const { data, error } = await supabase
    .from("sessions")
    .insert({ user_id: user.id, kind: parsed.data.kind })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert_failed" };
  return { ok: true, data: { session_id: data.id } };
}

const GradeSchema = z.object({
  session_id: z.string().uuid(),
  card_id: z.string().uuid(),
  is_correct: z.boolean(),
  user_answer: z.string().max(500).nullable().optional(),
  expected_answer: z.string().max(500).nullable().optional(),
  ms_to_answer: z.number().int().min(0).max(600_000).nullable().optional(),
});

export async function gradeCardAction(input: unknown): Promise<
  ActionResult<{ next_due_at: string; interval_idx: number }>
> {
  const parsed = GradeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "validation_failed" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  // Fetch the current SRS state for this card. RLS scopes to user.
  const { data: stateRow, error: stateErr } = await supabase
    .from("srs_state")
    .select("interval_idx, due_at, last_seen_at, hits, misses, consecutive_hits, total_reviews")
    .eq("card_id", parsed.data.card_id)
    .single();
  if (stateErr || !stateRow) return { ok: false, error: stateErr?.message ?? "no_state" };

  const next = gradeCard(stateRow as SrsState, parsed.data.is_correct);

  const [stateUpdate, eventInsert] = await Promise.all([
    supabase
      .from("srs_state")
      .update({
        interval_idx: next.interval_idx,
        due_at: next.due_at,
        last_seen_at: next.last_seen_at,
        hits: next.hits,
        misses: next.misses,
        consecutive_hits: next.consecutive_hits,
        total_reviews: next.total_reviews,
      })
      .eq("card_id", parsed.data.card_id),
    supabase.from("session_events").insert({
      user_id: user.id,
      session_id: parsed.data.session_id,
      card_id: parsed.data.card_id,
      is_correct: parsed.data.is_correct,
      user_answer: parsed.data.user_answer ?? null,
      expected_answer: parsed.data.expected_answer ?? null,
      ms_to_answer: parsed.data.ms_to_answer ?? null,
    }),
  ]);

  if (stateUpdate.error) return { ok: false, error: stateUpdate.error.message };
  if (eventInsert.error) return { ok: false, error: eventInsert.error.message };

  // Heuristic weakness flag: 3+ reviews with miss ratio > 50%. The PK on
  // (user_id, card_id) makes the upsert idempotent — once flagged, future
  // sessions just no-op rather than spamming inserts.
  if (
    !parsed.data.is_correct &&
    next.misses + next.hits >= 3 &&
    next.misses / (next.hits + next.misses) > 0.5
  ) {
    await supabase
      .from("weakness_flags")
      .upsert(
        { user_id: user.id, card_id: parsed.data.card_id, reason: "high_miss_ratio" },
        { onConflict: "user_id,card_id", ignoreDuplicates: true },
      );
  }

  return { ok: true, data: { next_due_at: next.due_at, interval_idx: next.interval_idx } };
}

const EndSchema = z.object({
  session_id: z.string().uuid(),
  cards_correct: z.number().int().min(0).max(1000),
  cards_incorrect: z.number().int().min(0).max(1000),
  duration_seconds: z.number().int().min(0).max(86_400),
});

export async function endSession(input: unknown): Promise<ActionResult<{ streak: StreakResult | null }>> {
  const parsed = EndSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "validation_failed" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .update({
      ended_at: new Date().toISOString(),
      cards_correct: parsed.data.cards_correct,
      cards_incorrect: parsed.data.cards_incorrect,
      duration_seconds: parsed.data.duration_seconds,
    })
    .eq("id", parsed.data.session_id);
  if (error) return { ok: false, error: error.message };

  // Re-evaluate streak after the session is closed out. Failures here
  // shouldn't break the session-end UX, so we swallow errors.
  let streak: StreakResult | null = null;
  try {
    streak = await tickStreak();
  } catch (e) {
    console.warn("tickStreak failed:", e instanceof Error ? e.message : e);
  }

  return { ok: true, data: { streak } };
}
