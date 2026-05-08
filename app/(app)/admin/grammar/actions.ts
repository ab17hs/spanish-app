"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils/slugify";

const ExampleSchema = z.object({ es: z.string().min(1).max(500), en: z.string().min(1).max(500) });

const BaseSchema = z.object({
  title: z.string().min(1).max(200),
  category: z.string().min(1).max(80),
  level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).nullable(),
  explanation_md: z.string().min(1).max(8000),
  examples: z.array(ExampleSchema).max(50),
  difficulty: z.enum(["easy", "medium", "hard"]),
});

const UpdateSchema = BaseSchema.extend({ id: z.string().uuid() });

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export async function createGrammar(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = BaseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "validation_failed" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const slug = slugify(parsed.data.title);
  const { data, error } = await supabase
    .from("grammar_rules")
    .insert({
      user_id: user.id,
      title: parsed.data.title,
      slug,
      category: parsed.data.category,
      level: parsed.data.level,
      explanation_md: parsed.data.explanation_md,
      examples: parsed.data.examples,
      exercises: [],
      difficulty: parsed.data.difficulty,
      tags: [] as string[],
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert_failed" };

  revalidatePath("/admin/grammar");
  return { ok: true, data: { id: data.id } };
}

export async function updateGrammar(input: unknown): Promise<ActionResult> {
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "validation_failed" };
  const supabase = await createClient();
  const { id, ...fields } = parsed.data;
  const { error } = await supabase
    .from("grammar_rules")
    .update({
      title: fields.title,
      slug: slugify(fields.title),
      category: fields.category,
      level: fields.level,
      explanation_md: fields.explanation_md,
      examples: fields.examples,
      difficulty: fields.difficulty,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/grammar");
  revalidatePath(`/admin/grammar/${id}`);
  return { ok: true };
}

export async function softDeleteGrammar(id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "invalid_id" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("grammar_rules")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/grammar");
  return { ok: true };
}
