import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Grammar" };

/**
 * /admin/grammar — flat list of grammar rules grouped by category.
 *
 * Grammar is small enough (a few dozen rules at most) that pagination isn't
 * worth the complexity. Each row links to a per-rule edit page.
 */
export default async function GrammarPage() {
  const supabase = await createClient();
  const { data: rules } = await supabase
    .from("grammar_rules")
    .select("id, title, slug, category, level, difficulty, examples, updated_at")
    .is("deleted_at", null)
    .order("category", { ascending: true })
    .order("title", { ascending: true });

  const grouped = new Map<string, typeof rules>();
  for (const r of rules ?? []) {
    const arr = grouped.get(r.category) ?? [];
    arr.push(r);
    grouped.set(r.category, arr);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
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
            <h1 className="text-2xl font-semibold tracking-tight">Grammar</h1>
            <p className="text-sm text-muted-foreground">
              {rules?.length ?? 0} rules across {grouped.size} categories
            </p>
          </div>
        </div>
        <Link
          href="/admin/grammar/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> New rule
        </Link>
      </div>

      {grouped.size === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No grammar rules yet. Import from .docx or{" "}
              <Link className="text-primary underline-offset-4 hover:underline" href="/admin/grammar/new">
                create one
              </Link>
              .
            </p>
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
                  {(items ?? []).map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/admin/grammar/${r.id}`}
                        className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/30"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">{r.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {Array.isArray(r.examples) ? r.examples.length : 0} examples · updated{" "}
                            {new Date(r.updated_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {r.level && <Badge variant="outline">{r.level}</Badge>}
                          <Badge variant="accent">{r.difficulty}</Badge>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
