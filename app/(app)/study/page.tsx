import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { buildStudyQueue } from "@/lib/srs/queue";
import { Card, CardContent } from "@/components/ui/card";
import { StudySession } from "./study-session";
import { TopicPicker } from "./topic-picker";
import type { CardKind } from "@/types/database";

export const metadata = { title: "Study" };

interface SearchParams {
  kind?: CardKind | "all";
  topic?: string;
  limit?: string;
}

/**
 * Server-side: build the queue for this user, hand it down. The client
 * component drives the actual session (timer, animations, grading).
 */
export default async function StudyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const kind = (sp.kind as CardKind | "all" | undefined) ?? "all";
  const topicSlug = sp.topic?.trim() || undefined;
  const limit = sp.limit ? Math.max(5, Math.min(80, parseInt(sp.limit, 10))) : 30;

  const supabase = await createClient();
  const [queue, topicsResp] = await Promise.all([
    buildStudyQueue({ kind, topicSlug, limit }),
    supabase.from("topics").select("name, slug").is("deleted_at", null).order("name"),
  ]);

  if (queue.length === 0) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-success/10">
          <GraduationCap className="h-7 w-7 text-success" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">All caught up!</h1>
        <p className="mt-2 text-muted-foreground">
          No cards are due right now. Either you've crushed today's reviews, or your
          library is empty.
        </p>
        <div className="mt-6 flex gap-2">
          <Link
            href="/admin/import"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Import vocab
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-8">
      <div className="mb-4">
        <SessionFilters
          activeKind={kind}
          activeTopic={topicSlug}
          topics={topicsResp.data ?? []}
        />
      </div>
      <Card className="overflow-visible">
        <CardContent className="p-0">
          <StudySession queue={queue} />
        </CardContent>
      </Card>
    </div>
  );
}

function SessionFilters({
  activeKind,
  activeTopic,
  topics,
}: {
  activeKind: CardKind | "all";
  activeTopic: string | undefined;
  topics: { name: string; slug: string }[];
}) {
  const kinds: { v: CardKind | "all"; label: string }[] = [
    { v: "all", label: "All" },
    { v: "vocab_es_en", label: "ES → EN" },
    { v: "vocab_en_es", label: "EN → ES" },
    { v: "grammar", label: "Grammar" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Mode:</span>
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {kinds.map((k) => {
          const params = new URLSearchParams();
          if (k.v !== "all") params.set("kind", k.v);
          if (activeTopic) params.set("topic", activeTopic);
          return (
            <Link
              key={k.v}
              href={`/study${params.toString() ? `?${params}` : ""}`}
              className={`rounded-md px-3 py-1 transition-all ${
                activeKind === k.v ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {k.label}
            </Link>
          );
        })}
      </div>
      {topics.length > 0 && (
        <TopicPicker activeKind={activeKind} activeTopic={activeTopic} topics={topics} />
      )}
    </div>
  );
}
