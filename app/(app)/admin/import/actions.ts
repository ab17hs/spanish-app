"use server";

/**
 * Server action wrapping `commitImport`. Called by the review screen once the
 * user has accepted (or edited) the parsed candidates. Validates the payload
 * with zod before touching the database, then delegates to the commit helper.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { commitImport, type CommitResult } from "@/lib/import/commit";

const PosEnum = z.enum([
  "verb",
  "noun",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "interjection",
  "phrase",
  "number",
  "article",
]);

const VocabSchema = z.object({
  lemma: z.string().min(1).max(200),
  translation: z.string().min(1).max(500),
  pos: PosEnum,
  example_es: z.string().max(500).optional(),
  example_en: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  topic_slug: z.string().min(1).max(64),
  topic_name: z.string().min(1).max(80),
  is_irregular: z.boolean().optional(),
});

const GrammarSchema = z.object({
  title: z.string().min(1).max(200),
  category: z.string().min(1).max(80),
  explanation_md: z.string().max(8000),
  examples: z.array(z.object({ es: z.string(), en: z.string() })).max(50),
  topic_slug: z.string().min(1).max(64),
  topic_name: z.string().min(1).max(80),
});

const TopicSchema = z.object({
  slug: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
});

const CommitSchema = z.object({
  filename: z.string().min(1).max(200),
  vocab: z.array(VocabSchema).max(5000),
  grammar: z.array(GrammarSchema).max(500),
  topics: z.array(TopicSchema).max(200),
});

export type CommitActionResult =
  | { ok: true; result: CommitResult }
  | { ok: false; error: string; issues?: string[] };

export async function commitImportAction(input: unknown): Promise<CommitActionResult> {
  const parsed = CommitSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation_failed",
      issues: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }

  try {
    const result = await commitImport(parsed.data);
    revalidatePath("/admin");
    revalidatePath("/admin/import");
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "commit_failed" };
  }
}
