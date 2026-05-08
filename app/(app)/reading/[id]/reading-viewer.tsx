"use client";

/**
 * Interactive reading viewer.
 *
 * Features:
 *   - "Speak" button → reads the passage aloud (Web Speech API, es-ES).
 *   - Glossary popovers: any word in the passage that matches a glossary
 *     entry gets underlined; tapping/hovering reveals the EN translation.
 *   - Comprehension Q&A: question shown, "Reveal answer" toggles each item.
 *
 * Glossary matching is intentionally simple — case-insensitive whole-word
 * lookup against a Map. We strip basic punctuation when comparing tokens but
 * don't do any fancy lemmatization, since glossaries are typically the
 * passage's tricky inflections, not infinitives.
 */

import { useMemo, useState, useCallback } from "react";
import { Volume2, Eye, EyeOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { Reading } from "@/lib/ai/claude";

interface Props {
  payload: Reading & { passage_es?: string };
}

export function ReadingViewer({ payload }: Props) {
  const passage = payload.passage_es ?? "";
  const glossary = payload.glossary ?? [];
  const comprehension = payload.comprehension ?? [];

  const glossaryMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of glossary) m.set(normalize(g.es), g.en);
    return m;
  }, [glossary]);

  const tokens = useMemo(() => tokenize(passage), [passage]);

  const speak = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(passage);
    u.lang = "es-ES";
    u.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [passage]);

  return (
    <div className="space-y-5">
      {/* Passage */}
      <Card>
        <CardContent className="px-6 py-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Passage
            </span>
            <button
              type="button"
              onClick={speak}
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
              aria-label="Speak passage"
            >
              <Volume2 className="h-3.5 w-3.5" /> Speak
            </button>
          </div>
          <p className="text-base leading-relaxed text-foreground" lang="es">
            {tokens.map((t, i) => {
              if (t.kind !== "word") return <span key={i}>{t.text}</span>;
              const hit = glossaryMap.get(normalize(t.text));
              if (!hit) return <span key={i}>{t.text}</span>;
              return (
                <span
                  key={i}
                  title={hit}
                  className="cursor-help border-b border-dashed border-primary/60 text-primary"
                >
                  {t.text}
                </span>
              );
            })}
          </p>
        </CardContent>
      </Card>

      {/* Glossary */}
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

      {/* Comprehension */}
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

// ---------------------------------------------------------------------------
// Tokenization helpers
// ---------------------------------------------------------------------------

interface Token {
  kind: "word" | "space";
  text: string;
}

/**
 * Split a passage into word/space tokens that preserve original spacing and
 * punctuation. We keep punctuation glued to the trailing word so "casa," is
 * one token — that way the glossary normalizer can strip the comma before
 * lookup without us having to reassemble whitespace afterward.
 */
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
