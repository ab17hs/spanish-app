import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewVocabForm } from "./form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "New vocab entry" };

export default async function NewVocabPage() {
  const supabase = await createClient();
  const { data: topics } = await supabase
    .from("topics")
    .select("id, name, slug")
    .is("deleted_at", null)
    .order("name");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <Link
        href="/admin/vocab"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to vocabulary
      </Link>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">New entry</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Add a single vocab entry. For bulk additions, use{" "}
        <Link className="text-primary underline-offset-4 hover:underline" href="/admin/import">
          .docx import
        </Link>
        .
      </p>
      <Card>
        <CardContent className="p-6">
          <NewVocabForm topics={topics ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
