/**
 * Progress page aggregator. Heavier than the dashboard one — pulls 30 days of
 * activity, topic mastery breakdowns, and the worst-performing cards.
 */

import { createClient } from "@/lib/supabase/server";

export interface TopicMastery {
  topic_id: string;
  topic_name: string;
  topic_color: string | null;
  total: number;
  mastered: number; // interval_idx >= 4 (21 day+ interval)
  learning: number; // 0 < interval_idx < 4
  unseen: number;   // total_reviews = 0
  pct_mastered: number;
}

export interface WeakCard {
  card_id: string;
  kind: string;
  prompt: string;
  expected: string;
  total_reviews: number;
  hits: number;
  misses: number;
  accuracy: number;
}

export interface DailyBucket {
  date: string;
  reviews: number;
  correct: number;
  minutes: number;
}

export interface ProgressData {
  daily_activity: DailyBucket[];
  topic_mastery: TopicMastery[];
  weak_cards: WeakCard[];
  totals: {
    reviews_30d: number;
    accuracy_30d: number;
    minutes_30d: number;
    cards_mastered: number;
    cards_total: number;
  };
}

export async function getProgressData(): Promise<ProgressData | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [eventsResp, sessionsResp, srsResp, vocabTopicsResp, grammarTopicsResp, topicsResp, vocabResp, weakRespRaw] =
    await Promise.all([
      supabase.from("session_events").select("is_correct, occurred_at").gte("occurred_at", since),
      supabase.from("sessions").select("started_at, duration_seconds").gte("started_at", since),
      supabase
        .from("srs_state")
        .select(
          `card_id, interval_idx, total_reviews, hits, misses,
           flashcards!inner(id, kind, vocab_id, grammar_id)`,
        ),
      supabase.from("vocab_topics").select("vocab_id, topic_id"),
      supabase.from("grammar_topics").select("grammar_id, topic_id"),
      supabase.from("topics").select("id, name, color").is("deleted_at", null),
      supabase.from("vocab_entries").select("id, lemma, translation").is("deleted_at", null),
      supabase
        .from("srs_state")
        .select(
          `card_id, total_reviews, hits, misses,
           flashcards!inner(kind, vocab_id, grammar_id)`,
        )
        .gte("total_reviews", 3)
        .order("misses", { ascending: false })
        .limit(40),
    ]);

  // Build daily buckets
  const buckets = new Map<string, DailyBucket>();
  for (let i = 29; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    buckets.set(day, { date: day, reviews: 0, correct: 0, minutes: 0 });
  }
  for (const r of eventsResp.data ?? []) {
    const day = (r.occurred_at as string).slice(0, 10);
    const b = buckets.get(day);
    if (b) {
      b.reviews += 1;
      if (r.is_correct) b.correct += 1;
    }
  }
  for (const s of sessionsResp.data ?? []) {
    const day = (s.started_at as string).slice(0, 10);
    const b = buckets.get(day);
    if (b && s.duration_seconds) b.minutes += Math.round(s.duration_seconds / 60);
  }

  // Topic mastery
  type SrsRow = {
    card_id: string;
    interval_idx: number;
    total_reviews: number;
    hits: number;
    misses: number;
    flashcards: { id: string; kind: string; vocab_id: string | null; grammar_id: string | null };
  };
  const srsRows = (srsResp.data ?? []) as unknown as SrsRow[];
  const vocabToTopic = new Map<string, string>();
  for (const r of vocabTopicsResp.data ?? []) vocabToTopic.set(r.vocab_id, r.topic_id);
  const grammarToTopic = new Map<string, string>();
  for (const r of grammarTopicsResp.data ?? []) grammarToTopic.set(r.grammar_id, r.topic_id);

  const topicAcc = new Map<string, TopicMastery>();

  for (const t of topicsResp.data ?? []) {
    topicAcc.set(t.id, {
      topic_id: t.id,
      topic_name: t.name,
      topic_color: t.color,
      total: 0,
      mastered: 0,
      learning: 0,
      unseen: 0,
      pct_mastered: 0,
    });
  }

  for (const row of srsRows) {
    const topicId = row.flashcards.vocab_id
      ? vocabToTopic.get(row.flashcards.vocab_id)
      : row.flashcards.grammar_id
      ? grammarToTopic.get(row.flashcards.grammar_id)
      : null;
    if (!topicId) continue;
    const t = topicAcc.get(topicId);
    if (!t) continue;
    t.total += 1;
    if (row.total_reviews === 0) t.unseen += 1;
    else if (row.interval_idx >= 4) t.mastered += 1;
    else t.learning += 1;
  }

  for (const t of topicAcc.values()) {
    t.pct_mastered = t.total === 0 ? 0 : Math.round((t.mastered / t.total) * 100);
  }

  // Weak cards
  const vocabById = new Map(vocabResp.data?.map((v) => [v.id, v]) ?? []);
  type WeakRow = {
    card_id: string;
    total_reviews: number;
    hits: number;
    misses: number;
    flashcards: { kind: string; vocab_id: string | null; grammar_id: string | null };
  };
  const weakRaw = (weakRespRaw.data ?? []) as unknown as WeakRow[];
  const weakCards: WeakCard[] = [];
  for (const r of weakRaw) {
    const acc = r.hits / Math.max(1, r.hits + r.misses);
    if (acc >= 0.7) continue; // not actually weak — skip
    let prompt = "";
    let expected = "";
    if (r.flashcards.vocab_id) {
      const v = vocabById.get(r.flashcards.vocab_id);
      if (!v) continue;
      if (r.flashcards.kind === "vocab_es_en") {
        prompt = v.lemma;
        expected = v.translation;
      } else {
        prompt = v.translation;
        expected = v.lemma;
      }
    } else {
      prompt = "(grammar)";
      expected = "(open the rule for the explanation)";
    }
    weakCards.push({
      card_id: r.card_id,
      kind: r.flashcards.kind,
      prompt,
      expected,
      total_reviews: r.total_reviews,
      hits: r.hits,
      misses: r.misses,
      accuracy: Math.round(acc * 100),
    });
  }

  const reviews30d = (eventsResp.data ?? []).length;
  const correct30d = (eventsResp.data ?? []).filter((e) => e.is_correct).length;
  const accuracy30d = reviews30d === 0 ? 0 : Math.round((correct30d / reviews30d) * 100);
  const minutes30d = (sessionsResp.data ?? []).reduce((sum, s) => sum + Math.round((s.duration_seconds ?? 0) / 60), 0);
  const cardsMastered = srsRows.filter((r) => r.interval_idx >= 4).length;
  const cardsTotal = srsRows.length;

  return {
    daily_activity: Array.from(buckets.values()),
    topic_mastery: Array.from(topicAcc.values())
      .filter((t) => t.total > 0)
      .sort((a, b) => b.total - a.total),
    weak_cards: weakCards.slice(0, 20),
    totals: {
      reviews_30d: reviews30d,
      accuracy_30d: accuracy30d,
      minutes_30d: minutes30d,
      cards_mastered: cardsMastered,
      cards_total: cardsTotal,
    },
  };
}
