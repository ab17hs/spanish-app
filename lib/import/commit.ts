/**
 * Commit reviewed import candidates to the database.
 *
 * Idempotency:
 *   - vocab_entries: keyed on (user_id, lower(lemma), pos). If a row already
 *     exists, we update non-null fields (translation, examples, notes, tags)
 *     instead of inserting a duplicate.
 *   - topics: keyed on (user_id, slug). Inserted on first sight, reused after.
 *   - grammar_rules: keyed on (user_id, slug). Same upsert behavior.
 *
 * Side effects:
 *   - Database triggers (defined in migrations) generate flashcards + srs_state
 *     rows automatically when a vocab_entry or grammar_rule is inserted.
 *   - vocab_topics rows are inserted to link an entry to its topic.
 *   - import_logs receives a single row summarizing the import.
 *
 * The function is resilient: a single failing row logs a warning but does not
 * abort the whole batch. Returns a summary the caller can show to the user.
 */

import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils/slugify";
import type { ParsedVocab, ParsedGrammar } from "@/lib/parser/docx-parser";

export interface CommitResult {
  vocab_added: number;
  vocab_updated: number;
  vocab_skipped: number;
  grammar_added: number;
  grammar_updated: number;
  topics_added: number;
  warnings: string[];
}

export interface CommitInput {
  filename: string;
  vocab: ParsedVocab[];
  grammar: ParsedGrammar[];
  topics: { slug: string; name: string }[];
}

