import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Award, Trophy, ThumbsUp, AlertCircle, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export const metadata = { title: "Exam results" };

interface FeedbackSection {
  section: string;
  strengths?: string[];
  improvements?: string[];
}

/**
 * /exam/[id]/results — read-only view of a completed exam attempt. Shows
 * the per-section scores, the AI's strengths/improvements feedback, and a
 * "retake" CTA.
 *
 * If someone hits this URL for an in-progress attempt, we 404 — the runner
 * is the right destination there.
 */
export default async function ExamResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exam_attempts")
    .select(
      `id, started_at, completed_at,
       translation_score, conversation_score, grammar_score, listening_score, total_score,
       cefr_level, cefr_sub, feedback`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data || !data.completed_at) notFound();

  const feedback = (Array.isArray(data.feedback) ? data.feedback : []) as FeedbackSection[];
  const sections: { key: string; label: string; score: number | null }[] = [
    { key: "translation", label: "Translation", score: numOrNull(data.translation_score) },
    { key: "conversation", label: "Conversation", score: numOrNull(data.conversation_score) },
    { key: "grammar", label: "Grammar", score: numOrNull(data.grammar_score) },
    { key: "listening", label: "Listening", score: numOrNull(data.listening_score) },
  ];
  const total = numOrNull(data.total_score);
  const tone = total != null ? scoreTone(total) : "muted";

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8">
      <Link
        href="/exam"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All exams
      </Link>

      {/* Headline result */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-lg">Your result</CardTitle>
            <CardDescription>
              Completed{" "}
              {new Date(data.completed_at).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">CEFR</p>
              <p className="text-3xl font-semibold tracking-tight">
                {data.cefr_level}
                {data.cefr_sub != null ? <span className="text-base text-muted-foreground">.{data.cefr_sub}</span> : null}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
              <p
                className={[
                  "text-3xl font-semibold tracking-tight",
                  tone === "good" && "text-success",
                  tone === "warn" && "text-warning-foreground",
                  tone === "bad" && "text-destructive",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {total != null ? Math.round(total) : "—"}
                <span className="ml-0.5 text-base text-muted-foreground">/100</span>
              </p>
            </div>
            {tone === "good" && <Trophy className="h-9 w-9 text-success" />}
            {tone === "warn" && <Award className="h-9 w-9 text-warning-foreground" />}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {sections.map((s) => (
            <div key={s.key} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{s.label}</span>
                <span className="text-muted-foreground">
                  {s.score != null ? `${Math.round(s.score)}/100` : "—"}
                </span>
              </div>
              <Progress value={s.score ?? 0} />
            </div>
          ))}
          <div className="pt-2">
            <Link
              href="/exam"
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Retake later
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Per-section feedback */}
      {feedback.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Feedback by section
          </h2>
          {feedback.map((f, i) => (
            <Card key={i}>
              <CardContent className="space-y-3 px-6 py-5">
                <div className="flex items-center gap-2">
                  <Badge variant="default">{f.section}</Badge>
                </div>
                {f.strengths && f.strengths.length > 0 && (
                  <FeedbackList
                    title="Strengths"
                    icon={<ThumbsUp className="h-3.5 w-3.5 text-success" />}
                    items={f.strengths}
                    tone="good"
                  />
                )}
                {f.improvements && f.improvements.length > 0 && (
                  <FeedbackList
                    title="Improvements"
                    icon={<AlertCircle className="h-3.5 w-3.5 text-warning-foreground" />}
                    items={f.improvements}
                    tone="warn"
                  />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function FeedbackList({
  title,
  icon,
  items,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
  tone: "good" | "warn";
}) {
  return (
    <div>
      <p className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon} {title}
      </p>
      <ul className="space-y-1.5 text-sm">
        {items.map((s, i) => (
          <li
            key={i}
            className={[
              "rounded-md px-3 py-2",
              tone === "good" && "border border-success/40 bg-success/5",
              tone === "warn" && "border border-warning/40 bg-warning/5",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function scoreTone(n: number): "good" | "warn" | "bad" | "muted" {
  if (n >= 80) return "good";
  if (n >= 60) return "warn";
  if (n >= 1) return "bad";
  return "muted";
}
