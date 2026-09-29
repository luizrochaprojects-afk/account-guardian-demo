import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import NotFound from "./pages/NotFound";
import { HealthConfigProvider } from "./contexts/HealthConfigContext";
import { AccountsProvider } from "./contexts/AccountsContext";
import { AppLayout } from "./components/AppLayout";
import { AccountWorkspace, AllAccounts, Tasks, HealthConfig, Dashboard, About } from "./routes";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      placeholderData: (prev: any) => prev,
    },
  },
});

// The demo has no sign-in: AuthProvider hands every visitor the same fictional
// user, and the in-memory database (src/demo) is already seeded when the first
// query runs. The production app wraps this layout in AuthGuard + OrgGuard.
function ShellLayout() {
  return (
    <AccountsProvider>
      {/*
        No Suspense here — AppLayout owns its own Suspense around
        <Outlet /> so the sidebar/header stay mounted while route
        chunks load. Wrapping above AppLayout would unmount the shell.
      */}
      <AppLayout />
    </AccountsProvider>
  );
}

/**
 * Wraps a route element with HealthConfigProvider so its queries only run
 * when the user is actually on a page that consumes health config data.
 */
function HealthScoped({ children }: { children: React.ReactNode }) {
  return <HealthConfigProvider>{children}</HealthConfigProvider>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <RouteErrorBoundary>
            <Routes>
              <Route element={<ShellLayout />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<HealthScoped><Dashboard /></HealthScoped>} />
                <Route path="/accounts" element={<AllAccounts />} />
                <Route path="/account/:id" element={<HealthScoped><AccountWorkspace /></HealthScoped>} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/health-config" element={<HealthScoped><HealthConfig /></HealthScoped>} />
                <Route path="/about" element={<About />} />
                {/* Inside the shell, so a wrong URL still shows the sidebar and
                    the demo banner rather than a dead end. */}
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </RouteErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
