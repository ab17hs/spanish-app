import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { GrammarForm } from "../grammar-form";

export const metadata = { title: "Edit grammar rule" };

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const DIFF = ["easy", "medium", "hard"] as const;

export default async function EditGrammarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grammar_rules")
    .select("id, title, category, level, explanation_md, examples, difficulty")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) notFound();

  const examples = Array.isArray(data.examples)
    ? (data.examples as { es: string; en: string }[])
    : [{ es: "", en: "" }];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Edit grammar rule</h1>
      <Card>
        <CardContent className="p-6">
          <GrammarForm
            mode="edit"
            initial={{
              id: data.id,
              title: data.title,
              category: data.category,
              level: (LEVELS as readonly string[]).includes(data.level ?? "")
                ? (data.level as (typeof LEVELS)[number])
                : null,
              explanation_md: data.explanation_md,
              examples: examples.length > 0 ? examples : [{ es: "", en: "" }],
              difficulty: (DIFF as readonly string[]).includes(data.difficulty)
                ? (data.difficulty as (typeof DIFF)[number])
                : "medium",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
