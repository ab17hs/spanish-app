import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Pencil, Sparkles, Volume2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { renderMarkdown } from "@/lib/utils/markdown";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SpeakButton } from "./speak-button";

/**
 * /grammar/[slug] — student-facing grammar detail.
 *
 * Renders the rule's markdown explanation, lists every example with a
 * "speak" affordance, and exposes the SRS state of the rule's flashcard so
 * the user can see whether it's due, fresh, or already maturing.
 *
 * The matching admin editor lives at /admin/grammar/[id] — the pencil icon
 * in the header jumps there when the user is the owner (which they always
 * are in this single-tenant app, but the link respects RLS regardless).
 */

type Example = { es: string; en: string; gloss?: string };

const INTERVALS = [0, 1, 3, 7, 21, 60]; // mirrors lib/srs constants

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("grammar_rules")
    .select("title")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  return { title: data?.title ?? "Grammar rule" };
}

export default async function GrammarDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: rule, error } = await supabase
    .from("grammar_rules")
    .select("id, title, slug, category, level, difficulty, explanation_md, examples, updated_at")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !rule) notFound();

  // Topics + SRS state, in parallel.
  const [topicsResp, srsResp, prevNextResp] = await Promise.all([
    supabase
      .from("grammar_topics")
      .select("topic_id, topics(id, name, slug, color)")
      .eq("grammar_id", rule.id),
    supabase
      .from("srs_state")
      .select(
        `card_id, due_at, interval_idx, total_reviews, hits, misses,
         flashcards!inner(kind, grammar_id)`,
      )
      .eq("flashcards.kind", "grammar")
      .eq("flashcards.grammar_id", rule.id)
      .maybeSingle(),
    supabase
      .from("grammar_rules")
      .select("title, slug, category")
      .is("deleted_at", null)
      .eq("category", rule.category)
      .order("title"),
  ]);

  type Topic = { id: string; name: string; slug: string; color: string | null };
  const topics =
    (topicsResp.data ?? [])
      .map((r: { topics: Topic | Topic[] | null }) => (Array.isArray(r.topics) ? r.topics[0] : r.topics))
      .filter((t): t is Topic => Boolean(t));

  type SrsRow = {
    card_id: string;
    due_at: string;
    interval_idx: number;
    total_reviews: number;
    hits: number;
    misses: number;
  };
  const srs = (srsResp.data as unknown as SrsRow | null) ?? null;
  const now = Date.now();
  const due = srs ? new Date(srs.due_at).getTime() <= now : false;
  const fresh = !srs || srs.total_reviews === 0;
  const intervalDays = srs ? INTERVALS[Math.min(srs.interval_idx, INTERVALS.length - 1)] : 0;
  const accuracy =
    srs && srs.total_reviews > 0
      ? Math.round((srs.hits / Math.max(1, srs.hits + srs.misses)) * 100)
      : null;

  // Sibling rules in the same category for prev/next nav.
  const siblings = (prevNextResp.data ?? []) as { title: string; slug: string; category: string }[];
  const idx = siblings.findIndex((s) => s.slug === rule.slug);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  const examples: Example[] = Array.isArray(rule.examples)
    ? (rule.examples as Example[])
    : [];

  const html = renderMarkdown(rule.explanation_md ?? "");

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8">
      {/* Breadcrumb / back */}
      <Link
        href="/grammar"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All grammar
      </Link>

      {/* Title + meta */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {rule.category}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{rule.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {rule.level && <Badge variant="outline">{rule.level}</Badge>}
            {rule.difficulty && (
              <Badge
                variant={
                  rule.difficulty === "easy"
                    ? "success"
                    : rule.difficulty === "hard"
                    ? "warning"
                    : "secondary"
                }
              >
                {rule.difficulty}
              </Badge>
            )}
            {fresh ? (
              <Badge variant="accent">new — never studied</Badge>
            ) : due ? (
              <Badge variant="warning">due for review</Badge>
            ) : (
              <Badge variant="success">in rotation · {intervalDays}d interval</Badge>
            )}
            {topics.map((t) => (
              <Badge key={t.id} variant="default">
                <span
                  className="mr-1 inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: t.color ?? "currentColor" }}
                />
                {t.name}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            href={`/study?kind=grammar`}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Sparkles className="h-4 w-4" /> Drill grammar
          </Link>
          <Link
            href={`/admin/grammar/${rule.id}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-muted"
            aria-label="Edit rule"
            title="Edit rule"
          >
            <Pencil className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* SRS strip */}
      {srs && srs.total_reviews > 0 && (
        <div className="mb-5 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">{srs.total_reviews}</span> reviews
            </span>
            {accuracy !== null && (
              <span>
                <span
                  className={
                    accuracy >= 85
                      ? "font-medium text-success"
                      : accuracy >= 60
                      ? "font-medium text-foreground"
                      : "font-medium text-warning-foreground"
                  }
                >
                  {accuracy}%
                </span>{" "}
                accuracy
              </span>
            )}
            <span>
              next due{" "}
              <span className="font-medium text-foreground">
                {new Date(srs.due_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* Explanation */}
      <Card className="mb-5">
        <CardContent className="px-6 py-5">
          {html ? (
            <div
              className="prose-sm space-y-3 text-sm leading-relaxed text-foreground [&_a]:text-primary [&_h2]:mt-5 [&_h3]:mt-4"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No explanation provided yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Examples */}
      {examples.length > 0 && (
        <Card className="mb-5">
          <CardContent className="px-6 py-5">
            <h2 className="mb-3 text-base font-semibold tracking-tight">
              Examples{" "}
              <span className="font-normal text-muted-foreground">({examples.length})</span>
            </h2>
            <ul className="divide-y">
              {examples.map((ex, i) => (
                <li key={i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <SpeakButton text={ex.es} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground" lang="es">
                      {ex.es}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground" lang="en">
                      {ex.en}
                    </p>
                    {ex.gloss && (
                      <p className="mt-1 text-xs italic text-muted-foreground">{ex.gloss}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Prev / next nav within the same category */}
      {(prev || next) && (
        <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
          {prev ? (
            <Link
              href={`/grammar/${prev.slug}`}
              className="group flex items-center gap-3 rounded-lg border bg-card px-4 py-3 hover:bg-muted/30"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Previous</p>
                <p className="truncate font-medium">{prev.title}</p>
              </div>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/grammar/${next.slug}`}
              className="group flex items-center justify-end gap-3 rounded-lg border bg-card px-4 py-3 text-right hover:bg-muted/30"
            >
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Next</p>
                <p className="truncate font-medium">{next.title}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}

      {/* Footer hint — link icon used to satisfy import */}
      <p className="mt-6 text-xs text-muted-foreground">
        <Volume2 className="mr-1 inline h-3 w-3" />
        Tap the speaker on any example to hear it spoken in Spanish.
      </p>
    </div>
  );
}