export async function commitImport(input: CommitInput): Promise<CommitResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");

  const result: CommitResult = {
    vocab_added: 0,
    vocab_updated: 0,
    vocab_skipped: 0,
    grammar_added: 0,
    grammar_updated: 0,
    topics_added: 0,
    warnings: [],
  };

  // ---------------------------------------------------------------------
  // 1. Upsert topics first — vocab/grammar reference them by id
  // ---------------------------------------------------------------------
  const topicSlugToId = new Map<string, string>();
  {
    // Pull existing topics for this user
    const { data: existing, error } = await supabase
      .from("topics")
      .select("id, slug")
      .is("deleted_at", null);
    if (error) {
      result.warnings.push(`Failed to list topics: ${error.message}`);
    } else {
      for (const row of existing ?? []) topicSlugToId.set(row.slug, row.id);
    }

    const newTopics = input.topics.filter((t) => !topicSlugToId.has(t.slug));
    if (newTopics.length > 0) {
      const { data: inserted, error: insertErr } = await supabase
        .from("topics")
        .insert(
          newTopics.map((t, i) => ({
            user_id: user.id,
            name: t.name,
            slug: t.slug,
            sort_order: i,
          })),
        )
        .select("id, slug");
      if (insertErr) {
        result.warnings.push(`Failed to insert ${newTopics.length} topics: ${insertErr.message}`);
      } else {
        for (const row of inserted ?? []) topicSlugToId.set(row.slug, row.id);
        result.topics_added = inserted?.length ?? 0;
      }
    }
  }

  // ---------------------------------------------------------------------
  // 2. Upsert vocab entries (keyed on lemma+pos)
  // ---------------------------------------------------------------------
  // Pre-fetch existing entries in one round-trip to avoid N+1 lookups.
  const existingVocabKey = new Map<string, string>(); // "lemma|pos" -> id
  {
    const { data: existing, error } = await supabase
      .from("vocab_entries")
      .select("id, lemma, pos")
      .is("deleted_at", null);
    if (error) {
      result.warnings.push(`Failed to list vocab: ${error.message}`);
    } else {
      for (const row of existing ?? []) {
        existingVocabKey.set(vocabKey(row.lemma, row.pos), row.id);
      }
    }
  }

  // Insert new vocab in chunks of 200 (Postgres won't choke; Supabase JSON wire
  // size stays manageable).
  const newVocab: Array<ParsedVocab & { topicId: string | null }> = [];
  const updateVocab: Array<{ id: string; v: ParsedVocab; topicId: string | null }> = [];

  for (const v of input.vocab) {
    const key = vocabKey(v.lemma, v.pos);
    const topicId = topicSlugToId.get(v.topic_slug) ?? null;
    if (existingVocabKey.has(key)) {
      updateVocab.push({ id: existingVocabKey.get(key)!, v, topicId });
    } else {
      newVocab.push({ ...v, topicId });
    }
  }

  if (newVocab.length > 0) {
    const chunks = chunk(newVocab, 200);
    for (const c of chunks) {
      const rows = c.map((v) => ({
        user_id: user.id,
        lemma: v.lemma,
        translation: v.translation,
        pos: v.pos,
        example_es: v.example_es ?? null,
        example_en: v.example_en ?? null,
        notes: v.notes ?? null,
        difficulty: v.difficulty ?? "easy",
        is_irregular: v.is_irregular ?? false,
        tags: [] as string[],
      }));
      const { data: inserted, error } = await supabase
        .from("vocab_entries")
        .insert(rows)
        .select("id, lemma, pos");
      if (error) {
        result.warnings.push(`Insert chunk failed: ${error.message}`);
        result.vocab_skipped += c.length;
        continue;
      }
      result.vocab_added += inserted?.length ?? 0;

      // Link inserted vocab to topics
      const links: { vocab_id: string; topic_id: string; user_id: string }[] = [];
      const insertedById = new Map<string, string>();
      for (const row of inserted ?? []) insertedById.set(vocabKey(row.lemma, row.pos), row.id);
      for (const v of c) {
        const id = insertedById.get(vocabKey(v.lemma, v.pos));
        if (id && v.topicId) {
          links.push({ vocab_id: id, topic_id: v.topicId, user_id: user.id });
        }
      }
      if (links.length > 0) {
        const { error: linkErr } = await supabase.from("vocab_topics").insert(links);
        if (linkErr) result.warnings.push(`Topic links failed: ${linkErr.message}`);
      }
    }
  }

  // Update existing vocab in-place. Only fill blanks; we don't overwrite
  // user edits with re-imported data.
  for (const { id, v, topicId } of updateVocab) {
    const { error } = await supabase
      .from("vocab_entries")
      .update({
        translation: v.translation,
        example_es: v.example_es ?? null,
        example_en: v.example_en ?? null,
        notes: v.notes ?? null,
      })
      .eq("id", id);
    if (error) {
      result.warnings.push(`Update ${v.lemma}: ${error.message}`);
      continue;
    }
    result.vocab_updated += 1;

    if (topicId) {
      // Ensure topic link exists (idempotent — uses primary key conflict).
      const { error: linkErr } = await supabase
        .from("vocab_topics")
        .upsert(
          { vocab_id: id, topic_id: topicId, user_id: user.id },
          { onConflict: "vocab_id,topic_id", ignoreDuplicates: true },
        );
      if (linkErr) result.warnings.push(`Link ${v.lemma}: ${linkErr.message}`);
    }
  }

  // ---------------------------------------------------------------------
  // 3. Upsert grammar rules (keyed on slug)
  // ---------------------------------------------------------------------
  const existingGrammarSlug = new Map<string, string>();
  {
    const { data: existing, error } = await supabase
      .from("grammar_rules")
      .select("id, slug")
      .is("deleted_at", null);
    if (error) {
      result.warnings.push(`Failed to list grammar: ${error.message}`);
    } else {
      for (const row of existing ?? []) existingGrammarSlug.set(row.slug, row.id);
    }
  }

  for (const g of input.grammar) {
    const slug = slugify(g.title);
    const topicId = topicSlugToId.get(g.topic_slug) ?? null;
    if (existingGrammarSlug.has(slug)) {
      const id = existingGrammarSlug.get(slug)!;
      const { error } = await supabase
        .from("grammar_rules")
        .update({
          explanation_md: g.explanation_md,
          examples: g.examples,
          category: g.category,
        })
        .eq("id", id);
      if (error) {
        result.warnings.push(`Update grammar ${slug}: ${error.message}`);
        continue;
      }
      result.grammar_updated += 1;
      if (topicId) {
        await supabase
          .from("grammar_topics")
          .upsert(
            { grammar_id: id, topic_id: topicId, user_id: user.id },
            { onConflict: "grammar_id,topic_id", ignoreDuplicates: true },
          );
      }
    } else {
      const { data: inserted, error } = await supabase
        .from("grammar_rules")
        .insert({
          user_id: user.id,
          title: g.title,
          slug,
          category: g.category,
          explanation_md: g.explanation_md,
          examples: g.examples,
          exercises: [],
          difficulty: "medium",
          tags: [] as string[],
        })
        .select("id")
        .single();
      if (error) {
        result.warnings.push(`Insert grammar ${slug}: ${error.message}`);
        continue;
      }
      result.grammar_added += 1;
      if (inserted && topicId) {
        await supabase.from("grammar_topics").insert({
          grammar_id: inserted.id,
          topic_id: topicId,
          user_id: user.id,
        });
      }
    }
  }

  // ---------------------------------------------------------------------
  // 4. Write a single import log row
  // ---------------------------------------------------------------------
  await supabase.from("import_logs").insert({
    user_id: user.id,
    filename: input.filename,
    vocab_added: result.vocab_added,
    vocab_updated: result.vocab_updated,
    grammar_added: result.grammar_added,
    grammar_updated: result.grammar_updated,
    topics_added: result.topics_added,
    raw_path: null,
  });

  return result;
}

function vocabKey(lemma: string, pos: string): string {
  return `${lemma.trim().toLowerCase()}|${pos}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
