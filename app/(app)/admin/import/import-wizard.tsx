"use client";

/**
 * Three-stage import wizard:
 *
 *   1. Upload   — drag/drop a .docx, POST to /api/import, get parse result.
 *   2. Review   — vocab grouped by topic, editable lemma/translation/POS,
 *                 individual discard, bulk discard by topic. Grammar reviewed
 *                 separately. Counts always visible.
 *   3. Commit   — server action persists. Render summary toast + redirect.
 *
 * State lives entirely in this client component. The parsed payload is held
 * in memory; if the user reloads, they re-upload. That tradeoff keeps the
 * server stateless and the schema clean.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Loader2, Check, X, AlertTriangle, ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { commitImportAction } from "./actions";
import type { ParsedVocab, ParsedGrammar } from "@/lib/parser/docx-parser";

type Stage = "upload" | "review" | "done";

interface ParseResponse {
  filename: string;
  sizeBytes: number;
  counts: { vocab: number; grammar: number; topics: number; warnings: number };
  vocab: ParsedVocab[];
  grammar: ParsedGrammar[];
  topics: { slug: string; name: string }[];
  warnings: string[];
}

const POS_OPTIONS = [
  "verb", "noun", "adjective", "adverb", "pronoun",
  "preposition", "conjunction", "interjection", "phrase", "number", "article",
] as const;

export function ImportWizard() {
  const [stage, setStage] = useState<Stage>("upload");
  const [parseResult, setParseResult] = useState<ParseResponse | null>(null);

  if (stage === "upload") {
    return (
      <UploadStage
        onParsed={(r) => {
          setParseResult(r);
          setStage("review");
        }}
      />
    );
  }
  if (stage === "review" && parseResult) {
    return (
      <ReviewStage
        initial={parseResult}
        onCancel={() => {
          setParseResult(null);
          setStage("upload");
        }}
        onDone={() => setStage("done")}
      />
    );
  }
  return <DoneStage />;
}

// ---------------------------------------------------------------------------
// Upload stage
// ---------------------------------------------------------------------------
function UploadStage({ onParsed }: { onParsed: (r: ParseResponse) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    if (!/\.docx$/i.test(file.name)) {
      setError("Only .docx files are supported.");
      return;
    }
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(`Parse failed: ${json.error ?? res.statusText}${json.detail ? ` — ${json.detail}` : ""}`);
        setBusy(false);
        return;
      }
      onParsed(json as ParseResponse);
      toast({
        title: "Parsed!",
        description: `${json.counts.vocab} vocab, ${json.counts.grammar} grammar, ${json.counts.topics} topics.`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setBusy(false);
    }
  }, [onParsed, toast]);

  return (
    <Card>
      <CardContent className="p-0">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          onClick={() => !busy && inputRef.current?.click()}
          className={`flex min-h-[280px] cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-8 transition-all ${
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/40"
          } ${busy ? "pointer-events-none opacity-60" : ""}`}
        >
          {busy ? (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm font-medium">Parsing your document…</p>
              <p className="text-xs text-muted-foreground">This usually takes under a second.</p>
            </>
          ) : (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-base font-medium">Drag a .docx here, or click to choose</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Up to 8 MB. Headers like “Verbs”, “Adjectives”, “Family”
                  become topic groups automatically.
                </p>
              </div>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>
        {error && (
          <div className="m-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Review stage
// ---------------------------------------------------------------------------
type EditableVocab = ParsedVocab & { _id: number; _kept: boolean };
type EditableGrammar = ParsedGrammar & { _id: number; _kept: boolean };

function ReviewStage({
  initial,
  onCancel,
  onDone,
}: {
  initial: ParseResponse;
  onCancel: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [committing, setCommitting] = useState(false);

  // Annotate each entry with a stable id and a "_kept" flag for discard.
  const [vocab, setVocab] = useState<EditableVocab[]>(() =>
    initial.vocab.map((v, i) => ({ ...v, _id: i, _kept: true })),
  );
  const [grammar, setGrammar] = useState<EditableGrammar[]>(() =>
    initial.grammar.map((g, i) => ({ ...g, _id: i, _kept: true })),
  );
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Group vocab by topic for display
  const grouped = useMemo(() => {
    const map = new Map<string, EditableVocab[]>();
    for (const v of vocab) {
      const list = map.get(v.topic_name) ?? [];
      list.push(v);
      map.set(v.topic_name, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [vocab]);

  const filteredGroups = useMemo(() => {
    if (!search) return grouped;
    const q = search.toLowerCase();
    return grouped
      .map(([name, items]) => [name, items.filter((v) => v.lemma.toLowerCase().includes(q) || v.translation.toLowerCase().includes(q))] as const)
      .filter(([, items]) => items.length > 0);
  }, [grouped, search]);

  const keptVocabCount = vocab.filter((v) => v._kept).length;
  const keptGrammarCount = grammar.filter((g) => g._kept).length;

  const updateVocab = (id: number, patch: Partial<EditableVocab>) =>
    setVocab((prev) => prev.map((v) => (v._id === id ? { ...v, ...patch } : v)));
  const toggleVocab = (id: number) =>
    setVocab((prev) => prev.map((v) => (v._id === id ? { ...v, _kept: !v._kept } : v)));
  const toggleGrammar = (id: number) =>
    setGrammar((prev) => prev.map((g) => (g._id === id ? { ...g, _kept: !g._kept } : g)));
  const discardTopic = (topicName: string, all = true) =>
    setVocab((prev) => prev.map((v) => (v.topic_name === topicName ? { ...v, _kept: !all } : v)));

  const handleCommit = async () => {
    setCommitting(true);
    const payload = {
      filename: initial.filename,
      vocab: vocab.filter((v) => v._kept).map(stripMeta),
      grammar: grammar.filter((g) => g._kept).map(stripMeta),
      topics: initial.topics, // keep all referenced topics
    };
    const res = await commitImportAction(payload);
    setCommitting(false);
    if (!res.ok) {
      toast({
        title: "Import failed",
        description: res.error + (res.issues?.length ? `: ${res.issues.join("; ")}` : ""),
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Imported!",
      description: `${res.result.vocab_added} new, ${res.result.vocab_updated} updated, ${res.result.grammar_added} grammar, ${res.result.topics_added} topics.`,
    });
    onDone();
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {initial.filename}
            </CardTitle>
            <CardDescription>
              {initial.counts.vocab} vocab parsed across {initial.counts.topics} topics.
              {initial.warnings.length > 0 && (
                <> · <span className="text-warning-foreground">{initial.warnings.length} warnings</span></>
              )}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={committing}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Start over
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success">{keptVocabCount} vocab to import</Badge>
            <Badge variant="accent">{keptGrammarCount} grammar to import</Badge>
            <Badge variant="outline">{initial.topics.length} topics</Badge>
            {initial.warnings.length > 0 && (
              <Badge variant="warning">{initial.warnings.length} warnings</Badge>
            )}
          </div>

          {initial.warnings.length > 0 && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="mb-1 font-medium">Parser warnings</p>
              <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
                {initial.warnings.slice(0, 8).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
                {initial.warnings.length > 8 && (
                  <li className="italic">…and {initial.warnings.length - 8} more</li>
                )}
              </ul>
            </div>
          )}

          <Input
            placeholder="Search vocab (lemma or translation)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </CardContent>
      </Card>

      {/* Vocab groups */}
      <div className="space-y-4">
        {filteredGroups.map(([topicName, items]) => {
          const keptHere = items.filter((v) => v._kept).length;
          const isCollapsed = collapsed[topicName];
          return (
            <Card key={topicName}>
              <CardHeader
                className="cursor-pointer flex flex-row items-center justify-between space-y-0 py-3"
                onClick={() => setCollapsed((c) => ({ ...c, [topicName]: !c[topicName] }))}
              >
                <div className="flex items-center gap-2">
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                  <CardTitle className="text-base">{topicName}</CardTitle>
                  <Badge variant="outline">
                    {keptHere}/{items.length}
                  </Badge>
                </div>
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => discardTopic(topicName, true)}
                    disabled={keptHere === 0}
                  >
                    Discard all
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => discardTopic(topicName, false)}
                    disabled={keptHere === items.length}
                  >
                    Keep all
                  </Button>
                </div>
              </CardHeader>
              {!isCollapsed && (
                <CardContent className="pt-0">
                  <div className="overflow-hidden rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">Lemma (es)</th>
                          <th className="px-3 py-2 text-left">Translation</th>
                          <th className="px-3 py-2 text-left">POS</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {items.map((v) => (
                          <tr
                            key={v._id}
                            className={!v._kept ? "bg-destructive/5 opacity-60" : "hover:bg-muted/30"}
                          >
                            <td className="px-3 py-1.5">
                              <Input
                                value={v.lemma}
                                onChange={(e) => updateVocab(v._id, { lemma: e.target.value })}
                                disabled={!v._kept}
                                className="h-8"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <Input
                                value={v.translation}
                                onChange={(e) => updateVocab(v._id, { translation: e.target.value })}
                                disabled={!v._kept}
                                className="h-8"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <select
                                value={v.pos}
                                onChange={(e) =>
                                  updateVocab(v._id, { pos: e.target.value as ParsedVocab["pos"] })
                                }
                                disabled={!v._kept}
                                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                              >
                                {POS_OPTIONS.map((p) => (
                                  <option key={p} value={p}>
                                    {p}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleVocab(v._id)}
                                aria-label={v._kept ? "Discard" : "Restore"}
                              >
                                {v._kept ? (
                                  <X className="h-4 w-4 text-destructive" />
                                ) : (
                                  <Check className="h-4 w-4 text-success" />
                                )}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Grammar */}
      {grammar.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Grammar rules ({keptGrammarCount}/{grammar.length})</CardTitle>
            <CardDescription>Each rule becomes a flashcard and a lesson page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {grammar.map((g) => (
              <div
                key={g._id}
                className={`rounded-lg border p-3 ${!g._kept ? "bg-destructive/5 opacity-60" : "bg-card"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{g.title}</p>
                    <p className="text-xs text-muted-foreground">{g.category} · {g.examples.length} examples</p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {g.explanation_md.slice(0, 200)}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => toggleGrammar(g._id)}>
                    {g._kept ? <X className="h-4 w-4 text-destructive" /> : <Check className="h-4 w-4 text-success" />}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Sticky footer */}
      <div className="sticky bottom-0 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Importing <span className="font-medium text-foreground">{keptVocabCount}</span> vocab and{" "}
            <span className="font-medium text-foreground">{keptGrammarCount}</span> grammar rules.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel} disabled={committing}>
              Cancel
            </Button>
            <Button
              onClick={handleCommit}
              disabled={committing || (keptVocabCount === 0 && keptGrammarCount === 0)}
            >
              {committing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing…
                </>
              ) : (
                "Confirm import"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function stripMeta<T extends { _id: number; _kept: boolean }>(row: T): Omit<T, "_id" | "_kept"> {
  // Spread + delete is cheaper to reason about than destructuring with unused
  // bindings (and avoids ESLint's no-unused-vars firing on the wizard).
  const copy = { ...row } as Partial<T>;
  delete copy._id;
  delete copy._kept;
  return copy as Omit<T, "_id" | "_kept">;
}

// ---------------------------------------------------------------------------
// Done stage
// ---------------------------------------------------------------------------
function DoneStage() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10">
          <Check className="h-6 w-6 text-success" />
        </div>
        <p className="text-lg font-semibold">Import complete</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Your library is updated. Head to the dashboard to start studying — flashcards
          have been generated for every entry.
        </p>
        <div className="mt-2 flex gap-2">
          <a className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" href="/admin">
            View library
          </a>
          <a className="rounded-md border px-4 py-2 text-sm font-medium" href="/study">
            Start studying
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
