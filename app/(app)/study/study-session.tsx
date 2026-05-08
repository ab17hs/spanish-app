"use client";

/**
 * Study session controller.
 *
 * State machine per card:
 *   1. PROMPT  — show the question, capture input (or "show answer" for grammar)
 *   2. REVEAL  — show expected answer, allow self-correct override
 *   3. GRADED  — fade out, advance to next card
 *
 * Persistence: every grade fires `gradeCardAction` so the SRS state is updated
 * server-side immediately. The client tracks a local tally for the summary
 * screen without re-fetching.
 *
 * Animations are CSS keyframes — no Framer Motion dependency at runtime, just
 * Tailwind transition utilities.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Volume2, ArrowRight, Check, X, Trophy, Clock, Target, RotateCcw, Flame, Snowflake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { matchAnswer } from "@/lib/utils/fuzzy-match";
import { startSession, gradeCardAction, endSession } from "./actions";
import type { QueueCard } from "@/lib/srs/queue";
import type { StreakResult } from "@/lib/streaks/update";

type Phase = "prompt" | "reveal" | "transitioning";

interface SessionStats {
  correct: number;
  incorrect: number;
  cards_seen: number;
}

export function StudySession({ queue }: { queue: QueueCard[] }) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("prompt");
  const [userAnswer, setUserAnswer] = useState("");
  const [matchKind, setMatchKind] = useState<"exact" | "accent" | "typo" | "none" | null>(null);
  const [stats, setStats] = useState<SessionStats>({ correct: 0, incorrect: 0, cards_seen: 0 });
  const [done, setDone] = useState(false);
  const [streak, setStreak] = useState<StreakResult | null>(null);
  const [prevStreak, setPrevStreak] = useState<number | null>(null);
  const startedAt = useRef<number>(Date.now());
  const cardStartedAt = useRef<number>(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  const card = queue[index];

  // Start a session row when the user mounts the page. We don't await — the
  // grading actions tolerate a missing session_id by falling back to error.
  useEffect(() => {
    let cancelled = false;
    startSession({ kind: "study" }).then((r) => {
      if (!cancelled && r.ok && r.data) setSessionId(r.data.session_id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Whenever we move to a new card, reset state + autofocus the input.
  useEffect(() => {
    setUserAnswer("");
    setMatchKind(null);
    setPhase("prompt");
    cardStartedAt.current = Date.now();
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [index]);

  const advance = useCallback(() => {
    setPhase("transitioning");
    setTimeout(() => {
      if (index + 1 >= queue.length) {
        // End the session. We fire-and-forget the action but capture the
        // returned streak info so the done screen can celebrate it.
        const duration = Math.round((Date.now() - startedAt.current) / 1000);
        endSession({
          session_id: sessionId ?? "00000000-0000-0000-0000-000000000000",
          cards_correct: stats.correct,
          cards_incorrect: stats.incorrect,
          duration_seconds: duration,
        }).then((res) => {
          if (res.ok && res.data?.streak) {
            // The "previous" streak is the new streak minus 1 if today bumped
            // it, else equal to the new value. We use it to decide whether to
            // show a celebratory "+1 day" badge vs. just the current count.
            const s = res.data.streak;
            setStreak(s);
            setPrevStreak(s.goal_met_today ? Math.max(0, s.current_streak - 1) : s.current_streak);
          }
        });
        setDone(true);
      } else {
        setIndex(index + 1);
      }
    }, 250);
  }, [index, queue.length, sessionId, stats.correct, stats.incorrect]);

  const submitGrade = useCallback(
    async (isCorrect: boolean) => {
      if (!card) return;
      const ms = Date.now() - cardStartedAt.current;
      setStats((s) => ({
        correct: s.correct + (isCorrect ? 1 : 0),
        incorrect: s.incorrect + (isCorrect ? 0 : 1),
        cards_seen: s.cards_seen + 1,
      }));
      if (sessionId) {
        await gradeCardAction({
          session_id: sessionId,
          card_id: card.card_id,
          is_correct: isCorrect,
          user_answer: userAnswer || null,
          expected_answer: getExpected(card),
          ms_to_answer: ms,
        });
      }
      advance();
    },
    [card, sessionId, userAnswer, advance],
  );

  // Reveal handler — for vocab cards we run the matcher, for grammar we just
  // flip the card and let the user self-grade.
  const handleReveal = useCallback(() => {
    if (!card) return;
    if (card.kind === "grammar") {
      setPhase("reveal");
      return;
    }
    const expected = getExpected(card);
    const m = matchAnswer(userAnswer, expected, []);
    setMatchKind(m.kind === "alt" ? "exact" : m.kind);
    setPhase("reveal");
  }, [card, userAnswer]);

  // Keyboard: Enter advances through the phases.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      if (phase === "prompt") {
        e.preventDefault();
        handleReveal();
      } else if (phase === "reveal") {
        e.preventDefault();
        // Default = the matcher's verdict (exact/accent/typo => correct).
        if (card?.kind === "grammar") return; // grammar requires explicit grade
        submitGrade(matchKind !== null && matchKind !== "none");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, handleReveal, submitGrade, matchKind, card]);

  if (done) {
    return (
      <DoneScreen
        stats={stats}
        duration={Math.round((Date.now() - startedAt.current) / 1000)}
        onRestart={() => router.refresh()}
        streak={streak}
        prevStreak={prevStreak}
      />
    );
  }

  if (!card) return null;

  const progressPct = ((index + (phase === "reveal" ? 0.5 : 0)) / queue.length) * 100;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="border-b px-5 py-3">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            Card {index + 1} of {queue.length}
          </span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Check className="h-3 w-3 text-success" /> {stats.correct}
            </span>
            <span className="flex items-center gap-1">
              <X className="h-3 w-3 text-destructive" /> {stats.incorrect}
            </span>
          </div>
        </div>
        <Progress value={progressPct} className="mt-2 h-1.5" />
      </div>

      {/* Card */}
      <div className={`p-6 transition-all duration-200 ${phase === "transitioning" ? "opacity-0 -translate-y-2" : ""}`}>
        {card.kind === "grammar" ? (
          <GrammarCard card={card} phase={phase} />
        ) : (
          <VocabCard
            card={card}
            phase={phase}
            userAnswer={userAnswer}
            setUserAnswer={setUserAnswer}
            matchKind={matchKind}
            inputRef={inputRef}
          />
        )}
      </div>

      {/* Action bar */}
      <div className="border-t px-5 py-4">
        {phase === "prompt" && card.kind === "grammar" ? (
          <Button className="w-full" size="lg" onClick={handleReveal}>
            Show explanation <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : phase === "prompt" ? (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setMatchKind("none");
                setPhase("reveal");
              }}
            >
              Skip
            </Button>
            <Button className="flex-1" size="lg" onClick={handleReveal} disabled={!userAnswer.trim()}>
              Check answer <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        ) : (
          // reveal phase: grade buttons
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="lg"
              className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => submitGrade(false)}
            >
              <X className="mr-2 h-4 w-4" /> Got it wrong
            </Button>
            <Button
              variant="success"
              size="lg"
              className="flex-1"
              onClick={() => submitGrade(true)}
            >
              <Check className="mr-2 h-4 w-4" /> Got it right
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vocab card: prompt + answer input + reveal panel
// ---------------------------------------------------------------------------
function VocabCard({
  card,
  phase,
  userAnswer,
  setUserAnswer,
  matchKind,
  inputRef,
}: {
  card: QueueCard;
  phase: Phase;
  userAnswer: string;
  setUserAnswer: (s: string) => void;
  matchKind: "exact" | "accent" | "typo" | "none" | null;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  const showSpanish = card.kind === "vocab_es_en";
  const prompt = showSpanish ? card.lemma! : card.translation!;
  const expected = showSpanish ? card.translation! : card.lemma!;
  const direction = showSpanish ? "ES → EN" : "EN → ES";

  const speak = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(card.lemma!);
    u.lang = "es-ES";
    u.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [card.lemma]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs">
        <Badge variant="outline">{direction}</Badge>
        <div className="flex gap-1.5">
          {card.is_weak && <Badge variant="warning">weak</Badge>}
          {card.total_reviews === 0 && <Badge variant="accent">new</Badge>}
          {card.pos && <Badge variant="secondary">{card.pos}</Badge>}
        </div>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-primary/5 to-accent/5 px-6 py-10 text-center">
        <div className="flex items-center justify-center gap-2">
          <p className="text-3xl font-semibold tracking-tight md:text-4xl">{prompt}</p>
          {showSpanish && (
            <button
              onClick={speak}
              className="rounded-full p-2 text-muted-foreground hover:bg-background hover:text-primary"
              aria-label="Pronounce"
            >
              <Volume2 className="h-5 w-5" />
            </button>
          )}
        </div>
        {phase === "reveal" && card.example_es && (
          <p className="mt-3 text-sm italic text-muted-foreground">{card.example_es}</p>
        )}
      </div>

      {phase === "prompt" ? (
        <div>
          <Input
            ref={inputRef}
            value={userAnswer}
            onChange={(e) => setUserAnswer(e.target.value)}
            placeholder={showSpanish ? "Type the English translation…" : "Type the Spanish word…"}
            className="h-12 text-base"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Press Enter to check. Accents and minor typos are forgiven.
          </p>
        </div>
      ) : (
        <RevealPanel userAnswer={userAnswer} expected={expected} matchKind={matchKind} card={card} />
      )}
    </div>
  );
}

