import Link from "next/link";
import { BookOpen, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GenerateReadingForm } from "./generate-form";

export const metadata = { title: "Reading" };

/**
 * /reading — library of past Claude-generated reading passages, plus a
 * compact "Generate new" form pinned at the top.
 *
 * Storage layer: ai_cache, kind='reading'. Each row is one generation.
 */
export default async function ReadingPage() {
  const supabase = await createClient();
  const [topicsResp, grammarResp, readingsResp, profileResp] = await Promise.all([
    supabase.from("topics").select("name, slug, color").is("deleted_at", null).order("sort_order").order("name"),
    supabase.from("grammar_rules").select("title, slug, category").is("deleted_at", null).order("category").order("title"),
    supabase
      .from("ai_cache")
      .select("id, payload, tokens_used, created_at")
      .eq("kind", "reading")
      .order("created_at", { ascending: false })
      .limit(40),
    supabase.from("profiles").select("estimated_level").maybeSingle(),
  ]);

  const topics = topicsResp.data ?? [];
  const grammarRules = grammarResp.data ?? [];
  const readings = readingsResp.data ?? [];
  const level = profileResp.data?.estimated_level ?? "A2";

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Reading</h1>
        <p className="text-muted-foreground">
          Short Spanish passages tailored to your topics, level, and the words you're learning.
        </p>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" /> Generate a new passage
          </div>
          <GenerateReadingForm
            topics={topics.map((t) => ({ name: t.name, slug: t.slug, color: t.color }))}
            grammarRules={grammarRules.map((g) => ({ title: g.title, slug: g.slug, category: g.category }))}
            defaultLevel={level}
          />
        </CardContent>
      </Card>

      {readings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No readings yet</p>
            <p className="text-sm text-muted-foreground">
              Pick a topic above and generate your first passage.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Your library ({readings.length})
          </h2>
          <ul className="space-y-2">
            {readings.map((r) => {
              const p = r.payload as ReadingPayload;
              const title = p.title_es ?? "Untitled passage";
              const preview = (p.passage_es ?? "").slice(0, 180);
              const meta = p._meta ?? {};
              const topicNames: string[] = Array.isArray(meta.topics) ? meta.topics : [];
              return (
                <li key={r.id}>
                  <Link
                    href={`/reading/${r.id}`}
                    className="block rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30"
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <h3 className="text-base font-semibold tracking-tight" lang="es">
                        {title}
                      </h3>
                      {meta.level && <Badge variant="outline">{meta.level}</Badge>}
                      {topicNames.slice(0, 3).map((n) => (
                        <Badge key={n} variant="secondary">
                          {n}
                        </Badge>
                      ))}
                      {meta.grammar_focus && (
                        <Badge variant="accent">{meta.grammar_focus}</Badge>
                      )}
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground" lang="es">
                      {preview}
                      {(p.passage_es?.length ?? 0) > 180 ? "…" : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

interface ReadingPayload {
  title_es?: string;
  passage_es?: string;
  _meta?: { topics?: string[]; level?: string; grammar_focus?: string | null };
}
