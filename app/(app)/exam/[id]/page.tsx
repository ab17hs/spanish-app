import { notFound, redirect } from "next/navigation";
import { getExam } from "@/lib/exam/orchestrate";
import { ExamRunner } from "./exam-runner";

export const metadata = { title: "Exam in progress" };

/**
 * /exam/[id] — the exam itself. Server component just fetches the questions
 * row and hands off to the runner. If the attempt is already completed, we
 * redirect to its results — no point letting users overwrite a finished
 * grading.
 */
export default async function ExamRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const attempt = await getExam(id);
  if (!attempt) notFound();
  if (attempt.completed_at) redirect(`/exam/${id}/results`);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8">
      <ExamRunner id={attempt.id} questions={attempt.questions} />
    </div>
  );
}
