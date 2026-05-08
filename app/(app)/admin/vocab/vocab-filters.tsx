"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const POS_OPTIONS = [
  "verb", "noun", "adjective", "adverb", "pronoun", "preposition",
  "conjunction", "interjection", "phrase", "number", "article",
];

interface Props {
  topics: { id: string; name: string; slug: string }[];
  initial: { q: string; topicSlug: string; pos: string };
}

export function VocabFilters({ topics, initial }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(initial.q);
  const [topicSlug, setTopicSlug] = useState(initial.topicSlug);
  const [pos, setPos] = useState(initial.pos);

  // Debounce the search input — 250ms is enough to feel snappy without
  // hammering the database on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => commit({ q, topicSlug, pos }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function commit(next: { q: string; topicSlug: string; pos: string }) {
    const sp = new URLSearchParams(params.toString());
    if (next.q) sp.set("q", next.q); else sp.delete("q");
    if (next.topicSlug) sp.set("topic", next.topicSlug); else sp.delete("topic");
    if (next.pos) sp.set("pos", next.pos); else sp.delete("pos");
    sp.delete("page"); // any filter change resets pagination
    router.push(`/admin/vocab?${sp.toString()}`);
  }

  function clear() {
    setQ("");
    setTopicSlug("");
    setPos("");
    router.push("/admin/vocab");
  }

  const hasFilters = q || topicSlug || pos;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[260px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search lemma or translation…"
          className="pl-9"
        />
      </div>
      <select
        value={topicSlug}
        onChange={(e) => {
          setTopicSlug(e.target.value);
          commit({ q, topicSlug: e.target.value, pos });
        }}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">All topics</option>
        {topics.map((t) => (
          <option key={t.id} value={t.slug}>
            {t.name}
          </option>
        ))}
      </select>
      <select
        value={pos}
        onChange={(e) => {
          setPos(e.target.value);
          commit({ q, topicSlug, pos: e.target.value });
        }}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">All POS</option>
        {POS_OPTIONS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clear}>
          <X className="mr-1 h-4 w-4" /> Clear
        </Button>
      )}
    </div>
  );
}
