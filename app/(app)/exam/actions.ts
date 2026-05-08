"use server";

/**
 * Server actions for the final exam flow.
 *
 * `startExamAction` is a button-press from /exam: it generates a fresh exam,
 * creates the attempt row, and returns the id so the client can navigate.
 *
 * `submitExamAction` accepts the runner's collected answers, grades them
 * via Claude, persists scores, updates the user's level, and returns the
 * id for results redirection.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { startExam, submitExam, type SubmittedAnswers } from "@/lib/exam/orchestrate";

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function startExamAction(): Promise<ActionResult<{ id: string }>> {
  try {
    const r = await startExam();
    revalidatePath("/exam");
    return { ok: true, data: { id: r.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "exam start failed" };
  }
}

const SubmitSchema = z.object({
  id: z.string().uuid(),
  answers: z.object({
    translation: z.array(z.string().max(2000)).max(8),
    conversation: z.array(z.string().max(4000)).max(4),
    grammar: z.array(z.string().max(800)).max(8),
    listening: z.array(z.string().max(2000)).max(8),
  }),
});

export async function submitExamAction(
  input: z.infer<typeof SubmitSchema>,
): Promise<ActionResult<{ id: string }>> {
  const parsed = SubmitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "invalid input" };
  }
  try {
    const r = await submitExam(parsed.data.id, parsed.data.answers as SubmittedAnswers);
    revalidatePath(`/exam/${r.id}`);
    revalidatePath(`/exam/${r.id}/results`);
    revalidatePath("/exam");
    revalidatePath("/dashboard");
    return { ok: true, data: { id: r.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "grading failed" };
  }
}

export async function abandonExamAction(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "invalid id" };
  const supabase = await createClient();
  const { error } = await supabase.from("exam_attempts").delete().eq("id", id).is("completed_at", null);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/exam");
  return { ok: true };
}
