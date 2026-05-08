"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils/slugify";

const ColorRe = /^#[0-9a-fA-F]{6}$/;

const CreateSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).nullable().optional(),
  color: z.string().regex(ColorRe).nullable().optional(),
});

const UpdateSchema = CreateSchema.extend({
  id: z.string().uuid(),
  sort_order: z.number().int().min(0).max(10000).optional(),
});

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export async function createTopic(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "validation_failed" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const slug = slugify(parsed.data.name);
  const { data, error } = await supabase
    .from("topics")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      slug,
      description: parsed.data.description ?? null,
      color: parsed.data.color ?? null,
      sort_order: 0,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert_failed" };

  revalidatePath("/admin/topics");
  revalidatePath("/admin");
  return { ok: true, data: { id: data.id } };
}

export async function updateTopic(input: unknown): Promise<ActionResult> {
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "validation_failed" };
  const supabase = await createClient();
  const { id, name, description, color, sort_order } = parsed.data;
  const update: Record<string, unknown> = {
    name,
    slug: slugify(name),
    description: description ?? null,
    color: color ?? null,
  };
  if (typeof sort_order === "number") update.sort_order = sort_order;
  const { error } = await supabase.from("topics").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/topics");
  return { ok: true };
}

export async function softDeleteTopic(id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "invalid_id" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("topics")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/topics");
  return { ok: true };
}
