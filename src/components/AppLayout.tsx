import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Separator } from "@/components/ui/separator";
import { Outlet } from "react-router-dom";
import { Suspense, useEffect, useState } from "react";
import { RouteSkeleton } from "@/components/RouteSkeleton";
import { GlobalFetchBar } from "@/components/ui/fetch-bar";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { Search } from "lucide-react";
import { CommandPalette } from "@/components/command/CommandPalette";
import { DemoBanner } from "@/components/DemoBanner";
import { DemoTour } from "@/components/DemoTour";

interface AppLayoutProps {
  children?: React.ReactNode;
}

/**
 * AppLayout is mounted ONCE as a parent route in App.tsx and renders the
 * sidebar + header shell. Pages render via <Outlet />, so the sidebar stays
 * mounted across navigations (preserves scroll position, org block, and
 * collapsible state).
 *
 * For backwards compatibility, when used as a wrapper inside a page
 * (`<AppLayout>{children}</AppLayout>`), it acts as a passthrough since the
 * shell is already provided by the parent route.
 */
export function AppLayout({ children }: AppLayoutProps) {
  // Passthrough mode: shell already provided by the parent route layout.
  if (children !== undefined) {
    return <>{children}</>;
  }

  return <AppLayoutShell />;
}

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPod|iPad/.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
      navigator.platform ||
      navigator.userAgent,
  );

function AppLayoutShell() {
  const [cmdOpen, setCmdOpen] = useState(false);

  // Global ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <AppSidebar />
        <SidebarInset className="flex flex-col overflow-hidden">
          <DemoBanner />
          <header className="relative flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4">
            {/* Sits on the header's bottom border so every screen inherits one
                honest "revalidating" signal, instead of each surface inventing
                its own. See GlobalFetchBar for why this is not a skeleton. */}
            <GlobalFetchBar />
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <button
              type="button"
              aria-label="Search… (⌘K)"
              onClick={() => setCmdOpen(true)}
              className="flex items-center gap-1.5 h-7 rounded-sm border border-border bg-transparent px-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span>Search…</span>
              <kbd className="ml-1 pointer-events-none inline-flex h-5 select-none items-center rounded border border-border bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground">
                {isMac ? '⌘K' : 'Ctrl K'}
              </kbd>
            </button>
          </header>
          <main className="flex-1 flex flex-col overflow-hidden min-h-0">
            {/*
              Suspense lives INSIDE the shell so the sidebar + header stay
              mounted while a lazy route chunk downloads. Only this content
              area shows the skeleton during the brief swap.
            */}
            <RouteErrorBoundary>
              <Suspense fallback={<RouteSkeleton />}>
                <Outlet />
              </Suspense>
            </RouteErrorBoundary>
          </main>
        </SidebarInset>
      </div>
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
      <DemoTour />
    </SidebarProvider>
  );
}
