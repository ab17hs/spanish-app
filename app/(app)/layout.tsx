import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { TopBar } from "@/components/layout/top-bar";
import { ServiceWorkerRegister } from "@/components/layout/sw-register";
import { OfflineBanner } from "@/components/layout/offline-banner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
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
