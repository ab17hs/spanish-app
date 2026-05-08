/**
 * Final-exam orchestration.
 *
 * Two server-only entry points:
 *
 *   startExam()   — picks calibrated questions via Claude, writes a new
 *                   exam_attempts row in 'in progress' state (no scores yet),
 *                   and returns the row id so the client can navigate to the
 *                   runner page.
 *
 *   submitExam()  — accepts the user's answers, sends them through Claude
 *                   for grading, persists scores + feedback, and (this is the
 *                   important bit) writes the new estimated CEFR level back
 *                   to profiles. We trust Claude's grade as authoritative.
 *
 * Question generation is moderately expensive (smart model, ~2k tokens) but
 * we don't cache — each exam should be different so the user can retake.
 *
 * The "level" we feed Claude as `priorLevel` comes from profile, with a
 * graceful default for first-time exam-takers.
 */

import { createClient } from "@/lib/supabase/server";
import {
  generateExamQuestions,
  gradeExam,
  type ExamQuestions,
  type ExamGrade,
} from "@/lib/ai/claude";

export interface ExamAttempt {
  id: string;
  questions: ExamQuestions;
  started_at: string;
  completed_at: string | null;
  total_score: number | null;
  cefr_level: string | null;
  cefr_sub: number | null;
}

async function pickPriorLevel(): Promise<string> {
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

async function pickContext(): Promise<{
  topics: string[];
  vocabSamples: string[];
  grammarSamples: string[];
}> {
  const supabase = await createClient();
  const [topicsResp, vocabResp, grammarResp] = await Promise.all([
    supabase.from("topics").select("name").is("deleted_at", null).limit(20),
    supabase.from("vocab_entries").select("lemma").is("deleted_at", null).limit(60),
    supabase.from("grammar_rules").select("title").is("deleted_at", null).limit(20),
  ]);
  return {
    topics: (topicsResp.data ?? []).map((t) => t.name),
    vocabSamples: (vocabResp.data ?? []).map((v) => v.lemma),
    grammarSamples: (grammarResp.data ?? []).map((g) => g.title),
  };
}

export async function startExam(): Promise<{ id: string; questions: ExamQuestions }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  const [priorLevel, ctx] = await Promise.all([pickPriorLevel(), pickContext()]);

  const { data: questions } = await generateExamQuestions({
    level: priorLevel,
    topics: ctx.topics.length > 0 ? ctx.topics : ["everyday life"],
    vocabSamples: ctx.vocabSamples,
    grammarSamples: ctx.grammarSamples,
  });

  const { data: row, error } = await supabase
    .from("exam_attempts")
    .insert({
      user_id: user.id,
      questions,
      // started_at defaults to now()
    })
    .select("id")
    .single();

  if (error || !row) throw new Error(error?.message ?? "exam_attempts insert failed");
  return { id: row.id, questions };
}

export async function getExam(id: string): Promise<ExamAttempt | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exam_attempts")
    .select(
      "id, started_at, completed_at, total_score, cefr_level, cefr_sub, questions",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    questions: data.questions as ExamQuestions,
    started_at: data.started_at,
    completed_at: data.completed_at,
    total_score: data.total_score,
    cefr_level: data.cefr_level,
    cefr_sub: data.cefr_sub,
  };
}

export interface SubmittedAnswers {
  translation: string[];
  conversation: string[];
  grammar: string[];
  listening: string[];
}

export async function submitExam(
  id: string,
  answers: SubmittedAnswers,
): Promise<{ id: string; grade: ExamGrade }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  // Pull questions back so the grading prompt sees both sides.
  const { data: row, error: fetchErr } = await supabase
    .from("exam_attempts")
    .select("questions, completed_at")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !row) throw new Error(fetchErr?.message ?? "exam not found");
  if (row.completed_at) {
    throw new Error("This exam has already been graded.");
  }

  const priorLevel = await pickPriorLevel();
  const { data: grade } = await gradeExam({
    questions: row.questions,
    answers,
    priorLevel,
  });

  // Persist scores + feedback + completion timestamp.
  const { error: updErr } = await supabase
    .from("exam_attempts")
    .update({
      completed_at: new Date().toISOString(),
      translation_score: grade.translation_score,
      conversation_score: grade.conversation_score,
      grammar_score: grade.grammar_score,
      listening_score: grade.listening_score,
      total_score: grade.total_score,
      cefr_level: grade.cefr_level,
      cefr_sub: grade.cefr_sub,
      feedback: grade.feedback,
      answers,
    })
    .eq("id", id);

  if (updErr) throw new Error(updErr.message);

  // Push the new level estimate back to the user's profile so it powers
  // future content generation prompts.
  await supabase
    .from("profiles")
    .update({
      estimated_level: grade.cefr_level,
      estimated_level_sub: grade.cefr_sub,
      last_exam_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  return { id, grade };
}
