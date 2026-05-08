"use server";

/**
 * Server actions for the story mode. Mirrors /reading/actions.ts but
 * produces longer narrative content via generateStory.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateAndStoreStory } from "@/lib/ai/content";

const GenerateStoryInput = z.object({
  topicSlugs: z.array(z.string().min(1).max(80)).max(8).default([]),
  grammarSlug: z.string().min(1).max(120).nullable().optional(),
  level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).nullable().optional(),
  theme: z.string().max(200).nullable().optional(),
});

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function generateStoryAction(
  input: z.infer<typeof GenerateStoryInput>,
): Promise<ActionResult<{ id: string }>> {
  const parsed = GenerateStoryInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "invalid input" };
  }
  try {
    const result = await generateAndStoreStory({
      topicSlugs: parsed.data.topicSlugs,
      grammarSlug: parsed.data.grammarSlug ?? null,
      level: parsed.data.level ?? null,
      theme: parsed.data.theme ?? null,
    });
    revalidatePath("/story");
    return { ok: true, data: { id: result.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "generation failed" };
  }
}

export async function deleteStoryAction(id: string): Promise<ActionResult> {
  if (!id || typeof id !== "string") return { ok: false, error: "invalid id" };
  const supabase = await createClient();
  const { error } = await supabase.from("ai_cache").delete().eq("id", id).eq("kind", "story");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/story");
  return { ok: true };
}
