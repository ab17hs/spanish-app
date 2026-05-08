"use client";

/**
 * Service-worker registration. Mounted once at the app root inside the
 * authenticated layout. We register on `load` so it doesn't compete with
 * the initial paint, and skip in development (Next's HMR doesn't play
 * well with cached chunks).
 *
 * Listens for `controllerchange` to surface a soft "new version available"
 * toast — the new SW takes over on the next navigation, so we don't force
 * a reload, just hint at it.
 */

import { useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";

export function ServiceWorkerRegister() {
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          // Detect a waiting/installed SW that wants to take over.
          if (reg.waiting) {
            toast({
              title: "Update available",
              description: "A new version is ready. It'll activate on your next page load.",
            });
          }
          reg.addEventListener("updatefound", () => {
            const installing = reg.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              if (installing.state === "installed" && navigator.serviceWorker.controller) {
                toast({
                  title: "Update available",
                  description: "A new version is ready. It'll activate on your next page load.",
                });
              }
            });
          });
        })
        .catch((err) => {
          // Failure isn't fatal — the app still works without the SW.
          console.warn("SW register failed:", err);
        });
    };

    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });

    return () => window.removeEventListener("load", onLoad);
  }, [toast]);

  return null;
}
