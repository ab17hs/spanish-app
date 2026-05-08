import { Card, CardContent } from "@/components/ui/card";
import { GrammarForm } from "../grammar-form";

export const metadata = { title: "New grammar rule" };

export default function NewGrammarPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">New grammar rule</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Add an explanation and at least one example. A flashcard is generated automatically.
      </p>
      <Card>
        <CardContent className="p-6">
          <GrammarForm mode="new" />
        </CardContent>
      </Card>
    </div>
  );
}
