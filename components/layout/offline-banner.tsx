"use client";

/**
 * Offline banner. Subscribes to window's online/offline events and shows a
 * small fixed strip at the top of the viewport when the browser reports
 * offline. Keeps itself dormant on the server / first paint to avoid
 * mismatches.
 *
 * We don't try to suppress in-flight requests — the rest of the app
 * tolerates failures by toasting + retrying. This is purely a heads-up.
 */

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 border-b border-warning/40 bg-warning/10 px-4 py-1.5 text-xs font-medium text-warning-foreground backdrop-blur"
    >
      <WifiOff className="h-3.5 w-3.5" />
      You're offline — your progress will sync when you reconnect.
    </div>
  );
}
