"use client";
import * as React from "react";
import { LogOut, Settings, User as UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function UserMenu({ email }: { email: string }) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const initial = (email || "?")[0].toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="User menu"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg">
          <div className="border-b px-3 py-2">
            <p className="truncate text-sm font-medium">{email}</p>
          </div>
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
            onClick={() => {
              setOpen(false);
              router.push("/settings");
            }}
          >
            <Settings className="h-4 w-4" /> Settings
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-muted"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
