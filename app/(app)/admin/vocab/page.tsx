import Link from "next/link";
import { Plus, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { VocabFilters } from "./vocab-filters";
import { VocabTable } from "./vocab-table";
import { VocabPagination } from "./vocab-pagination";

export const metadata = { title: "Vocabulary" };

const PAGE_SIZE = 50;

interface SearchParams {
  q?: string;
  topic?: string;
  pos?: string;
  page?: string;
}

/**
 * /admin/vocab — paginated, filterable list of all vocab entries.
 *
 * Filters live in the URL (q, topic, pos, page) so the page is bookmarkable
 * and the back button works. The Supabase query is built up dynamically based
 * on which filters are present.
 */
export default async function VocabPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const q = (params.q ?? "").trim();
  const topicSlug = (params.topic ?? "").trim();
  const pos = (params.pos ?? "").trim();

  const supabase = await createClient();

  // Resolve topicSlug → topic_id once (so we can use the join).
  let topicId: string | null = null;
  if (topicSlug) {
    const { data } = await supabase.from("topics").select("id").eq("slug", topicSlug).maybeSingle();
    topicId = data?.id ?? null;
  }

  // Build the main query. We join vocab_topics so we can filter by topic and
  // also list the entry's topic in the row.
  let query = supabase
    .from("vocab_entries")
    .select(
      `id, lemma, translation, pos, gender, example_es, example_en, notes, difficulty, is_irregular,
       vocab_topics(topic_id, topics(id, name, slug))`,
      { count: "exact" },
    )
    .is("deleted_at", null)
    .order("lemma", { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);

  if (q) query = query.or(`lemma.ilike.%${q}%,translation.ilike.%${q}%`);
  if (pos) query = query.eq("pos", pos);
  // Topic filter requires a separate prefilter — fetch matching vocab ids
  // first, then constrain. Cheap because index on (topic_id).
  if (topicId) {
    const { data: vt } = await supabase
      .from("vocab_topics")
      .select("vocab_id")
      .eq("topic_id", topicId);
    const ids = (vt ?? []).map((r) => r.vocab_id);
    if (ids.length === 0) {
      // Empty intersection — short-circuit the query.
      query = query.in("id", ["00000000-0000-0000-0000-000000000000"]);
    } else {
      query = query.in("id", ids);
    }
  }

  const [vocabResp, topicsResp] = await Promise.all([
    query,
    supabase.from("topics").select("id, name, slug").is("deleted_at", null).order("name"),
  ]);

  const rows = vocabResp.data ?? [];
  const topics = topicsResp.data ?? [];
  const total = vocabResp.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            aria-label="Back to library"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Vocabulary</h1>
            <p className="text-sm text-muted-foreground">
              {total.toLocaleString()} entries · page {page} of {pageCount}
            </p>
          </div>
        </div>
        <Link
          href="/admin/vocab/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> New entry
        </Link>
      </div>

      <Card className="mb-4">
        <CardContent className="p-4">
          <VocabFilters topics={topics} initial={{ q, topicSlug, pos }} />
        </CardContent>
      </Card>

      <VocabTable rows={rows} topics={topics} />
      <VocabPagination page={page} pageCount={pageCount} total={total} />
    </div>
  );
}
