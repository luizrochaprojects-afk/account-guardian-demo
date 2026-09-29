import { lazy } from "react";

// Centralized lazy route imports. Both App.tsx (route definitions) and
// AppSidebar.tsx (hover/idle prefetch) import from here so the prefetched
// chunk request and the actual route load share the same import promise.

export const routeImporters = {
  dashboard: () => import("./pages/Dashboard"),
  allAccounts: () => import("./pages/AllAccounts"),
  accountWorkspace: () => import("./pages/AccountWorkspace"),
  tasks: () => import("./pages/Tasks"),
  healthConfig: () => import("./pages/HealthConfig"),
  about: () => import("./pages/About"),
} as const;

export type RouteKey = keyof typeof routeImporters;

// React.lazy components — cached so re-creating the route tree reuses chunks.
export const Dashboard = lazy(routeImporters.dashboard);
export const AllAccounts = lazy(routeImporters.allAccounts);
export const AccountWorkspace = lazy(routeImporters.accountWorkspace);
export const Tasks = lazy(routeImporters.tasks);
export const HealthConfig = lazy(routeImporters.healthConfig);
export const About = lazy(routeImporters.about);

// Map URL path -> route importer key, used by sidebar hover prefetch.
export const PATH_TO_ROUTE_KEY: Record<string, RouteKey> = {
  "/dashboard": "dashboard",
  "/accounts": "allAccounts",
  "/tasks": "tasks",
  "/health-config": "healthConfig",
  "/about": "about",
};

// In-flight prefetch tracking so we never double-import the same chunk.
const prefetched = new Set<RouteKey>();
export function prefetchRoute(key: RouteKey) {
  if (prefetched.has(key)) return;
  prefetched.add(key);
  // Fire and forget. Errors will surface naturally when the user navigates.
  routeImporters[key]().catch(() => {
    prefetched.delete(key);
  });
}

export function prefetchRouteByPath(path: string) {
  const key = PATH_TO_ROUTE_KEY[path];
  if (key) prefetchRoute(key);
}
