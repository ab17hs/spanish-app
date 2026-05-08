import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Grammar" };

/**
 * /grammar — student-facing grammar lesson index.
 *
 * Differs from /admin/grammar (the editor) in two ways:
 *   - No "edit" affordance; just "open lesson".
 *   - Shows the SRS state next to each rule so the user can see which rules
 *     are due for review without going to the study page.
 */
export default async function GrammarLessonsPage() {
  const supabase = await createClient();

  // Pull rules + their flashcard's SRS state in parallel.
  const [rulesResp, srsResp] = await Promise.all([
    supabase
      .from("grammar_rules")
      .select("id, title, slug, category, level, difficulty, examples, updated_at")
      .is("deleted_at", null)
      .order("category")
      .order("title"),
    supabase
      .from("srs_state")
      .select(
        `card_id, due_at, interval_idx, total_reviews,
         flashcards!inner(grammar_id, kind)`,
      )
      .eq("flashcards.kind", "grammar"),
  ]);

  type SrsRow = {
    card_id: string;
    due_at: string;
    interval_idx: number;
    total_reviews: number;
    flashcards: { grammar_id: string | null; kind: string };
  };
  const srsByGrammar = new Map<string, SrsRow>();
  for (const r of (srsResp.data ?? []) as unknown as SrsRow[]) {
    if (r.flashcards.grammar_id) srsByGrammar.set(r.flashcards.grammar_id, r);
  }

  const rules = rulesResp.data ?? [];
  const grouped = new Map<string, typeof rules>();
  for (const r of rules) {
    const arr = grouped.get(r.category) ?? [];
    arr.push(r);
    grouped.set(r.category, arr);
  }

  const now = Date.now();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Grammar lessons</h1>
          <p className="text-muted-foreground">
            {rules.length} rules across {grouped.size} categor{grouped.size === 1 ? "y" : "ies"}
          </p>
        </div>
        <Link
          href="/study?kind=grammar"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Sparkles className="h-4 w-4" /> Drill grammar
        </Link>
      </div>

      {grouped.size === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No grammar rules yet — import a .docx or{" "}
            <Link className="text-primary underline-offset-4 hover:underline" href="/admin/grammar/new">
              add one
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([category, items]) => (
            <Card key={category}>
              <CardContent className="p-0">
                <div className="border-b bg-muted/30 px-5 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {category}
                </div>
                <ul className="divide-y">
                  {items.map((r) => {
                    const srs = srsByGrammar.get(r.id);
                    const due = srs && new Date(srs.due_at).getTime() <= now;
                    const fresh = !srs || srs.total_reviews === 0;
                    return (
                      <li key={r.id}>
                        <Link
                          href={`/grammar/${r.slug}`}
                          className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{r.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {Array.isArray(r.examples) ? r.examples.length : 0} examples
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {fresh && <Badge variant="accent">new</Badge>}
                            {due && !fresh && <Badge variant="warning">due</Badge>}
                            {r.level && <Badge variant="outline">{r.level}</Badge>}
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
