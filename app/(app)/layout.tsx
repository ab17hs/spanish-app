import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { TopBar } from "@/components/layout/top-bar";
import { ServiceWorkerRegister } from "@/components/layout/sw-register";
import { OfflineBanner } from "@/components/layout/offline-banner";

// Server-side auth gate for the entire (app) route group. Anyone hitting
// /dashboard, /study, /admin, etc. without a session gets bounced to /login.
// Replaces middleware-based redirect logic.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-svh">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <OfflineBanner />
        {/* @ts-expect-error Async Server Component */}
        <TopBar />
        <main className="flex-1 pb-16 md:pb-0">{children}</main>
      </div>
      <MobileNav />
      <ServiceWorkerRegister />
    </div>
  );
}
