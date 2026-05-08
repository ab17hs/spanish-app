"use client";

/**
 * Start-exam CTA. Calls the server action that generates fresh questions
 * (smart-model Claude call, ~6–12s wall time), then redirects.
 *
 * UX note: the loading state is intentionally informative — the wait is
 * long enough that the user needs reassurance something is happening.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { startExamAction } from "./actions";

export function StartExamButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);

  const click = () => {
    if (!confirmed) {
      setConfirmed(true);
      return;
    }
    startTransition(async () => {
      const r = await startExamAction();
      if (!r.ok) {
        toast({
          title: "Couldn't start exam",
          description: r.error,
          variant: "destructive",
        });
        return;
      }
      if (r.data?.id) router.push(`/exam/${r.data.id}`);
    });
  };

  if (pending) {
    return (
      <Button disabled className="cursor-progress">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Generating exam…
      </Button>
    );
  }

  return (
    <Button onClick={click}>
      <Trophy className="mr-2 h-4 w-4" />
      {confirmed ? "Confirm start" : "Start new exam"}
    </Button>
  );
}
