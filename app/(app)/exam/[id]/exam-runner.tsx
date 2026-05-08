"use client";

/**
 * Exam runner — multi-section form with per-section progress.
 *
 * Layout: a sidebar of sections (Translation/Conversation/Grammar/Listening),
 * one section visible at a time. Each section keeps its own answer array in
 * local state; on final submit we send the whole bundle to Claude for
 * grading.
 *
 * Listening: the script is rendered as a "play" button only — the user is
 * supposed to listen, not read. We use the Web Speech API for TTS so we
 * don't need any audio files. (Yes, browser TTS Spanish is mediocre. It's
 * OK for self-calibration.)
 *
 * Persistence: we don't auto-save individual answers between page loads.
 * The whole flow is meant to be one sitting.
 */

import { useState, useTransition, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Volume2, Loader2, ArrowRight, ArrowLeft, Send, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import type { ExamQuestions } from "@/lib/ai/claude";
import { submitExamAction } from "../actions";

type SectionKey = "translation" | "conversation" | "grammar" | "listening";

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "translation", label: "Translation" },
  { key: "conversation", label: "Conversation" },
  { key: "grammar", label: "Grammar" },
  { key: "listening", label: "Listening" },
];

interface Props {
  id: string;
  questions: ExamQuestions;
}

export function ExamRunner({ id, questions }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [section, setSection] = useState<SectionKey>("translation");
  const [translation, setTranslation] = useState<string[]>(
    () => Array(questions.translation.length).fill(""),
  );
  const [conversation, setConversation] = useState<string[]>(
    () => Array(questions.conversation.length).fill(""),
  );
  const [grammar, setGrammar] = useState<string[]>(
    () => Array(questions.grammar.length).fill(""),
  );
  const [listening, setListening] = useState<string[]>(
    () => Array(questions.listening.length).fill(""),
  );

  const idx = SECTIONS.findIndex((s) => s.key === section);
  const isLast = idx === SECTIONS.length - 1;
  const isFirst = idx === 0;

  // Section completion percentages for the sidebar.
  const completion = useMemo(() => {
    const f = (arr: string[]) =>
      arr.length === 0 ? 100 : Math.round((arr.filter((x) => x.trim().length > 0).length / arr.length) * 100);
    return {
      translation: f(translation),
      conversation: f(conversation),
      grammar: f(grammar),
      listening: f(listening),
    };
  }, [translation, conversation, grammar, listening]);

  const overallPct = Math.round(
    (completion.translation + completion.conversation + completion.grammar + completion.listening) / 4,
  );

  const submit = useCallback(() => {
    startTransition(async () => {
      const r = await submitExamAction({
        id,
        answers: { translation, conversation, grammar, listening },
      });
      if (!r.ok) {
        toast({ title: "Grading failed", description: r.error, variant: "destructive" });
        return;
      }
      if (r.data?.id) router.push(`/exam/${r.data.id}/results`);
    });
  }, [id, translation, conversation, grammar, listening, router, toast]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Final exam</h1>
        <p className="text-sm text-muted-foreground">
          Answer in Spanish where appropriate. Move between sections at any time. Submit when ready.
        </p>
      </div>

      {/* Overall progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Overall progress</span>
          <span>{overallPct}%</span>
        </div>
        <Progress value={overallPct} />
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[180px_1fr]">
        {/* Section nav */}
        <nav className="flex flex-row flex-wrap gap-2 md:flex-col md:gap-1">
          {SECTIONS.map((s) => {
            const on = s.key === section;
            const pct = completion[s.key];
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSection(s.key)}
                className={[
                  "flex w-full flex-col rounded-md border px-3 py-2 text-left transition-colors",
                  on ? "border-primary bg-primary/5" : "hover:bg-muted/30",
                ].join(" ")}
              >
                <span className="flex items-center justify-between text-sm font-medium">
                  {s.label}
                  <span className="text-xs text-muted-foreground">{pct}%</span>
                </span>
                <Progress value={pct} className="mt-1.5 h-1.5" />
              </button>
            );
          })}
        </nav>

        {/* Section content */}
        <div className="space-y-4">
          {section === "translation" && (
            <TranslationSection
              items={questions.translation}
              answers={translation}
              setAnswers={setTranslation}
            />
          )}
          {section === "conversation" && (
            <ConversationSection
              items={questions.conversation}
              answers={conversation}
              setAnswers={setConversation}
            />
          )}
          {section === "grammar" && (
            <GrammarSection
              items={questions.grammar}
              answers={grammar}
              setAnswers={setGrammar}
            />
          )}
          {section === "listening" && (
            <ListeningSection
              items={questions.listening}
              answers={listening}
              setAnswers={setListening}
            />
          )}

          {/* Section nav buttons */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              type="button"
              disabled={isFirst}
              onClick={() => setSection(SECTIONS[idx - 1].key)}
            >
              <ArrowLeft className="mr-1 h-4 w-4" /> Previous
            </Button>
            {isLast ? (
              <Button onClick={submit} disabled={pending}>
                {pending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Grading…
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" /> Submit for grading
                  </>
                )}
              </Button>
            ) : (
              <Button type="button" onClick={() => setSection(SECTIONS[idx + 1].key)}>
                Next <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function TranslationSection({
  items,
  answers,
  setAnswers,
}: {
  items: ExamQuestions["translation"];
  answers: string[];
  setAnswers: (a: string[]) => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 px-6 py-5">
        <SectionHeader
          title="Translation"
          subtitle="Translate each line in the indicated direction."
        />
        {items.map((q, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {q.direction === "en_to_es" ? "EN → ES" : "ES → EN"}
              </Badge>
              <p className="text-sm font-medium" lang={q.direction === "en_to_es" ? "en" : "es"}>
                {q.prompt}
              </p>
            </div>
            <textarea
              value={answers[i] ?? ""}
              onChange={(e) => {
                const c = [...answers];
                c[i] = e.target.value;
                setAnswers(c);
              }}
              rows={2}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={q.direction === "en_to_es" ? "Tu traducción al español…" : "Your English translation…"}
              lang={q.direction === "en_to_es" ? "es" : "en"}
              maxLength={2000}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ConversationSection({
  items,
  answers,
  setAnswers,
}: {
  items: ExamQuestions["conversation"];
  answers: string[];
  setAnswers: (a: string[]) => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-5 px-6 py-5">
        <SectionHeader
          title="Conversation"
          subtitle="Reply in Spanish to each scenario as if you were chatting."
        />
        {items.map((q, i) => (
          <div key={i} className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Scenario {i + 1}
            </p>
            <p className="text-sm" lang="en">{q.scenario_en}</p>
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm" lang="es">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Them:
              </span>{" "}
              {q.first_message_es}
            </div>
            <textarea
              value={answers[i] ?? ""}
              onChange={(e) => {
                const c = [...answers];
                c[i] = e.target.value;
                setAnswers(c);
              }}
              rows={4}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Tu respuesta en español…"
              lang="es"
              maxLength={4000}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function GrammarSection({
  items,
  answers,
  setAnswers,
}: {
  items: ExamQuestions["grammar"];
  answers: string[];
  setAnswers: (a: string[]) => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 px-6 py-5">
        <SectionHeader
          title="Grammar"
          subtitle="Apply the indicated rule to each prompt."
        />
        {items.map((q, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{q.rule}</Badge>
            </div>
            <p className="text-sm font-medium" lang="es">{q.prompt}</p>
            <input
              type="text"
              value={answers[i] ?? ""}
              onChange={(e) => {
                const c = [...answers];
                c[i] = e.target.value;
                setAnswers(c);
              }}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Tu respuesta…"
              lang="es"
              maxLength={800}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ListeningSection({
  items,
  answers,
  setAnswers,
}: {
  items: ExamQuestions["listening"];
  answers: string[];
  setAnswers: (a: string[]) => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-5 px-6 py-5">
        <SectionHeader
          title="Listening"
          subtitle="Press play, listen to the Spanish audio, then complete the task in English."
        />
        {items.map((q, i) => (
          <ListeningItem
            key={i}
            audio={q.audio_text_es}
            task={q.task_en}
            value={answers[i] ?? ""}
            onChange={(v) => {
              const c = [...answers];
              c[i] = v;
              setAnswers(c);
            }}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function ListeningItem({
  audio,
  task,
  value,
  onChange,
}: {
  audio: string;
  task: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [showScript, setShowScript] = useState(false);
  const speak = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(audio);
    u.lang = "es-ES";
    u.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [audio]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={speak}>
          <Volume2 className="mr-1.5 h-3.5 w-3.5" /> Play audio
        </Button>
        <button
          type="button"
          onClick={() => setShowScript((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {showScript ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          {showScript ? "Hide script" : "Show script"}
        </button>
      </div>
      {showScript && (
        <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm italic" lang="es">
          {audio}
        </p>
      )}
      <p className="text-sm" lang="en">
        <span className="font-medium">Task: </span>
        {task}
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        placeholder="Your answer in English…"
        lang="en"
        maxLength={2000}
      />
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}
