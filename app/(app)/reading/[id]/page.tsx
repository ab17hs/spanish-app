import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, Volume2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Reading } from "@/lib/ai/claude";
import { ReadingViewer } from "./reading-viewer";

/**
 * /reading/[id] — view a generated passage with glossary and comprehension.
 *
 * The bulk of the interactivity (hover-to-translate glossary lookups, "show
 * answer" reveal) lives in `ReadingViewer` (client component). Server side,
 * we just fetch the row and pass the structured payload down.
 */

interface ReadingPayload extends Reading {
  _meta?: {
    topics?: string[];
    topic_slugs?: string[];
    level?: string;
    grammar_focus?: string | null;
    grammar_slug?: string | null;
  };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_cache")
    .select("payload")
    .eq("id", id)
    .eq("kind", "reading")
    .maybeSingle();
  const payload = data?.payload as ReadingPayload | undefined;
  return { title: payload?.title_es ?? "Reading" };
}

export default async function ReadingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ai_cache")
    .select("id, payload, tokens_used, created_at")
    .eq("id", id)
    .eq("kind", "reading")
    .maybeSingle();

  if (error || !data) notFound();

  const payload = data.payload as ReadingPayload;
  const meta = payload._meta ?? {};

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 md:px-8">
      <Link
        href="/reading"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All readings
      </Link>

      <div>
        <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5" />
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
          {meta.grammar_focus && <Badge variant="accent">{meta.grammar_focus}</Badge>}
        </div>
      </div>

      <ReadingViewer payload={payload} />

      <p className="text-xs text-muted-foreground">
        <Volume2 className="mr-1 inline h-3 w-3" />
        Click <strong>Speak</strong> to hear the passage in Spanish, or hover any glossary term for the
        translation.
      </p>
    </div>
  );
}
