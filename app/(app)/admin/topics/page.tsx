import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { TopicsManager } from "./topics-manager";

export const metadata = { title: "Topics" };

/**
 * Topics admin. We co-load each topic's vocab + grammar count so the manager
 * can show usage stats inline (handy when deciding to merge or delete).
 */
export default async function TopicsPage() {
  const supabase = await createClient();
  const { data: topics } = await supabase
    .from("topics")
    .select("id, name, slug, description, color, sort_order")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  // For each topic, count linked vocab + grammar. RLS scopes to user.id.
  const counts = new Map<string, { vocab: number; grammar: number }>();
  if (topics?.length) {
    const ids = topics.map((t) => t.id);
    const [vt, gt] = await Promise.all([
      supabase.from("vocab_topics").select("topic_id").in("topic_id", ids),
      supabase.from("grammar_topics").select("topic_id").in("topic_id", ids),
    ]);
    for (const id of ids) counts.set(id, { vocab: 0, grammar: 0 });
    for (const r of vt.data ?? []) {
      const c = counts.get(r.topic_id);
      if (c) c.vocab += 1;
    }
    for (const r of gt.data ?? []) {
      const c = counts.get(r.topic_id);
      if (c) c.grammar += 1;
    }
  }

  const enriched = (topics ?? []).map((t) => ({
    ...t,
    vocab_count: counts.get(t.id)?.vocab ?? 0,
    grammar_count: counts.get(t.id)?.grammar ?? 0,
  }));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/admin"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          aria-label="Back to library"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Topics</h1>
          <p className="text-sm text-muted-foreground">
            Group vocab and grammar for filtering. {enriched.length} topics.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <TopicsManager topics={enriched} />
        </CardContent>
      </Card>
    </div>
  );
}
