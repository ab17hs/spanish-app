"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  GraduationCap,
  BookOpen,
  Sparkles,
  ScrollText,
  Trophy,
  Settings,
  PencilRuler,
  Library,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/study", label: "Study", icon: GraduationCap, accent: true },
  { href: "/grammar", label: "Grammar", icon: PencilRuler },
  { href: "/reading", label: "Reading", icon: BookOpen },
  { href: "/story", label: "Stories", icon: Sparkles },
  { href: "/progress", label: "Progress", icon: ScrollText },
  { href: "/exam", label: "Final Exam", icon: Trophy },
  { href: "/admin", label: "Library", icon: Library },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const path = usePathname();

  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:bg-card/50 md:backdrop-blur">
      <div className="flex h-16 items-center gap-2 border-b px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
        <span className="font-semibold tracking-tight">Spanish</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const Icon = item.icon;
          const active = path === item.href || path.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                item.accent && !active && "text-foreground",
              )}
            >
              <Icon
                className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
