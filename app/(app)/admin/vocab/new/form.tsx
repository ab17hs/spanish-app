"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { createVocab } from "../actions";

const POS = [
  "verb", "noun", "adjective", "adverb", "pronoun", "preposition",
  "conjunction", "interjection", "phrase", "number", "article",
] as const;
const DIFF = ["easy", "medium", "hard"] as const;

export function NewVocabForm({ topics }: { topics: { id: string; name: string }[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [d, setD] = useState({
    lemma: "",
    translation: "",
    pos: "noun" as (typeof POS)[number],
    example_es: "",
    example_en: "",
    notes: "",
    difficulty: "easy" as (typeof DIFF)[number],
    is_irregular: false,
    topic_id: "",
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const r = await createVocab({
        lemma: d.lemma.trim(),
        translation: d.translation.trim(),
        pos: d.pos,
        example_es: d.example_es.trim() || null,
        example_en: d.example_en.trim() || null,
        notes: d.notes.trim() || null,
        difficulty: d.difficulty,
        is_irregular: d.is_irregular,
        topic_id: d.topic_id || null,
      });
      if (!r.ok) {
        toast({ title: "Couldn't save", description: r.error, variant: "destructive" });
        return;
      }
      toast({ title: "Added", description: d.lemma });
      router.push("/admin/vocab");
    });
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label="Lemma (Spanish)" required>
        <Input value={d.lemma} onChange={(e) => setD({ ...d, lemma: e.target.value })} required maxLength={200} autoFocus />
      </Field>
      <Field label="Translation (English)" required>
        <Input value={d.translation} onChange={(e) => setD({ ...d, translation: e.target.value })} required maxLength={500} />
      </Field>
      <Field label="Part of speech">
        <select
          value={d.pos}
          onChange={(e) => setD({ ...d, pos: e.target.value as (typeof POS)[number] })}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {POS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </Field>
      <Field label="Topic">
        <select
          value={d.topic_id}
          onChange={(e) => setD({ ...d, topic_id: e.target.value })}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">None</option>
          {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </Field>
      <Field label="Example sentence (es)">
        <Input value={d.example_es} onChange={(e) => setD({ ...d, example_es: e.target.value })} maxLength={500} />
      </Field>
      <Field label="Example sentence (en)">
        <Input value={d.example_en} onChange={(e) => setD({ ...d, example_en: e.target.value })} maxLength={500} />
      </Field>
      <Field label="Notes" full>
        <Input value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} maxLength={1000} />
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
      <Field label="Irregular?">
        <label className="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm">
          <input
            type="checkbox"
            checked={d.is_irregular}
            onChange={(e) => setD({ ...d, is_irregular: e.target.checked })}
          />
          <span>Irregular conjugation/inflection</span>
        </label>
      </Field>
      <div className="md:col-span-2 flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !d.lemma.trim() || !d.translation.trim()}>
          {pending ? "Saving…" : "Save entry"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, required, full, children }: {
  label: string;
  required?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label className="mb-1.5 block">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
