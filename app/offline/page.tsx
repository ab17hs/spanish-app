import Link from "next/link";
import { CloudOff, RefreshCw } from "lucide-react";

export const metadata = { title: "Offline" };

/**
 * /offline — fallback rendered by the service worker when a navigation fails
 * and we have no cached copy. Static, no auth, no data fetch — just a hint
 * that connectivity is needed and a couple of links to the most-likely-cached
 * pages so the user has somewhere to land once they're back online.
 */
export default function OfflinePage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <CloudOff className="h-7 w-7 text-muted-foreground" />
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">You're offline</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The page you tried to open isn't cached. Reconnect and try again — your progress so far
          is safe.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
        >
          Try dashboard
        </Link>
        <Link
          href="/study"
          className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
        >
          Try study
        </Link>
        <a
          href="/"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </a>
      </div>
    </div>
  );
}
