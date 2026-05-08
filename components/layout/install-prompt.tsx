"use client";

/**
 * Install-app card. Captures the `beforeinstallprompt` event (Chrome / Edge
 * / Brave on desktop + Android), stores the deferred prompt, and renders a
 * compact card with a single button that triggers the native install dialog.
 *
 * Hidden when:
 *   - the app is already running standalone (display-mode: standalone)
 *   - no `beforeinstallprompt` ever fired (iOS Safari, Firefox)
 *
 * On iOS we show a textual fallback explaining the Share -> Add to Home
 * Screen path, since there's no programmatic equivalent.
 */

import { useEffect, useState } from "react";
import { Apple, Download, Smartphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPromptCard() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    setStandalone(
      window.matchMedia?.("(display-mode: standalone)").matches ||
        // iOS Safari quirk:
        // @ts-expect-error legacy Apple API
        window.navigator.standalone === true,
    );
    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (standalone) return null;

  // Nothing to show if neither path is available.
  if (!deferred && !isIOS) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="h-4 w-4 text-muted-foreground" /> Install app
        </CardTitle>
        <CardDescription>
          Add Spanish Mastery to your device for fullscreen study sessions and offline access.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {deferred ? (
          <Button
            type="button"
            onClick={async () => {
              await deferred.prompt();
              const choice = await deferred.userChoice;
              if (choice.outcome === "accepted") setDeferred(null);
            }}
          >
            <Download className="mr-2 h-4 w-4" /> Install
          </Button>
        ) : (
          <p className="inline-flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            <Apple className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              On iPhone/iPad, tap the <strong>Share</strong> button in Safari, then{" "}
              <strong>Add to Home Screen</strong>.
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
