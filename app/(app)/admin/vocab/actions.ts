"use server";

/**
 * Server actions for the vocab admin page. Each action revalidates the list
 * route after a successful write so SSR snapshots stay fresh.
 *
 * Soft delete: we never DELETE rows — flashcards link back to vocab_entries
 * and the SRS history would break. Instead, set deleted_at and exclude soft-
 * deleted rows from list queries. This also lets the user "undo" a delete.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const PosEnum = z.enum([
  "verb", "noun", "adjective", "adverb", "pronoun", "preposition",
  "conjunction", "interjection", "phrase", "number", "article",
]);

const UpdateSchema = z.object({
  id: z.string().uuid(),
  lemma: z.string().min(1).max(200),
  translation: z.string().min(1).max(500),
  pos: PosEnum,
  example_es: z.string().max(500).nullable().optional(),
  example_en: z.string().max(500).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  is_irregular: z.boolean(),
  topic_id: z.string().uuid().nullable(),
});

const CreateSchema = UpdateSchema.omit({ id: true });

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export async function updateVocab(input: unknown): Promise<ActionResult> {
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "validation_failed" };

  const supabase = await createClient();
  const { id, topic_id, ...fields } = parsed.data;

  const { error } = await supabase.from("vocab_entries").update(fields).eq("id", id);
  if (error) return { ok: false, error: error.message };

  // Replace topic membership (one topic per vocab in this UI; the schema
  // supports multi-topic but the import + edit flow is single-topic).
  await supabase.from("vocab_topics").delete().eq("vocab_id", id);
  if (topic_id) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("vocab_topics").insert({ vocab_id: id, topic_id, user_id: user.id });
    }
  }

  revalidatePath("/admin/vocab");
  return { ok: true };
}

export async function createVocab(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "validation_failed" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const { topic_id, ...fields } = parsed.data;
  const { data, error } = await supabase
    .from("vocab_entries")
    .insert({ ...fields, user_id: user.id, tags: [] })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert_failed" };

  if (topic_id) {
    await supabase.from("vocab_topics").insert({ vocab_id: data.id, topic_id, user_id: user.id });
  }

  revalidatePath("/admin/vocab");
  return { ok: true, data: { id: data.id } };
}

export async function softDeleteVocab(id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "invalid_id" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("vocab_entries")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/vocab");
  return { ok: true };
}

export async function restoreVocab(id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "invalid_id" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("vocab_entries")
    .update({ deleted_at: null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/vocab");
  return { ok: true };
}
