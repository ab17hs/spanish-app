import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookText, Volume2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import type { Story } from "@/lib/ai/claude";
import { StoryViewer } from "./story-viewer";

interface StoryPayload extends Story {
  _meta?: {
    topics?: string[];
    level?: string;
    grammar_focus?: string | null;
    theme?: string | null;
  };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_cache")
    .select("payload")
    .eq("id", id)
    .eq("kind", "story")
    .maybeSingle();
  const payload = data?.payload as StoryPayload | undefined;
  return { title: payload?.title_es ?? "Story" };
}

export default async function StoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ai_cache")
    .select("id, payload, tokens_used, created_at")
    .eq("id", id)
    .eq("kind", "story")
    .maybeSingle();

  if (error || !data) notFound();

  const payload = data.payload as StoryPayload;
  const meta = payload._meta ?? {};

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 md:px-8">
      <Link
        href="/story"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All stories
      </Link>

      <div>
        <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <BookText className="h-3.5 w-3.5" />
          Generated {new Date(data.created_at).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight" lang="es">
          {payload.title_es}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {meta.level && <Badge variant="outline">{meta.level}</Badge>}
          {(meta.topics ?? []).map((t) => (
            <Badge key={t} variant="secondary">
              {t}
            </Badge>
          ))}
          {meta.theme && <Badge variant="default">{meta.theme}</Badge>}
          {meta.grammar_focus && <Badge variant="accent">{meta.grammar_focus}</Badge>}
        </div>
      </div>

      <StoryViewer payload={payload} />

      <p className="text-xs text-muted-foreground">
        <Volume2 className="mr-1 inline h-3 w-3" />
        Tap any paragraph's speaker icon to hear it read aloud, or hover glossary terms for translations.
      </p>
    </div>
  );
}
