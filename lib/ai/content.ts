/**
 * Content generation orchestration.
 *
 * Wraps the raw Claude calls in `lib/ai/claude.ts` with:
 *   - User-aware vocab/grammar hint sampling (so generations recycle words
 *     the learner is actually working on, not random Spanish 101 vocab).
 *   - ai_cache persistence (so we keep a history of generated readings/stories
 *     and don't re-bill for identical (key, seed) requests).
 *
 * Each call appends a UUID seed to the cache_key, which means every "Generate
 * new" click produces a fresh row — the cache is effectively the user's
 * library of generated content, not a one-shot dedup layer. We still hash on
 * seed so future "regenerate with same params" can be deterministic if a seed
 * is supplied explicitly.
 */

import { createClient } from "@/lib/supabase/server";
import {
  cacheKey,
  generateReading,
  generateStory,
  type Reading,
  type Story,
} from "./claude";

export interface CachedContent<T> {
  id: string;
  payload: T;
  topics: string[];
  level: string;
  grammar_focus: string | null;
  tokens_used: number;
  created_at: string;
}

/**
 * Pull a representative sample of the user's actively-studied vocab so the
 * generator can weave it in. We bias toward "in-flight" cards (started but
 * not mastered) and weak cards, since those are what the user actually
 * needs more exposure to.
 */
async function pickVocabHints(limit = 40): Promise<string[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // First try: SRS state with kind=vocab_es_en, prefer cards in flight, by misses desc.
  const { data: srsRows } = await supabase
    .from("srs_state")
    .select(
      `interval_idx, total_reviews, misses,
       flashcards!inner(kind, vocab_id)`,
    )
    .eq("flashcards.kind", "vocab_es_en")
    .gt("total_reviews", 0)
    .order("misses", { ascending: false })
    .limit(limit * 2);

  type Row = { flashcards: { vocab_id: string | null } };
  const ids = Array.from(
    new Set(
      ((srsRows ?? []) as unknown as Row[])
        .map((r) => r.flashcards.vocab_id)
        .filter((x): x is string => Boolean(x)),
    ),
  ).slice(0, limit);

  if (ids.length < limit) {
    // Pad with random vocab the user owns but hasn't seen yet.
    const need = limit - ids.length;
    const { data: extra } = await supabase
      .from("vocab_entries")
      .select("id")
      .is("deleted_at", null)
      .limit(need * 2);
    for (const e of extra ?? []) {
      if (!ids.includes(e.id)) ids.push(e.id);
      if (ids.length >= limit) break;
    }
  }

  if (ids.length === 0) return [];

  const { data: vocab } = await supabase
    .from("vocab_entries")
    .select("lemma")
    .in("id", ids);
  return (vocab ?? []).map((v) => v.lemma);
}

async function pickTopicNames(slugs: string[]): Promise<string[]> {
  if (slugs.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("topics")
    .select("name")
    .in("slug", slugs)
    .is("deleted_at", null);
  return (data ?? []).map((t) => t.name);
}

async function pickGrammarFocusTitle(grammarSlug: string | null | undefined): Promise<string | undefined> {
  if (!grammarSlug) return undefined;
  const supabase = await createClient();
  const { data } = await supabase
    .from("grammar_rules")
    .select("title")
    .eq("slug", grammarSlug)
    .is("deleted_at", null)
    .maybeSingle();
  return data?.title;
}

/**
 * Read the user's current estimated CEFR level from their profile, with a
 * sane fallback for first-timers.
 */
async function readUserLevel(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "A2";
  const { data } = await supabase
    .from("profiles")
    .select("estimated_level")
    .eq("id", user.id)
    .maybeSingle();
  return data?.estimated_level ?? "A2";
}

interface GenInput {
  topicSlugs: string[];
  grammarSlug?: string | null;
  level?: string | null;
  seed?: string;
}

export async function generateAndStoreReading(
  input: GenInput,
): Promise<CachedContent<Reading>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  const [topicNames, vocabHints, grammarFocus] = await Promise.all([
    pickTopicNames(input.topicSlugs),
    pickVocabHints(40),
    pickGrammarFocusTitle(input.grammarSlug),
  ]);

  const level = input.level ?? (await readUserLevel());
  const seed = input.seed ?? crypto.randomUUID();
  const key = await cacheKey([
    "reading",
    input.topicSlugs,
    input.grammarSlug ?? "",
    level,
    seed,
  ]);

  const { data, tokens } = await generateReading({
    topics: topicNames.length > 0 ? topicNames : ["everyday life"],
    vocabHints,
    level,
    grammarFocus,
  });

  const { data: row, error } = await supabase
    .from("ai_cache")
    .insert({
      user_id: user.id,
      cache_key: key,
      kind: "reading",
      payload: {
        ...data,
        _meta: {
          topics: topicNames,
          topic_slugs: input.topicSlugs,
          grammar_focus: grammarFocus ?? null,
          grammar_slug: input.grammarSlug ?? null,
          level,
        },
      },
      tokens_used: tokens,
    })
    .select("id, payload, tokens_used, created_at")
    .single();

  if (error || !row) throw new Error(error?.message ?? "ai_cache insert failed");

  return {
    id: row.id,
    payload: row.payload as Reading,
    topics: topicNames,
    level,
    grammar_focus: grammarFocus ?? null,
    tokens_used: row.tokens_used ?? tokens,
    created_at: row.created_at,
  };
}

export async function generateAndStoreStory(
  input: GenInput & { theme?: string | null },
): Promise<CachedContent<Story>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  const [topicNames, vocabHints, grammarFocus] = await Promise.all([
    pickTopicNames(input.topicSlugs),
    pickVocabHints(50),
    pickGrammarFocusTitle(input.grammarSlug),
  ]);

  const level = input.level ?? (await readUserLevel());
  const seed = input.seed ?? crypto.randomUUID();
  const key = await cacheKey([
    "story",
    input.topicSlugs,
    input.grammarSlug ?? "",
    level,
    input.theme ?? "",
    seed,
  ]);

  const { data, tokens } = await generateStory({
    topics: topicNames.length > 0 ? topicNames : ["a small town in Spain"],
    vocabHints,
    level,
    grammarFocus,
    theme: input.theme ?? undefined,
  });

  const { data: row, error } = await supabase
    .from("ai_cache")
    .insert({
      user_id: user.id,
      cache_key: key,
      kind: "story",
      payload: {
        ...data,
        _meta: {
          topics: topicNames,
          topic_slugs: input.topicSlugs,
          grammar_focus: grammarFocus ?? null,
          grammar_slug: input.grammarSlug ?? null,
          level,
          theme: input.theme ?? null,
        },
      },
      tokens_used: tokens,
    })
    .select("id, payload, tokens_used, created_at")
    .single();

  if (error || !row) throw new Error(error?.message ?? "ai_cache insert failed");

  return {
    id: row.id,
    payload: row.payload as Story,
    topics: topicNames,
    level,
    grammar_focus: grammarFocus ?? null,
    tokens_used: row.tokens_used ?? tokens,
    created_at: row.created_at,
  };
}
