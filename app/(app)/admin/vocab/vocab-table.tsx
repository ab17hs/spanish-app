"use client";

/**
 * Inline-editable vocab table.
 *
 * Each row toggles between a read-only display and an editable form. Edits
 * are submitted via the `updateVocab` server action. Soft-delete sets
 * `deleted_at`, so the row vanishes after refresh — no destructive UX surprise.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit2, Trash2, Save, X, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { updateVocab, softDeleteVocab } from "./actions";

type TopicRef = { topic_id: string; topics: { id: string; name: string; slug: string } | null };

interface VocabRow {
  id: string;
  lemma: string;
  translation: string;
  pos: string;
  example_es: string | null;
  example_en: string | null;
  notes: string | null;
  difficulty: string;
  is_irregular: boolean | null;
  vocab_topics: TopicRef[];
}

const POS_OPTIONS = [
  "verb", "noun", "adjective", "adverb", "pronoun", "preposition",
  "conjunction", "interjection", "phrase", "number", "article",
] as const;

const DIFFICULTY = ["easy", "medium", "hard"] as const;

interface Props {
  rows: VocabRow[];
  topics: { id: string; name: string; slug: string }[];
}

export function VocabTable({ rows, topics }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">
          No vocab matches these filters.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-left">Lemma</th>
            <th className="px-4 py-3 text-left">Translation</th>
            <th className="px-4 py-3 text-left">POS</th>
            <th className="px-4 py-3 text-left">Topic</th>
            <th className="px-4 py-3 text-left">Diff</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <Row key={row.id} row={row} topics={topics} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ row, topics }: { row: VocabRow; topics: { id: string; name: string; slug: string }[] }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  const initialTopicId = row.vocab_topics[0]?.topic_id ?? "";
  const [draft, setDraft] = useState({
    lemma: row.lemma,
    translation: row.translation,
    pos: row.pos,
    example_es: row.example_es ?? "",
    example_en: row.example_en ?? "",
    notes: row.notes ?? "",
    difficulty: row.difficulty,
    is_irregular: row.is_irregular ?? false,
    topic_id: initialTopicId,
  });

  const topicName = row.vocab_topics[0]?.topics?.name ?? "—";

  if (!editing) {
    return (
      <tr className="hover:bg-muted/30">
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.lemma}</span>
            {row.is_irregular && <Star className="h-3 w-3 text-warning-foreground" aria-label="irregular" />}
          </div>
          {row.example_es && (
            <p className="mt-0.5 line-clamp-1 text-xs italic text-muted-foreground">{row.example_es}</p>
          )}
        </td>
        <td className="px-4 py-3 text-muted-foreground">{row.translation}</td>
        <td className="px-4 py-3">
          <Badge variant="outline">{row.pos}</Badge>
        </td>
        <td className="px-4 py-3 text-muted-foreground">{topicName}</td>
        <td className="px-4 py-3">
          <DifficultyBadge value={row.difficulty} />
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)} aria-label="Edit">
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (!confirm(`Delete “${row.lemma}”? Flashcard history is kept.`)) return;
                startTransition(async () => {
                  const r = await softDeleteVocab(row.id);
                  if (!r.ok) {
                    toast({ title: "Delete failed", description: r.error, variant: "destructive" });
                  } else {
                    toast({ title: "Deleted", description: row.lemma });
                    router.refresh();
                  }
                });
              }}
              aria-label="Delete"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-muted/20">
      <td className="px-4 py-3">
        <Input
          className="h-8"
          value={draft.lemma}
          onChange={(e) => setDraft({ ...draft, lemma: e.target.value })}
        />
      </td>
      <td className="px-4 py-3">
        <Input
          className="h-8"
          value={draft.translation}
          onChange={(e) => setDraft({ ...draft, translation: e.target.value })}
        />
      </td>
      <td className="px-4 py-3">
        <select
          value={draft.pos}
          onChange={(e) => setDraft({ ...draft, pos: e.target.value })}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          {POS_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <select
          value={draft.topic_id}
          onChange={(e) => setDraft({ ...draft, topic_id: e.target.value })}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">No topic</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <select
          value={draft.difficulty}
          onChange={(e) => setDraft({ ...draft, difficulty: e.target.value })}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          {DIFFICULTY.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(false)}
            disabled={pending}
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            variant="default"
            size="sm"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const r = await updateVocab({
                  id: row.id,
                  ...draft,
                  example_es: draft.example_es || null,
                  example_en: draft.example_en || null,
                  notes: draft.notes || null,
                  topic_id: draft.topic_id || null,
                });
                if (!r.ok) {
                  toast({ title: "Save failed", description: r.error, variant: "destructive" });
                } else {
                  toast({ title: "Saved" });
                  setEditing(false);
                  router.refresh();
                }
              });
            }}
          >
            <Save className="mr-1 h-4 w-4" /> Save
          </Button>
        </div>
      </td>
    </tr>
  );
}

function DifficultyBadge({ value }: { value: string }) {
  const map: Record<string, "success" | "warning" | "destructive"> = {
    easy: "success",
    medium: "warning",
    hard: "destructive",
  };
  return <Badge variant={map[value] ?? "outline"}>{value}</Badge>;
}
