/**
 * Build a study queue for the current user.
 *
 * Mix:
 *   - Due cards (due_at <= now), most overdue first.
 *   - Weak cards (low hit ratio + recent miss) bumped to the front.
 *   - "New" cards (total_reviews = 0) capped by `newPerSession` to avoid
 *     overwhelming the user when the library is freshly imported.
 *
 * Filters:
 *   - kind?: card kind ("vocab_es_en", "vocab_en_es", "grammar") — pick a
 *     direction-only or grammar-only session.
 *   - topicSlug?: limit to vocab/grammar in this topic.
 *
 * Returns the cards along with the data the UI needs to render them
 * (lemma + translation + examples for vocab; title + explanation for grammar).
 */

import { createClient } from "@/lib/supabase/server";
import type { CardKind, Pos } from "@/types/database";
import { sortSessionCards } from "@/lib/srs/scheduler";

export interface QueueCard {
  card_id: string;
  kind: CardKind;
  is_weak: boolean;
  total_reviews: number;
  due_at: string;
  // Vocab fields
  vocab_id?: string | null;
  lemma?: string;
  translation?: string;
  pos?: Pos;
  example_es?: string | null;
  example_en?: string | null;
  // Grammar fields
  grammar_id?: string | null;
  title?: string;
  explanation_md?: string;
  examples?: { es: string; en: string }[];
}

export interface QueueOptions {
  limit?: number;          // Max cards in this session (default 30)
  newPerSession?: number;  // Max brand-new cards (default 8)
  kind?: CardKind | "all";
  topicSlug?: string;
}

export async function buildStudyQueue(opts: QueueOptions = {}): Promise<QueueCard[]> {
  const limit = Math.min(80, Math.max(5, opts.limit ?? 30));
  const newCap = Math.min(limit, Math.max(0, opts.newPerSession ?? 8));
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Get all srs_state rows joined with their flashcard. We rely on RLS to
  // scope to this user; LIMITs are applied after the in-memory mix.
  let query = supabase
    .from("srs_state")
    .select(
      `card_id, due_at, total_reviews, is_weak,
       flashcards!inner(id, kind, vocab_id, grammar_id)`,
    );
  if (opts.kind && opts.kind !== "all") {
    query = query.eq("flashcards.kind", opts.kind);
  }

  const { data: stateRows, error } = await query;
  if (error || !stateRows) return [];

  // De-duplicate the flashcard inner-relation. Supabase's join returns the
  // single row as an object (not an array) when ! is used on the FK.
  type StateRow = {
    card_id: string;
    due_at: string;
    total_reviews: number;
    is_weak: boolean;
    flashcards: { id: string; kind: CardKind; vocab_id: string | null; grammar_id: string | null };
  };
  const rows = stateRows as unknown as StateRow[];

  // Pull all needed vocab + grammar in batched queries to avoid N+1.
  const vocabIds = Array.from(new Set(rows.map((r) => r.flashcards.vocab_id).filter(Boolean) as string[]));
  const grammarIds = Array.from(new Set(rows.map((r) => r.flashcards.grammar_id).filter(Boolean) as string[]));

  const [vocabResp, grammarResp, topicLinks] = await Promise.all([
    vocabIds.length > 0
      ? supabase
          .from("vocab_entries")
          .select("id, lemma, translation, pos, example_es, example_en")
          .in("id", vocabIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as Array<{ id: string; lemma: string; translation: string; pos: Pos; example_es: string | null; example_en: string | null }> }),
    grammarIds.length > 0
      ? supabase
          .from("grammar_rules")
          .select("id, title, explanation_md, examples")
          .in("id", grammarIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string; explanation_md: string; examples: unknown }> }),
    opts.topicSlug
      ? supabase
          .from("topics")
          .select(
            `id, slug,
             vocab_topics(vocab_id),
             grammar_topics(grammar_id)`,
          )
          .eq("slug", opts.topicSlug)
          .maybeSingle()
      : Promise.resolve({ data: null as null }),
  ]);

  const vocabById = new Map(
    (vocabResp.data ?? []).map((v) => [v.id, v]),
  );
  const grammarById = new Map(
    (grammarResp.data ?? []).map((g) => [g.id, g]),
  );

  // Topic filter: collect allowed vocab + grammar ids if a topic was specified.
  let allowedVocab: Set<string> | null = null;
  let allowedGrammar: Set<string> | null = null;
  if (opts.topicSlug && topicLinks?.data) {
    const t = topicLinks.data as unknown as {
      vocab_topics: { vocab_id: string }[];
      grammar_topics: { grammar_id: string }[];
    };
    allowedVocab = new Set(t.vocab_topics?.map((x) => x.vocab_id) ?? []);
    allowedGrammar = new Set(t.grammar_topics?.map((x) => x.grammar_id) ?? []);
  }

  // Build candidate QueueCards
  const candidates: QueueCard[] = [];
  for (const r of rows) {
    const card = r.flashcards;
    if (card.vocab_id) {
      if (allowedVocab && !allowedVocab.has(card.vocab_id)) continue;
      const v = vocabById.get(card.vocab_id);
      if (!v) continue; // vocab was soft-deleted
      candidates.push({
        card_id: r.card_id,
        kind: card.kind,
        is_weak: r.is_weak,
        total_reviews: r.total_reviews,
        due_at: r.due_at,
        vocab_id: v.id,
        lemma: v.lemma,
        translation: v.translation,
        pos: v.pos,
        example_es: v.example_es,
        example_en: v.example_en,
      });
    } else if (card.grammar_id) {
      if (allowedGrammar && !allowedGrammar.has(card.grammar_id)) continue;
      const g = grammarById.get(card.grammar_id);
      if (!g) continue;
      candidates.push({
        card_id: r.card_id,
        kind: card.kind,
        is_weak: r.is_weak,
        total_reviews: r.total_reviews,
        due_at: r.due_at,
        grammar_id: g.id,
        title: g.title,
        explanation_md: g.explanation_md,
        examples: Array.isArray(g.examples) ? (g.examples as { es: string; en: string }[]).slice(0, 5) : [],
      });
    }
  }

  // Apply ordering: most-overdue first, weak cards bumped, new cards last.
  const sorted = sortSessionCards(candidates);

  // Cap "new" cards (total_reviews === 0) at newCap to keep early sessions sane.
  const out: QueueCard[] = [];
  let newCount = 0;
  for (const c of sorted) {
    if (c.total_reviews === 0) {
      if (newCount >= newCap) continue;
      newCount += 1;
    }
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}
