/**
 * GET /api/export
 *
 * Streams the authenticated user's full library + progress as a single JSON
 * document. Intended for personal backup, not portability — the schema mirrors
 * our Postgres tables. The response sets a Content-Disposition header so it
 * downloads as `spanish-mastery-export-YYYY-MM-DD.json`.
 *
 * What's included (everything is RLS-scoped to the calling user):
 *   - profile          (preferences, level, timezone)
 *   - topics           (user-authored thematic groupings)
 *   - vocab_entries    + their cards + srs_state
 *   - grammar_rules    (with examples + slugs)
 *   - sessions         (with session_events flattened)
 *   - srs_state        (raw, in case the join missed any orphan rows)
 *   - weakness_flags
 *   - exam_attempts
 *   - streak_state
 *   - ai_cache         (generated readings/stories so the user keeps them)
 *
 * What's NOT included:
 *   - auth.users row (Supabase managed)
 *   - service-role-only audit columns
 *
 * The handler is best-effort: each table is fetched independently, and a
 * failure on one section just attaches an error note rather than 500-ing the
 * whole download. We'd rather hand the user a slightly-incomplete archive
 * than nothing at all.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SectionResult<T> {
  rows?: T[];
  error?: string;
}

async function fetchAll<T>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  filter?: { column: string; value: string },
): Promise<SectionResult<T>> {
  let q = supabase.from(table).select("*");
  if (filter) q = q.eq(filter.column, filter.value);
  const { data, error } = await q;
  if (error) return { error: error.message };
  return { rows: (data ?? []) as T[] };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // RLS already scopes most tables to the user, but we pass a filter where
  // the table is keyed by user_id directly so we hit the correct index.
  const [
    profile,
    topics,
    vocab,
    grammar,
    cards,
    srs,
    sessions,
    events,
    weakness,
    exams,
    streak,
    cache,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    fetchAll(supabase, "topics", { column: "user_id", value: user.id }),
    fetchAll(supabase, "vocab_entries", { column: "user_id", value: user.id }),
    fetchAll(supabase, "grammar_rules", { column: "user_id", value: user.id }),
    fetchAll(supabase, "cards", { column: "user_id", value: user.id }),
    fetchAll(supabase, "srs_state", { column: "user_id", value: user.id }),
    fetchAll(supabase, "sessions", { column: "user_id", value: user.id }),
    fetchAll(supabase, "session_events", { column: "user_id", value: user.id }),
    fetchAll(supabase, "weakness_flags", { column: "user_id", value: user.id }),
    fetchAll(supabase, "exam_attempts", { column: "user_id", value: user.id }),
    fetchAll(supabase, "streak_state", { column: "user_id", value: user.id }),
    fetchAll(supabase, "ai_cache", { column: "user_id", value: user.id }),
  ]);

  const payload = {
    schema_version: 1,
    exported_at: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
    },
    profile: profile.data ?? null,
    profile_error: profile.error?.message,
    topics: topics.rows ?? [],
    vocab_entries: vocab.rows ?? [],
    grammar_rules: grammar.rows ?? [],
    cards: cards.rows ?? [],
    srs_state: srs.rows ?? [],
    sessions: sessions.rows ?? [],
    session_events: events.rows ?? [],
    weakness_flags: weakness.rows ?? [],
    exam_attempts: exams.rows ?? [],
    streak_state: streak.rows ?? [],
    ai_cache: cache.rows ?? [],
    errors: Object.fromEntries(
      Object.entries({
        topics: topics.error,
        vocab: vocab.error,
        grammar: grammar.error,
        cards: cards.error,
        srs: srs.error,
        sessions: sessions.error,
        events: events.error,
        weakness: weakness.error,
        exams: exams.error,
        streak: streak.error,
        cache: cache.error,
      }).filter(([, v]) => v),
    ),
  };

  const today = new Date().toISOString().slice(0, 10);
  const filename = `spanish-mastery-export-${today}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
