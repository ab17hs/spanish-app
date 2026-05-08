import Link from "next/link";
import { Upload, BookOpen, PencilRuler, Tags } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Library" };

/**
 * Library landing page — gives a snapshot of the library and links into the
 * deeper admin tools (import, vocab CRUD, grammar CRUD). Uses the server
 * Supabase client directly so RLS scopes everything to the current user.
 */
export default async function AdminPage() {
  const supabase = await createClient();

  const [vocabResp, grammarResp, topicsResp, importsResp] = await Promise.all([
    supabase.from("vocab_entries").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("grammar_rules").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("topics").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase
      .from("import_logs")
      .select("filename, vocab_added, grammar_added, topics_added, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const vocabCount = vocabResp.count ?? 0;
  const grammarCount = grammarResp.count ?? 0;
  const topicCount = topicsResp.count ?? 0;
  const recentImports = importsResp.data ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
          <p className="mt-1 text-muted-foreground">
            Your personal Spanish corpus: vocabulary, grammar rules, and topics.
          </p>
        </div>
        <Link
          href="/admin/import"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Upload className="h-4 w-4" /> Import .docx
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/admin/vocab" className="group">
          <Card className="h-full transition-all group-hover:border-primary/40 group-hover:shadow-md">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <BookOpen className="h-6 w-6 text-primary" />
              <CardTitle>Vocab</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{vocabCount.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">entries · click to browse & edit</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/admin/grammar" className="group">
          <Card className="h-full transition-all group-hover:border-primary/40 group-hover:shadow-md">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <PencilRuler className="h-6 w-6 text-accent" />
              <CardTitle>Grammar</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{grammarCount.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">rules · explanations + exercises</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/admin/topics" className="group">
          <Card className="h-full transition-all group-hover:border-primary/40 group-hover:shadow-md">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <Tags className="h-6 w-6 text-success" />
              <CardTitle>Topics</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{topicCount.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">groups · color-coded for filtering</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Recent imports</CardTitle>
          <CardDescription>Last 5 .docx uploads.</CardDescription>
        </CardHeader>
        <CardContent>
          {recentImports.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No imports yet.{" "}
              <Link className="text-primary underline-offset-4 hover:underline" href="/admin/import">
                Upload your curriculum
              </Link>{" "}
              to get started.
            </p>
          ) : (
            <ul className="divide-y">
              {recentImports.map((row, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Badge variant="success">+{row.vocab_added} vocab</Badge>
                    {row.grammar_added > 0 && <Badge variant="accent">+{row.grammar_added} grammar</Badge>}
                    {row.topics_added > 0 && <Badge variant="outline">+{row.topics_added} topics</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
