import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export const MODELS = {
  fast: "claude-haiku-4-5-20251001",
  smart: "claude-sonnet-4-6",
} as const;

/**
 * Call Claude with tool_use forced output → guaranteed JSON.
 * Caller passes a Zod schema; we parse Claude's tool_use block against it.
 */
export async function callStructured<T>(opts: {
  model: keyof typeof MODELS;
  system: string;
  userPrompt: string;
  schema: z.ZodSchema<T>;
  toolName: string;
  toolDescription: string;
  inputSchema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<{ data: T; tokens: number }> {
  const response = await anthropic.messages.create({
    model: MODELS[opts.model],
    max_tokens: opts.maxTokens ?? 2048,
    system: opts.system,
    tools: [
      {
        name: opts.toolName,
        description: opts.toolDescription,
        input_schema: opts.inputSchema as never,
      },
    ],
    tool_choice: { type: "tool", name: opts.toolName },
    messages: [{ role: "user", content: opts.userPrompt }],
  });

  const block = response.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("Claude did not return tool_use block");
  }

  const parsed = opts.schema.safeParse(block.input);
  if (!parsed.success) {
    throw new Error(`Claude output failed schema validation: ${parsed.error.message}`);
  }
  const tokens = response.usage.input_tokens + response.usage.output_tokens;
  return { data: parsed.data, tokens };
}

// ---------------------------------------------------------------------------
// Reading passage generator
// ---------------------------------------------------------------------------
export const ReadingSchema = z.object({
  title_es: z.string(),
  passage_es: z.string(),
  glossary: z.array(z.object({ es: z.string(), en: z.string() })),
  comprehension: z.array(
    z.object({
      question_en: z.string(),
      answer_en: z.string(),
    }),
  ),
});

export type Reading = z.infer<typeof ReadingSchema>;

export async function generateReading(opts: {
  topics: string[];
  vocabHints: string[];
  level: string;
  grammarFocus?: string;
}): Promise<{ data: Reading; tokens: number }> {
  return callStructured({
    model: "fast",
    system: `You are a Spanish language tutor producing reading practice. Write at CEFR level ${opts.level}. Use simple, vivid sentences. Recycle vocabulary the learner has already studied.`,
    userPrompt: `Topics: ${opts.topics.join(", ")}.
Vocabulary the student is learning (use as many as natural): ${opts.vocabHints.slice(0, 30).join(", ")}.
${opts.grammarFocus ? `Grammar focus: ${opts.grammarFocus}.` : ""}

Produce a 4-6 sentence Spanish passage with a 5-item glossary (Spanish→English) of the trickiest words used, and 2 short English comprehension questions with English answers.`,
    schema: ReadingSchema,
    toolName: "submit_reading",
    toolDescription: "Submit a Spanish reading passage with glossary and comprehension questions.",
    inputSchema: {
      type: "object",
      required: ["title_es", "passage_es", "glossary", "comprehension"],
      properties: {
        title_es: { type: "string" },
        passage_es: { type: "string", description: "4-6 sentence Spanish passage." },
        glossary: {
          type: "array",
          items: {
            type: "object",
            required: ["es", "en"],
            properties: { es: { type: "string" }, en: { type: "string" } },
          },
          minItems: 3,
          maxItems: 8,
        },
        comprehension: {
          type: "array",
          items: {
            type: "object",
            required: ["question_en", "answer_en"],
            properties: { question_en: { type: "string" }, answer_en: { type: "string" } },
          },
          minItems: 2,
          maxItems: 3,
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Story generator (longer, more narrative)
// ---------------------------------------------------------------------------
export const StorySchema = z.object({
  title_es: z.string(),
  paragraphs_es: z.array(z.string()).min(2).max(4),
  glossary: z.array(z.object({ es: z.string(), en: z.string() })),
  comprehension: z.array(
    z.object({
      question_en: z.string(),
      answer_en: z.string(),
    }),
  ),
});

export type Story = z.infer<typeof StorySchema>;

export async function generateStory(opts: {
  topics: string[];
  vocabHints: string[];
  level: string;
  grammarFocus?: string;
  theme?: string;
}): Promise<{ data: Story; tokens: number }> {
  return callStructured({
    model: "fast",
    system: `You are a Spanish language tutor writing short engaging stories at CEFR level ${opts.level}. Stories should have a beginning, middle, and a small twist or warmth at the end.`,
    userPrompt: `Topics: ${opts.topics.join(", ")}.
${opts.theme ? `Theme: ${opts.theme}.` : ""}
Vocabulary to weave in (don't force): ${opts.vocabHints.slice(0, 40).join(", ")}.
${opts.grammarFocus ? `Grammar focus: ${opts.grammarFocus}.` : ""}

Write 2-4 short Spanish paragraphs (3-5 sentences each), with an 8-item glossary of trickier words and 3 English comprehension questions+answers.`,
    schema: StorySchema,
    toolName: "submit_story",
    toolDescription: "Submit a Spanish short story with glossary and comprehension.",
    maxTokens: 3072,
    inputSchema: {
      type: "object",
      required: ["title_es", "paragraphs_es", "glossary", "comprehension"],
      properties: {
        title_es: { type: "string" },
        paragraphs_es: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
        glossary: {
          type: "array",
          items: {
            type: "object",
            required: ["es", "en"],
            properties: { es: { type: "string" }, en: { type: "string" } },
          },
          minItems: 5,
          maxItems: 10,
        },
        comprehension: {
          type: "array",
          items: {
            type: "object",
            required: ["question_en", "answer_en"],
            properties: { question_en: { type: "string" }, answer_en: { type: "string" } },
          },
          minItems: 2,
          maxItems: 4,
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Exam grading
// ---------------------------------------------------------------------------
export const ExamGradeSchema = z.object({
  translation_score: z.number().min(0).max(100),
  conversation_score: z.number().min(0).max(100),
  grammar_score: z.number().min(0).max(100),
  listening_score: z.number().min(0).max(100),
  total_score: z.number().min(0).max(100),
  cefr_level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
  cefr_sub: z.number().min(0).max(0.9),
  feedback: z.array(
    z.object({
      section: z.string(),
      strengths: z.array(z.string()),
      improvements: z.array(z.string()),
    }),
  ),
});

export type ExamGrade = z.infer<typeof ExamGradeSchema>;

export async function gradeExam(payload: {
  questions: unknown;
  answers: unknown;
  priorLevel: string | null;
}): Promise<{ data: ExamGrade; tokens: number }> {
  return callStructured({
    model: "smart",
    system: `You are an experienced CEFR examiner for Spanish. Grade the student's exam against the rubric. Be calibrated, not lenient. Account for typos and minor accent errors but penalize gender/conjugation/syntax mistakes.`,
    userPrompt: `Prior estimated level: ${payload.priorLevel ?? "unknown"}.

Questions and answers:
${JSON.stringify({ questions: payload.questions, answers: payload.answers }, null, 2)}

Score each section 0-100, then give an overall CEFR level (A1-C2) with a sub-decimal (0.0-0.9) representing position within that level. Provide section-level feedback.`,
    schema: ExamGradeSchema,
    toolName: "submit_grade",
    toolDescription: "Return structured exam grading with per-section scores and CEFR estimate.",
    maxTokens: 2048,
    inputSchema: {
      type: "object",
      required: ["translation_score", "conversation_score", "grammar_score", "listening_score", "total_score", "cefr_level", "cefr_sub", "feedback"],
      properties: {
        translation_score: { type: "number", minimum: 0, maximum: 100 },
        conversation_score: { type: "number", minimum: 0, maximum: 100 },
        grammar_score: { type: "number", minimum: 0, maximum: 100 },
        listening_score: { type: "number", minimum: 0, maximum: 100 },
        total_score: { type: "number", minimum: 0, maximum: 100 },
        cefr_level: { type: "string", enum: ["A1", "A2", "B1", "B2", "C1", "C2"] },
        cefr_sub: { type: "number", minimum: 0, maximum: 0.9 },
        feedback: {
          type: "array",
          items: {
            type: "object",
            required: ["section", "strengths", "improvements"],
            properties: {
              section: { type: "string" },
              strengths: { type: "array", items: { type: "string" } },
              improvements: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Exam question generation
// ---------------------------------------------------------------------------
export const ExamQuestionsSchema = z.object({
  translation: z.array(
    z.object({
      direction: z.enum(["en_to_es", "es_to_en"]),
      prompt: z.string(),
      reference_answer: z.string(),
    }),
  ),
  conversation: z.array(
    z.object({
      scenario_en: z.string(),
      first_message_es: z.string(),
    }),
  ),
  grammar: z.array(
    z.object({
      rule: z.string(),
      prompt: z.string(),
      expected: z.string(),
    }),
  ),
  listening: z.array(
    z.object({
      audio_text_es: z.string(),
      task_en: z.string(),
      expected_en: z.string(),
    }),
  ),
});

export type ExamQuestions = z.infer<typeof ExamQuestionsSchema>;

export async function generateExamQuestions(opts: {
  level: string;
  topics: string[];
  vocabSamples: string[];
  grammarSamples: string[];
}): Promise<{ data: ExamQuestions; tokens: number }> {
  return callStructured({
    model: "smart",
    system: `You generate calibrated CEFR Spanish exams. Target a calibrated level near ${opts.level}: items should span one level below to one above so we can measure precisely.`,
    userPrompt: `Build a 4-section exam:
1) Translation: 4 items (mix EN→ES and ES→EN).
2) Conversation: 2 scenarios with an opening Spanish message from the AI.
3) Grammar application: 3 fill-in / transform prompts.
4) Listening: 2 short Spanish audio scripts (we'll TTS them) with English comprehension tasks.

Topics in scope: ${opts.topics.join(", ")}.
Vocabulary touchstones: ${opts.vocabSamples.slice(0, 15).join(", ")}.
Grammar topics covered: ${opts.grammarSamples.slice(0, 10).join(", ")}.`,
    schema: ExamQuestionsSchema,
    toolName: "submit_exam",
    toolDescription: "Submit the structured CEFR exam.",
    maxTokens: 2048,
    inputSchema: {
      type: "object",
      required: ["translation", "conversation", "grammar", "listening"],
      properties: {
        translation: {
          type: "array",
          minItems: 4,
          maxItems: 4,
          items: {
            type: "object",
            required: ["direction", "prompt", "reference_answer"],
            properties: {
              direction: { type: "string", enum: ["en_to_es", "es_to_en"] },
              prompt: { type: "string" },
              reference_answer: { type: "string" },
            },
          },
        },
        conversation: {
          type: "array",
          minItems: 2,
          maxItems: 2,
          items: {
            type: "object",
            required: ["scenario_en", "first_message_es"],
            properties: {
              scenario_en: { type: "string" },
              first_message_es: { type: "string" },
            },
          },
        },
        grammar: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            required: ["rule", "prompt", "expected"],
            properties: {
              rule: { type: "string" },
              prompt: { type: "string" },
              expected: { type: "string" },
            },
          },
        },
        listening: {
          type: "array",
          minItems: 2,
          maxItems: 2,
          items: {
            type: "object",
            required: ["audio_text_es", "task_en", "expected_en"],
            properties: {
              audio_text_es: { type: "string" },
              task_en: { type: "string" },
              expected_en: { type: "string" },
            },
          },
        },
      },
    },
  });
}

export async function cacheKey(parts: (string | string[] | undefined)[]): Promise<string> {
  const norm = parts
    .map((p) => (Array.isArray(p) ? [...p].sort().join("|") : (p ?? "")))
    .join("::");
  const buf = new TextEncoder().encode(norm);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
