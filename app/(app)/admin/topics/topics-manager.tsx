"use client";

/**
 * Inline topic manager: add new (top of list), rename in-place, change color,
 * delete (soft, cascades visually but keeps data via deleted_at).
 *
 * Color chip is a real <input type="color"> — native, accessible, no widget
 * library needed. Default palette of 12 muted hues is offered as quick picks.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, Edit2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { createTopic, updateTopic, softDeleteTopic } from "./actions";

interface TopicRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  vocab_count: number;
  grammar_count: number;
}

const DEFAULT_PALETTE = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16",
  "#10b981", "#06b6d4", "#3b82f6", "#6366f1",
  "#8b5cf6", "#ec4899", "#a3a3a3", "#0ea5e9",
];

export function TopicsManager({ topics }: { topics: TopicRow[] }) {
  return (
    <div>
      <CreateBar />
      {topics.length === 0 ? (
        <div className="border-t px-5 py-8 text-center text-sm text-muted-foreground">
          No topics yet. Add one above, or import a .docx.
        </div>
      ) : (
        <ul className="divide-y border-t">
          {topics.map((t) => (
            <Row key={t.id} topic={t} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateBar() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_PALETTE[0]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      const r = await createTopic({ name: name.trim(), color });
      if (!r.ok) {
        toast({ title: "Couldn't create", description: r.error, variant: "destructive" });
        return;
      }
      toast({ title: "Created", description: name });
      setName("");
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 p-4">
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className="h-10 w-10 cursor-pointer rounded-md border border-input bg-background p-1"
        aria-label="Topic color"
      />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New topic name (e.g. Travel, Food, Politics)"
        className="flex-1 min-w-[260px]"
        maxLength={80}
      />
      <Button type="submit" disabled={pending || !name.trim()}>
        <Plus className="mr-1 h-4 w-4" /> Add
      </Button>
    </form>
  );
}

function Row({ topic }: { topic: TopicRow }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: topic.name,
    color: topic.color ?? DEFAULT_PALETTE[0],
    description: topic.description ?? "",
  });

  if (!editing) {
    return (
      <li className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/30">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="h-7 w-7 shrink-0 rounded-full border"
            style={{ backgroundColor: topic.color ?? "#a3a3a3" }}
          />
          <div className="min-w-0">
            <p className="font-medium">{topic.name}</p>
            <p className="text-xs text-muted-foreground">/{topic.slug}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline">{topic.vocab_count} vocab</Badge>
          {topic.grammar_count > 0 && (
            <Badge variant="accent">{topic.grammar_count} grammar</Badge>
          )}
          <Button variant="ghost" size="icon" onClick={() => setEditing(true)} aria-label="Edit">
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={pending}
            aria-label="Delete"
            onClick={() => {
              if (
                topic.vocab_count + topic.grammar_count > 0 &&
                !confirm(`“${topic.name}” has ${topic.vocab_count + topic.grammar_count} linked entries. Delete anyway?`)
              ) {
                return;
              }
              startTransition(async () => {
                const r = await softDeleteTopic(topic.id);
                if (!r.ok) {
                  toast({ title: "Delete failed", description: r.error, variant: "destructive" });
                } else {
                  toast({ title: "Deleted", description: topic.name });
                  router.refresh();
                }
              });
            }}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="space-y-3 bg-muted/20 px-5 py-4">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={draft.color}
          onChange={(e) => setDraft({ ...draft, color: e.target.value })}
          className="h-10 w-10 cursor-pointer rounded-md border border-input bg-background p-1"
          aria-label="Topic color"
        />
        <Input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          maxLength={80}
          autoFocus
        />
      </div>
      <Input
        value={draft.description}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        placeholder="Description (optional)"
        maxLength={500}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted-foreground">Quick colors:</span>
        {DEFAULT_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            className="h-6 w-6 rounded-full border ring-offset-2 transition-all hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            style={{ backgroundColor: c }}
            onClick={() => setDraft({ ...draft, color: c })}
            aria-label={`Color ${c}`}
          />
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={pending}>
          <X className="mr-1 h-4 w-4" /> Cancel
        </Button>
        <Button
          size="sm"
          disabled={pending || !draft.name.trim()}
          onClick={() => {
            startTransition(async () => {
              const r = await updateTopic({
                id: topic.id,
                name: draft.name.trim(),
                color: draft.color,
                description: draft.description.trim() || null,
              });
              if (!r.ok) {
                toast({ title: "Save failed", description: r.error, variant: "destructive" });
                return;
              }
              toast({ title: "Saved" });
              setEditing(false);
              router.refresh();
            });
          }}
        >
          <Save className="mr-1 h-4 w-4" /> Save
        </Button>
      </div>
    </li>
  );
}
