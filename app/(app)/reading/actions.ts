"use server";

/**
 * Server actions for the reading mode.
 *
 * Generation routes call out to Claude (via lib/ai/content.ts), which can
 * take ~5–15s. We accept that latency at the action layer rather than going
 * through a streaming endpoint — the UX is "click → loading → redirect" and
 * the user expects a small wait. If we ever want progressive reveal, switch
 * this to a route handler that streams.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateAndStoreReading } from "@/lib/ai/content";

const GenerateReadingInput = z.object({
  topicSlugs: z.array(z.string().min(1).max(80)).max(8).default([]),
  grammarSlug: z.string().min(1).max(120).nullable().optional(),
  level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).nullable().optional(),
});

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function generateReadingAction(
  input: z.infer<typeof GenerateReadingInput>,
): Promise<ActionResult<{ id: string }>> {
  const parsed = GenerateReadingInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "invalid input" };
  }
  try {
    const result = await generateAndStoreReading({
      topicSlugs: parsed.data.topicSlugs,
      grammarSlug: parsed.data.grammarSlug ?? null,
      level: parsed.data.level ?? null,
    });
    revalidatePath("/reading");
    return { ok: true, data: { id: result.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "generation failed" };
  }
}

export async function deleteReadingAction(id: string): Promise<ActionResult> {
  if (!id || typeof id !== "string") return { ok: false, error: "invalid id" };
  const supabase = await createClient();
  const { error } = await supabase.from("ai_cache").delete().eq("id", id).eq("kind", "reading");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/reading");
  return { ok: true };
}
