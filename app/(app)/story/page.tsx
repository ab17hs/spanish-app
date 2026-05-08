import Link from "next/link";
import { Sparkles, BookText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GenerateStoryForm } from "./generate-form";

export const metadata = { title: "Stories" };

/**
 * /story — library of past Claude-generated short stories, plus a generation
 * form pinned at the top. Storage: ai_cache, kind='story'.
 */
export default async function StoryPage() {
  const supabase = await createClient();
  const [topicsResp, grammarResp, storiesResp, profileResp] = await Promise.all([
    supabase.from("topics").select("name, slug, color").is("deleted_at", null).order("sort_order").order("name"),
    supabase.from("grammar_rules").select("title, slug, category").is("deleted_at", null).order("category").order("title"),
    supabase
      .from("ai_cache")
      .select("id, payload, tokens_used, created_at")
      .eq("kind", "story")
      .order("created_at", { ascending: false })
      .limit(40),
    supabase.from("profiles").select("estimated_level").maybeSingle(),
  ]);

  const topics = topicsResp.data ?? [];
  const grammarRules = grammarResp.data ?? [];
  const stories = storiesResp.data ?? [];
  const level = profileResp.data?.estimated_level ?? "A2";

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Stories</h1>
        <p className="text-muted-foreground">
          A few paragraphs of fiction with a beginning, middle, and a small twist — calibrated to your level.
        </p>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-accent" /> Generate a new story
          </div>
          <GenerateStoryForm
            topics={topics.map((t) => ({ name: t.name, slug: t.slug, color: t.color }))}
            grammarRules={grammarRules.map((g) => ({ title: g.title, slug: g.slug, category: g.category }))}
            defaultLevel={level}
          />
        </CardContent>
      </Card>

      {stories.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <BookText className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No stories yet</p>
            <p className="text-sm text-muted-foreground">
              Generate your first short story above.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Your library ({stories.length})
          </h2>
          <ul className="space-y-2">
            {stories.map((s) => {
              const p = s.payload as StoryPayload;
              const title = p.title_es ?? "Untitled story";
              const preview = (p.paragraphs_es?.[0] ?? "").slice(0, 200);
              const meta = p._meta ?? {};
              const topicNames: string[] = Array.isArray(meta.topics) ? meta.topics : [];
              return (
                <li key={s.id}>
                  <Link
                    href={`/story/${s.id}`}
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
                      {meta.theme && <Badge variant="default">{meta.theme}</Badge>}
                      {meta.grammar_focus && (
                        <Badge variant="accent">{meta.grammar_focus}</Badge>
                      )}
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground" lang="es">
                      {preview}
                      {(p.paragraphs_es?.[0]?.length ?? 0) > 200 ? "…" : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(s.created_at).toLocaleString(undefined, {
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

interface StoryPayload {
  title_es?: string;
  paragraphs_es?: string[];
  _meta?: {
    topics?: string[];
    level?: string;
    grammar_focus?: string | null;
    theme?: string | null;
  };
}
