"use client";

/**
 * Interactive story viewer.
 *
 * Mirrors ReadingViewer but with a paragraph array instead of a single
 * passage. Each paragraph gets its own per-paragraph "Speak" affordance —
 * for longer prose, you usually want to replay just one paragraph at a time.
 */

import { useMemo, useState, useCallback } from "react";
import { Volume2, Eye, EyeOff, Pause } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { Story } from "@/lib/ai/claude";

interface Props {
  payload: Story;
}

export function StoryViewer({ payload }: Props) {
  const paragraphs = payload.paragraphs_es ?? [];
  const glossary = payload.glossary ?? [];
  const comprehension = payload.comprehension ?? [];

  const glossaryMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of glossary) m.set(normalize(g.es), g.en);
    return m;
  }, [glossary]);

  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);

  const speakParagraph = useCallback((i: number, text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    if (speakingIdx === i) {
      synth.cancel();
      setSpeakingIdx(null);
      return;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "es-ES";
    u.rate = 0.9;
    u.onend = () => setSpeakingIdx((cur) => (cur === i ? null : cur));
    u.onerror = () => setSpeakingIdx((cur) => (cur === i ? null : cur));
    synth.speak(u);
    setSpeakingIdx(i);
  }, [speakingIdx]);

  const speakAll = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    paragraphs.forEach((p) => {
      const u = new SpeechSynthesisUtterance(p);
      u.lang = "es-ES";
      u.rate = 0.9;
      synth.speak(u);
    });
  }, [paragraphs]);

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="px-6 py-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Story
            </span>
            <button
              type="button"
              onClick={speakAll}
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
              aria-label="Read entire story aloud"
            >
              <Volume2 className="h-3.5 w-3.5" /> Read all
            </button>
          </div>

          <div className="space-y-4">
            {paragraphs.map((p, i) => {
              const tokens = tokenize(p);
              const speaking = speakingIdx === i;
              return (
                <div key={i} className="group flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => speakParagraph(i, p)}
                    className={[
                      "mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground",
                      speaking && "border-primary text-primary",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-label={speaking ? "Stop" : "Speak paragraph"}
                  >
                    {speaking ? <Pause className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                  </button>
                  <p className="text-base leading-relaxed text-foreground" lang="es">
                    {tokens.map((t, ti) => {
                      if (t.kind !== "word") return <span key={ti}>{t.text}</span>;
                      const hit = glossaryMap.get(normalize(t.text));
                      if (!hit) return <span key={ti}>{t.text}</span>;
                      return (
                        <span
                          key={ti}
                          title={hit}
                          className="cursor-help border-b border-dashed border-primary/60 text-primary"
                        >
                          {t.text}
                        </span>
                      );
                    })}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {glossary.length > 0 && (
        <Card>
          <CardContent className="px-6 py-5">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Glossary
            </h2>
            <ul className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              {glossary.map((g, i) => (
                <li key={i} className="flex items-baseline gap-2 text-sm">
                  <span className="font-medium text-foreground" lang="es">
                    {g.es}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground" lang="en">
                    {g.en}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {comprehension.length > 0 && (
        <Card>
          <CardContent className="px-6 py-5">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Comprehension
            </h2>
            <ol className="space-y-3">
              {comprehension.map((c, i) => (
                <ComprehensionItem key={i} index={i + 1} question={c.question_en} answer={c.answer_en} />
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ComprehensionItem({
  index,
  question,
  answer,
}: {
  index: number;
  question: string;
  answer: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <li className="rounded-lg border bg-muted/20 p-3">
      <p className="text-sm font-medium">
        {index}. {question}
      </p>
      {shown ? (
        <div className="mt-2 flex items-start justify-between gap-3">
          <p className="text-sm text-foreground">{answer}</p>
          <button
            type="button"
            onClick={() => setShown(false)}
            className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <EyeOff className="h-3 w-3" /> Hide
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShown(true)}
          className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <Eye className="h-3 w-3" /> Reveal answer
        </button>
      )}
    </li>
  );
}

interface Token { kind: "word" | "space"; text: string }

function tokenize(s: string): Token[] {
  const out: Token[] = [];
  const re = /(\s+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push({ kind: "word", text: s.slice(last, m.index) });
    out.push({ kind: "space", text: m[0] });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ kind: "word", text: s.slice(last) });
  return out;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;:!?¿¡()«»"']/g, "")
    .trim();
}
