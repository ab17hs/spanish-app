"use client";

/**
 * Shared form for both /admin/grammar/new and /admin/grammar/[id].
 *
 * Examples live in their own dynamic list — add row, remove row, no max
 * other than the action's zod cap of 50.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { createGrammar, updateGrammar, softDeleteGrammar } from "./actions";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const DIFF = ["easy", "medium", "hard"] as const;

interface Example { es: string; en: string }

interface InitialValue {
  id?: string;
  title: string;
  category: string;
  level: (typeof LEVELS)[number] | null;
  explanation_md: string;
  examples: Example[];
  difficulty: (typeof DIFF)[number];
}

const empty: InitialValue = {
  title: "",
  category: "",
  level: null,
  explanation_md: "",
  examples: [{ es: "", en: "" }],
  difficulty: "medium",
};

export function GrammarForm({ initial = empty, mode }: { initial?: InitialValue; mode: "new" | "edit" }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [d, setD] = useState<InitialValue>(initial);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const examples = d.examples.filter((ex) => ex.es.trim() && ex.en.trim());
    const payload = {
      ...(mode === "edit" ? { id: d.id! } : {}),
      title: d.title.trim(),
      category: d.category.trim(),
      level: d.level,
      explanation_md: d.explanation_md.trim(),
      examples,
      difficulty: d.difficulty,
    };
    startTransition(async () => {
      const r = mode === "new" ? await createGrammar(payload) : await updateGrammar(payload);
      if (!r.ok) {
        toast({ title: "Save failed", description: r.error, variant: "destructive" });
        return;
      }
      toast({ title: mode === "new" ? "Created" : "Saved", description: d.title });
      router.push("/admin/grammar");
    });
  };

  const handleDelete = () => {
    if (!d.id) return;
    if (!confirm(`Delete grammar rule “${d.title}”?`)) return;
    startTransition(async () => {
      const r = await softDeleteGrammar(d.id!);
      if (!r.ok) {
        toast({ title: "Delete failed", description: r.error, variant: "destructive" });
      } else {
        toast({ title: "Deleted", description: d.title });
        router.push("/admin/grammar");
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        {mode === "edit" && (
          <Button type="button" variant="ghost" size="sm" onClick={handleDelete} disabled={pending}>
            <Trash2 className="mr-1 h-4 w-4 text-destructive" /> Delete
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Title" required>
          <Input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} required maxLength={200} autoFocus />
        </Field>
        <Field label="Category" required>
          <Input
            value={d.category}
            onChange={(e) => setD({ ...d, category: e.target.value })}
            required
            maxLength={80}
            placeholder="e.g. Present tense, Subjunctive"
          />
        </Field>
        <Field label="CEFR level">
          <select
            value={d.level ?? ""}
            onChange={(e) => setD({ ...d, level: (e.target.value || null) as (typeof LEVELS)[number] | null })}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">— none —</option>
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </Field>
        <Field label="Difficulty">
          <select
            value={d.difficulty}
            onChange={(e) => setD({ ...d, difficulty: e.target.value as (typeof DIFF)[number] })}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {DIFF.map((diff) => <option key={diff} value={diff}>{diff}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Explanation (Markdown)" required>
        <textarea
          value={d.explanation_md}
          onChange={(e) => setD({ ...d, explanation_md: e.target.value })}
          required
          maxLength={8000}
          rows={10}
          className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder={"Use **bold**, _italic_, `code`, lists.\n\nExplain the rule, edge cases, and how it differs from English."}
        />
      </Field>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label>Examples</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setD({ ...d, examples: [...d.examples, { es: "", en: "" }] })}
          >
            <Plus className="mr-1 h-4 w-4" /> Add example
          </Button>
        </div>
        <div className="space-y-2">
          {d.examples.map((ex, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
              <Input
                value={ex.es}
                onChange={(e) => {
                  const copy = [...d.examples];
                  copy[i] = { ...copy[i], es: e.target.value };
                  setD({ ...d, examples: copy });
                }}
                placeholder="Spanish example"
                maxLength={500}
              />
              <Input
                value={ex.en}
                onChange={(e) => {
                  const copy = [...d.examples];
                  copy[i] = { ...copy[i], en: e.target.value };
                  setD({ ...d, examples: copy });
                }}
                placeholder="English translation"
                maxLength={500}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setD({ ...d, examples: d.examples.filter((_, idx) => idx !== i) })}
                aria-label="Remove example"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !d.title.trim() || !d.category.trim() || !d.explanation_md.trim()}>
          {pending ? "Saving…" : mode === "new" ? "Create rule" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
