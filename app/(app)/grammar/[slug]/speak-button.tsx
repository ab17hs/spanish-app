"use client";

/**
 * Tiny TTS button for grammar examples. Uses the Web Speech API directly —
 * matches the existing pattern in study-session.tsx (es-ES, rate 0.9).
 *
 * No-ops if speechSynthesis isn't available (e.g. older browsers, SSR).
 */

import { Volume2 } from "lucide-react";
import { useCallback } from "react";

export function SpeakButton({ text }: { text: string }) {
  const speak = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "es-ES";
    u.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [text]);

  return (
    <button
      type="button"
      onClick={speak}
      className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label="Speak Spanish example"
      title="Speak"
    >
      <Volume2 className="h-3.5 w-3.5" />
    </button>
  );
}
