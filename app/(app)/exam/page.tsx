import Link from "next/link";
import { Trophy, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StartExamButton } from "./start-button";

export const metadata = { title: "Final Exam" };

/**
 * /exam — landing page. Shows past attempts (descending) and a CTA to start
 * a new exam. The CTA is its own client component because it kicks off a
 * Claude call and redirects after a few seconds.
 */
export default async function ExamPage() {
  const supabase = await createClient();
  const [profileResp, attemptsResp] = await Promise.all([
    supabase.from("profiles").select("estimated_level, estimated_level_sub, last_exam_at").maybeSingle(),
    supabase
      .from("exam_attempts")
      .select("id, started_at, completed_at, total_score, cefr_level, cefr_sub")
      .order("started_at", { ascending: false })
      .limit(20),
  ]);

  const profile = profileResp.data;
  const attempts = attemptsResp.data ?? [];

  // Surface any "in progress" attempt so the user can resume.
  const inProgress = attempts.find((a) => !a.completed_at) ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Final Exam</h1>
        <p className="text-muted-foreground">
          A four-part test (translation, conversation, grammar, listening) graded by Claude. Take it to
          calibrate your level — or to feel the satisfaction of moving up one.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="text-lg">Your current estimate</CardTitle>
            <CardDescription>
              {profile?.last_exam_at
                ? `Last calibrated ${new Date(profile.last_exam_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}`
                : "Not yet calibrated. Take an exam when you're ready."}
            </CardDescription>
          </div>
          <div className="text-right">
            {profile?.estimated_level ? (
              <div className="flex items-baseline justify-end gap-1">
                <span className="text-3xl font-semibold tracking-tight">{profile.estimated_level}</span>
                {profile.estimated_level_sub != null && (
                  <span className="text-base text-muted-foreground">.{profile.estimated_level_sub}</span>
                )}
              </div>
            ) : (
              <Badge variant="outline">unknown</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {inProgress ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/5 p-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 text-warning-foreground" />
                <div>
                  <p className="font-medium">You have an exam in progress</p>
                  <p className="text-xs text-muted-foreground">
                    Started{" "}
                    {new Date(inProgress.started_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
              <Link
                href={`/exam/${inProgress.id}`}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Resume <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Trophy className="h-5 w-5 text-primary" />
                <span>~10 minutes. Allow yourself one focused sitting.</span>
              </div>
              <StartExamButton />
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <div>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Exam history
        </h2>
        {attempts.filter((a) => a.completed_at).length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No completed exams yet. Take your first to start tracking your level over time.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y">
                {attempts
                  .filter((a) => a.completed_at)
                  .map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/exam/${a.id}/results`}
                        className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30"
                      >
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">
                            {a.cefr_level}
                            {a.cefr_sub != null ? `.${a.cefr_sub}` : ""}
                            <span className="ml-2 text-sm font-normal text-muted-foreground">
                              {a.total_score != null ? `${Math.round(Number(a.total_score))}/100` : "—"}
                            </span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(a.completed_at!).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