function RevealPanel({
  userAnswer,
  expected,
  matchKind,
  card,
}: {
  userAnswer: string;
  expected: string;
  matchKind: "exact" | "accent" | "typo" | "none" | null;
  card: QueueCard;
}) {
  const verdict = matchKind === "none" || matchKind === null ? "wrong" : "right";
  const verdictMsg: Record<string, string> = {
    exact: "Exact match!",
    accent: "Right — small accent diff.",
    typo: "Right — small typo forgiven.",
    none: "That's not it.",
  };

  return (
    <div className="space-y-3">
      <div
        className={`rounded-xl border p-4 text-center transition-all ${
          verdict === "right"
            ? "border-success/40 bg-success/5"
            : "border-destructive/40 bg-destructive/5"
        }`}
      >
        <div className="flex items-center justify-center gap-2">
          {verdict === "right" ? (
            <Check className="h-5 w-5 text-success" />
          ) : (
            <X className="h-5 w-5 text-destructive" />
          )}
          <span className={`text-sm font-medium ${verdict === "right" ? "text-success" : "text-destructive"}`}>
            {matchKind ? verdictMsg[matchKind] : "—"}
          </span>
        </div>
        {userAnswer && (
          <p className="mt-2 text-sm text-muted-foreground">
            You typed: <span className="font-mono">{userAnswer}</span>
          </p>
        )}
        <p className="mt-1 text-base">
          Expected: <span className="font-semibold">{expected}</span>
        </p>
      </div>
      {card.example_en && (
        <p className="text-center text-sm text-muted-foreground">
          “{card.example_en}”
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grammar card: prompt = title, reveal = explanation + examples
// ---------------------------------------------------------------------------
function GrammarCard({ card, phase }: { card: QueueCard; phase: Phase }) {
  return (
    <div className="space-y-4">
      <Badge variant="accent">Grammar</Badge>
      <div className="rounded-2xl bg-gradient-to-br from-accent/5 to-primary/5 px-6 py-8">
        <h2 className="text-2xl font-semibold">{card.title}</h2>
        {phase === "reveal" && (
          <div className="mt-4 space-y-3">
            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed">
              {card.explanation_md}
            </div>
            {card.examples && card.examples.length > 0 && (
              <div className="space-y-1.5 border-t pt-3">
                {card.examples.map((ex, i) => (
                  <div key={i} className="flex flex-col text-sm">
                    <span className="font-medium">{ex.es}</span>
                    <span className="text-muted-foreground">{ex.en}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Done screen
// ---------------------------------------------------------------------------
function DoneScreen({
  stats,
  duration,
  onRestart,
  streak,
  prevStreak,
}: {
  stats: SessionStats;
  duration: number;
  onRestart: () => void;
  streak: StreakResult | null;
  prevStreak: number | null;
}) {
  const accuracy = stats.cards_seen > 0 ? Math.round((stats.correct / stats.cards_seen) * 100) : 0;
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  const tier =
    accuracy >= 90 ? { label: "Excellent", color: "text-success" } :
    accuracy >= 70 ? { label: "Solid", color: "text-primary" } :
    accuracy >= 50 ? { label: "Keep going", color: "text-warning-foreground" } :
                     { label: "Tough one", color: "text-destructive" };

  return (
    <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-success/10">
        <Trophy className="h-7 w-7 text-success" />
      </div>
      <div>
        <p className={`text-2xl font-semibold ${tier.color}`}>{tier.label}</p>
        <p className="text-muted-foreground">Session complete.</p>
      </div>
      <div className="grid w-full max-w-sm grid-cols-3 gap-3 pt-2">
        <Stat icon={<Target className="h-4 w-4" />} label="Accuracy" value={`${accuracy}%`} />
        <Stat icon={<Check className="h-4 w-4" />} label="Cards" value={String(stats.cards_seen)} />
        <Stat icon={<Clock className="h-4 w-4" />} label="Time" value={`${minutes}:${String(seconds).padStart(2, "0")}`} />
      </div>
      {streak && <StreakBanner streak={streak} prevStreak={prevStreak} />}
      <div className="mt-4 flex gap-2">
        <Button variant="outline" onClick={onRestart}>
          <RotateCcw className="mr-2 h-4 w-4" /> Another round
        </Button>
        <Button asChild>
          <a href="/dashboard">Back to dashboard</a>
        </Button>
      </div>
    </div>
  );
}

/**
 * Compact streak callout shown after the session ends. Three states:
 *   - goal met today + streak grew  → "🔥 N-day streak! +1 day"
 *   - goal met today + freeze used  → "❄️ Freeze used, streak preserved"
 *   - goal not met yet              → progress bar to today's goal
 */
function StreakBanner({
  streak,
  prevStreak,
}: {
  streak: StreakResult;
  prevStreak: number | null;
}) {
  const grew = streak.goal_met_today && prevStreak != null && streak.current_streak > prevStreak;
  const goalPct = Math.min(100, Math.round((streak.events_today / Math.max(1, streak.daily_goal)) * 100));

  if (streak.used_freeze) {
    return (
      <div className="flex w-full max-w-sm items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 text-left">
        <Snowflake className="h-5 w-5 shrink-0 text-primary" />
        <div className="text-sm">
          <p className="font-medium">Freeze used — streak preserved</p>
          <p className="text-xs text-muted-foreground">
            {streak.current_streak}-day streak intact. One freeze per week.
          </p>
        </div>
      </div>
    );
  }

  if (streak.goal_met_today) {
    return (
      <div className="flex w-full max-w-sm items-center gap-3 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-left">
        <Flame className="h-5 w-5 shrink-0 text-warning-foreground" />
        <div className="flex-1 text-sm">
          <p className="font-medium">
            {streak.current_streak}-day streak{grew && <span className="ml-2 text-xs text-success">+1 day</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            Daily goal met ({streak.events_today}/{streak.daily_goal} cards).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-1.5 rounded-lg border bg-card px-4 py-3 text-left">
      <div className="flex items-center justify-between text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <Target className="h-3.5 w-3.5 text-muted-foreground" />
          Today's goal
        </span>
        <span className="text-xs text-muted-foreground">
          {streak.events_today}/{streak.daily_goal}
        </span>
      </div>
      <Progress value={goalPct} className="h-1.5" />
      <p className="text-xs text-muted-foreground">
        {Math.max(0, streak.daily_goal - streak.events_today)} more to keep your{" "}
        {streak.current_streak}-day streak alive.
      </p>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
        {icon} {label}
      </div>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getExpected(card: QueueCard): string {
  if (card.kind === "vocab_es_en") return card.translation ?? "";
  if (card.kind === "vocab_en_es") return card.lemma ?? "";
  return card.title ?? "";
}
