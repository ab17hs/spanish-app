"use client";

/**
 * Generation form for /story. Adds a free-text "theme" field on top of the
 * topic/grammar/level shape used by /reading.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { generateStoryAction } from "./actions";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

interface TopicChoice { name: string; slug: string; color: string | null }
interface GrammarChoice { title: string; slug: string; category: string }

export function GenerateStoryForm({
  topics,
  grammarRules,
  defaultLevel,
}: {
  topics: TopicChoice[];
  grammarRules: GrammarChoice[];
  defaultLevel: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [grammarSlug, setGrammarSlug] = useState<string>("");
  const [level, setLevel] = useState<string>(defaultLevel);
  const [theme, setTheme] = useState<string>("");

  const toggleTopic = (slug: string) => {
    setSelectedTopics((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  };

  const submit = () => {
    startTransition(async () => {
      const r = await generateStoryAction({
        topicSlugs: selectedTopics,
        grammarSlug: grammarSlug || null,
        level: (LEVELS as readonly string[]).includes(level)
          ? (level as (typeof LEVELS)[number])
          : null,
        theme: theme.trim() || null,
      });
      if (!r.ok) {
        toast({
          title: "Generation failed",
          description: r.error,
          variant: "destructive",
        });
        return;
      }
      if (r.data?.id) router.push(`/story/${r.data.id}`);
    });
  };

  const grammarGrouped = grammarRules.reduce<Record<string, GrammarChoice[]>>((acc, g) => {
    (acc[g.category] ??= []).push(g);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div>
        <Label className="mb-1.5 block">Topics</Label>
        {topics.length === 0 ? (
          <p className="text-xs text-muted-foreground">No topics yet — Claude will pick something.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {topics.map((t) => {
              const on = selectedTopics.includes(t.slug);
              return (
                <button
                  key={t.slug}
                  type="button"
                  onClick={() => toggleTopic(t.slug)}
                  className={[
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-muted",
                  ].join(" ")}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: t.color ?? "currentColor" }}
                  />
                  {t.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <Label htmlFor="theme" className="mb-1.5 block">
          Theme <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="theme"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder="e.g. a rainy afternoon in Madrid, a forgotten letter, a chance meeting"
          maxLength={200}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <Label htmlFor="grammar-s" className="mb-1.5 block">
            Grammar focus <span className="text-muted-foreground">(optional)</span>
          </Label>
          <select
            id="grammar-s"
            value={grammarSlug}
            onChange={(e) => setGrammarSlug(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">— none —</option>
            {Object.entries(grammarGrouped).map(([cat, rules]) => (
              <optgroup key={cat} label={cat}>
                {rules.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="level-s" className="mb-1.5 block">
            Level
          </Label>
          <select
            id="level-s"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={submit} disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Writing…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" /> Generate story
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
