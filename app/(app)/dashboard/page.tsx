import Link from "next/link";
import {
  Flame, Sparkles, Brain, Target, BookOpen, Clock, Trophy, ArrowRight,
} from "lucide-react";
import { getDashboardData } from "@/lib/stats/dashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const d = await getDashboardData();
  if (!d) return null;

  const goalProgress = Math.min(100, Math.round((d.reviews_today / d.daily_goal) * 100));
  const greet = greeting();
  const isStreakActive = streakIsActive(d.last_completed_date);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      {/* Hero */}
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{greet}</p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          {d.display_name ? `Hola, ${d.display_name}` : "Hola"} <span aria-hidden>👋</span>
        </h1>
      </div>

      {/* Big CTA + streak */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-card to-accent/5">
          <CardHeader>
            <CardDescription>Today's session</CardDescription>
            <CardTitle className="text-2xl">
              {d.cards_due_now > 0
                ? `${d.cards_due_now} card${d.cards_due_now === 1 ? "" : "s"} due`
                : d.cards_new > 0
                ? `${Math.min(d.cards_new, 8)} new card${d.cards_new === 1 ? "" : "s"} ready`
                : "You're all caught up"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Daily goal: {d.reviews_today}/{d.daily_goal} reviews
                </span>
                <span className="font-medium text-primary">{goalProgress}%</span>
              </div>
              <Progress value={goalProgress} className="h-2" />
            </div>
            <Link
              href="/study"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-md active:scale-[0.98]"
            >
              <Sparkles className="h-4 w-4" />
              Start studying
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>

        <Card className={`${isStreakActive ? "border-warning/40" : ""}`}>
          <CardHeader>
            <CardDescription>Streak</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Flame
                className={`h-7 w-7 ${
                  d.current_streak === 0 ? "text-muted-foreground" :
                  d.current_streak < 7 ? "text-warning-foreground" :
                  "text-orange-500"
                }`}
              />
              {d.current_streak} day{d.current_streak === 1 ? "" : "s"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <span>Longest: <span className="font-medium text-foreground">{d.longest_streak}</span> days</span>
              {!isStreakActive && d.current_streak > 0 && (
                <span className="text-warning-foreground">Don't lose it — review today!</span>
              )}
              {d.current_streak === 0 && <span>Start a streak today.</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<BookOpen className="h-5 w-5 text-primary" />}
          label="Vocab"
          value={d.total_vocab.toLocaleString()}
          sub={`${d.total_grammar} grammar rules`}
        />
        <StatCard
          icon={<Brain className="h-5 w-5 text-accent" />}
          label="Cards in flight"
          value={d.total_cards.toLocaleString()}
          sub={`${d.cards_new} not yet seen`}
        />
        <StatCard
          icon={<Target className="h-5 w-5 text-warning-foreground" />}
          label="Weak spots"
          value={d.weakness_count.toString()}
          sub={d.weakness_count === 0 ? "no weaknesses tracked" : "cards needing attention"}
        />
        <StatCard
          icon={<Trophy className="h-5 w-5 text-success" />}
          label="Estimated level"
          value={d.estimated_level ?? "—"}
          sub={d.estimated_level ? "from final exam" : "take the exam to estimate"}
          link={d.estimated_level ? "/progress" : "/exam"}
        />
      </div>

      {/* Activity heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Last 14 days</CardTitle>
          <CardDescription>Reviews per day, color by accuracy.</CardDescription>
        </CardHeader>
        <CardContent>
          <Heatmap days={d.daily_activity} />
        </CardContent>
      </Card>

      {/* Quick links */}
      <div className="grid gap-3 sm:grid-cols-3">
        <QuickLink href="/grammar" label="Grammar lessons" sub="Browse all rules" />
        <QuickLink href="/reading" label="Reading practice" sub="AI-generated passages" />
        <QuickLink href="/exam" label="Final exam" sub="Estimate your CEFR" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function StatCard({
  icon, label, value, sub, link,
}: { icon: React.ReactNode; label: string; value: string; sub: string; link?: string }) {
  const inner = (
    <Card className={link ? "transition-all hover:border-primary/30 hover:shadow-md" : ""}>
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="flex items-center justify-between">
          {icon}
        </div>
        <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
  if (link) return <Link href={link}>{inner}</Link>;
  return inner;
}

function QuickLink({ href, label, sub }: { href: string; label: string; sub: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-sm"
    >
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}

function Heatmap({ days }: { days: Array<{ date: string; reviews: number; correct: number }> }) {
  const max = Math.max(1, ...days.map((d) => d.reviews));

  const cell = (d: { date: string; reviews: number; correct: number }) => {
    if (d.reviews === 0) return "bg-muted";
    const accuracy = d.correct / d.reviews;
    const intensity = Math.min(1, d.reviews / max);
    if (accuracy >= 0.85) return `bg-success`;
    if (accuracy >= 0.6) return `bg-primary`;
    return `bg-warning`;
    // intensity used as opacity below
  };

  return (
    <div className="flex items-end gap-1.5 overflow-x-auto py-2">
      {days.map((d) => {
        const intensity = d.reviews === 0 ? 0.3 : 0.4 + 0.6 * Math.min(1, d.reviews / Math.max(1, max));
        return (
          <div
            key={d.date}
            className="flex flex-col items-center gap-1"
            title={`${d.date}: ${d.reviews} reviews · ${d.correct}/${d.reviews} correct`}
          >
            <div
              className={`h-12 w-7 rounded-md ${cell(d)}`}
              style={{ opacity: intensity }}
              aria-label={`${d.date} ${d.reviews} reviews`}
            />
            <span className="text-[10px] text-muted-foreground">
              {new Date(d.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "narrow" })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Late one — couldn't sleep?";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function streakIsActive(lastDate: string | null) {
  if (!lastDate) return false;
  const last = new Date(lastDate + "T00:00:00").getTime();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.floor((today.getTime() - last) / 86_400_000);
  return days <= 1;
}
