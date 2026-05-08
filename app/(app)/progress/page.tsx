import Link from "next/link";
import { Activity, Clock, Target, Award, BookOpen, ArrowRight } from "lucide-react";
import { getProgressData } from "@/lib/stats/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ActivityChart } from "./activity-chart";

export const metadata = { title: "Progress" };

/**
 * /progress — 30-day activity, topic mastery breakdown, weakness drilldown.
 */
export default async function ProgressPage() {
  const d = await getProgressData();
  if (!d) return null;
  const overallMastery =
    d.totals.cards_total === 0
      ? 0
      : Math.round((d.totals.cards_mastered / d.totals.cards_total) * 100);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Progress</h1>
        <p className="text-muted-foreground">Your last 30 days of study.</p>
      </div>

      {/* Headline numbers */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Headline icon={<Activity className="h-5 w-5 text-primary" />} label="Reviews" value={d.totals.reviews_30d.toLocaleString()} sub="last 30 days" />
        <Headline icon={<Target className="h-5 w-5 text-success" />} label="Accuracy" value={`${d.totals.accuracy_30d}%`} sub="across all reviews" />
        <Headline icon={<Clock className="h-5 w-5 text-accent" />} label="Time" value={`${d.totals.minutes_30d}m`} sub="active study" />
        <Headline icon={<Award className="h-5 w-5 text-warning-foreground" />} label="Mastery" value={`${overallMastery}%`} sub={`${d.totals.cards_mastered}/${d.totals.cards_total} cards`} />
      </div>

      {/* Activity chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Daily activity</CardTitle>
          <CardDescription>Reviews per day with accuracy color.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActivityChart data={d.daily_activity} />
        </CardContent>
      </Card>

      {/* Topic mastery */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Topic mastery</CardTitle>
          <CardDescription>
            Cards reach <span className="font-medium">mastered</span> at the 21-day interval.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {d.topic_mastery.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No topic data yet — review some cards to populate this view.
            </p>
          ) : (
            <ul className="space-y-3">
              {d.topic_mastery.map((t) => (
                <li key={t.topic_id} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border"
                      style={{ backgroundColor: t.topic_color ?? "#a3a3a3" }}
                    />
                    <span className="font-medium">{t.topic_name}</span>
                    <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      {t.unseen > 0 && <Badge variant="outline">{t.unseen} new</Badge>}
                      <Badge variant="accent">{t.learning} learning</Badge>
                      <Badge variant="success">{t.mastered} mastered</Badge>
                      <span className="ml-1 font-medium text-foreground">{t.pct_mastered}%</span>
                    </span>
                  </div>
                  <MasteryBar
                    mastered={t.mastered}
                    learning={t.learning}
                    unseen={t.unseen}
                    total={t.total}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Weak cards */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Weak spots</CardTitle>
            <CardDescription>Cards under 70% accuracy. These bubble up first in study sessions.</CardDescription>
          </div>
          {d.weak_cards.length > 0 && (
            <Link
              href="/study?kind=all"
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              Drill weak cards <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </CardHeader>
        <CardContent>
          {d.weak_cards.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/5 p-4 text-sm">
              <BookOpen className="h-4 w-4 text-success" />
              <span>No weak cards. You're keeping up — keep going.</span>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Prompt</th>
                    <th className="px-3 py-2 text-left">Answer</th>
                    <th className="px-3 py-2 text-right">Hits</th>
                    <th className="px-3 py-2 text-right">Misses</th>
                    <th className="px-3 py-2 text-right">Accuracy</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {d.weak_cards.map((c) => (
                    <tr key={c.card_id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{c.prompt}</td>
                      <td className="px-3 py-2 text-muted-foreground">{c.expected}</td>
                      <td className="px-3 py-2 text-right text-success">{c.hits}</td>
                      <td className="px-3 py-2 text-right text-destructive">{c.misses}</td>
                      <td className="px-3 py-2 text-right">
                        <Badge variant={c.accuracy < 50 ? "destructive" : "warning"}>{c.accuracy}%</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Headline({
  icon, label, value, sub,
}: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <div>{icon}</div>
        <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

function MasteryBar({ mastered, learning, unseen, total }: { mastered: number; learning: number; unseen: number; total: number }) {
  const m = (mastered / total) * 100;
  const l = (learning / total) * 100;
  const u = (unseen / total) * 100;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className="bg-success transition-all" style={{ width: `${m}%` }} />
      <div className="bg-accent transition-all" style={{ width: `${l}%` }} />
      <div className="bg-muted-foreground/30 transition-all" style={{ width: `${u}%` }} />
    </div>
  );
}
