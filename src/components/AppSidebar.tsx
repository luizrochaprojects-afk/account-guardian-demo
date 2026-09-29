import {
  LayoutDashboard, LayoutGrid, Users, ListChecks, HeartPulse, ChevronRight,
  Building2, ChevronsUpDown, Settings2, Inbox, Info, RotateCcw,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { db } from "@/demo/db";
import { resetDemo } from "@/demo/store";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/contexts/AuthContext";
import { accountsListQueryKey, fetchAccountsList } from "@/contexts/AccountsContext";
import { ProfileEditDialog } from "@/components/ProfileEditDialog";
import { prefetchRoute, prefetchRouteByPath } from "@/routes";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// One dashboard, ungated.
const dashboardItem = { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard };

// The pipeline board and the agent inbox are both views of AllAccounts rather
// than dedicated routes — they already fully exist there (AccountsPipelineView,
// AccountsInboxView), so we avoid re-wiring accounts fetch/state into
// standalone pages. Each deep-links into its `view=` mode.
const viewItems = [
  { title: "Pipeline", url: "/accounts?view=pipeline", view: "pipeline", icon: LayoutGrid },
  { title: "Agent inbox", url: "/accounts?view=inbox", view: "inbox", icon: Inbox },
];

const navGroups = [
  {
    label: "Customers",
    items: [
      { title: "Accounts", url: "/accounts", icon: Users },
      { title: "Issues", url: "/tasks", icon: ListChecks },
    ],
  },
  {
    label: "Settings",
    items: [
      { title: "Health Score", url: "/health-config", icon: HeartPulse },
      { title: "About this demo", url: "/about", icon: Info },
    ],
  },
];

type NavItem = (typeof navGroups)[number]["items"][number];

export function AppSidebar() {
  const location = useLocation();
  const currentPath = location.pathname;
  const { state, isMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const activeView = new URLSearchParams(location.search).get("view");
  const isViewActive = (view: string) => currentPath === "/accounts" && activeView === view;
  // /accounts is also the base of the pipeline and inbox views, so the plain
  // Accounts link is only active when neither of them is.
  const isActive = (path: string) =>
    path === "/accounts"
      ? currentPath === "/accounts" && !viewItems.some((v) => v.view === activeView)
      : currentPath.startsWith(path);

  const { user } = useAuth();
  const { profile } = useProfile();

  // Collapsible nav groups. Each group opens by default only when it contains
  // the active route. Groups are controlled so the active group re-opens on
  // navigation (the shell stays mounted, so a `defaultOpen` would only fire on
  // first load). Users can still toggle any group open or closed.
  const activeGroupLabels = navGroups
    .filter((g) => g.items.some((i) => isActive(i.url)))
    .map((g) => g.label)
    .join("|");
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(["Customers", ...(activeGroupLabels ? activeGroupLabels.split("|") : [])]),
  );
  useEffect(() => {
    if (!activeGroupLabels) return;
    setOpenGroups((prev) => {
      const next = new Set(prev);
      for (const l of activeGroupLabels.split("|")) next.add(l);
      return next;
    });
  }, [activeGroupLabels]);

  const [editOpen, setEditOpen] = useState(false);
  const qc = useQueryClient();
  const orgId = profile?.organization_id;

  const [orgName, setOrgName] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState(0);

  useEffect(() => {
    if (!profile?.organization_id) return;
    const orgId = profile.organization_id;
    db.from("organizations").select("name").eq("id", orgId).single()
      .then(({ data }) => { if (data) setOrgName(data.name); });
    db.from("profiles").select("id", { count: "exact", head: true }).eq("organization_id", orgId)
      .then(({ count }) => { setMemberCount(count || 0); });
  }, [profile?.organization_id]);

  const displayName = profile?.display_name || user?.email?.split("@")[0] || "User";
  const initials = displayName.slice(0, 2).toUpperCase();

  const prefetchForRoute = (url: string) => {
    // Prefetch the route's JS chunk so the next click avoids the Suspense fallback.
    prefetchRouteByPath(url.split("?")[0]);
    if (!orgId) return;
    if (url.startsWith("/accounts")) {
      // Must use the shared accounts-list fetcher so the prefetch writes the
      // exact `{ rows, stageChangedAt }` shape AccountsContext reads.
      qc.prefetchQuery({
        queryKey: [...accountsListQueryKey(orgId)],
        queryFn: () => fetchAccountsList(orgId),
        staleTime: 30_000,
      });
    }
  };

  // Idle-time JS chunk prefetch only — no bulk data prefetching.
  useEffect(() => {
    if (!orgId) return;
    const run = () => {
      prefetchRoute("dashboard");
      prefetchRoute("allAccounts");
      prefetchRoute("accountWorkspace");
      prefetchRoute("tasks");
    };
    const ric: any = (window as any).requestIdleCallback;
    if (typeof ric === "function") {
      const handle = ric(run, { timeout: 2000 });
      return () => {
        const cic: any = (window as any).cancelIdleCallback;
        if (typeof cic === "function") cic(handle);
      };
    }
    const t = setTimeout(run, 800);
    return () => clearTimeout(t);
  }, [orgId]);

  const renderLink = (item: { title: string; url: string; icon: typeof Users }, active: boolean) => (
    <SidebarMenuItem key={item.title}>
      <SidebarMenuButton asChild isActive={active}>
        <NavLink
          to={item.url}
          className="hover:bg-muted/50"
          activeClassName={active ? "bg-muted text-primary font-medium" : undefined}
          onMouseEnter={() => prefetchForRoute(item.url)}
          onFocus={() => prefetchForRoute(item.url)}
        >
          <item.icon className="mr-2 h-4 w-4" />
          <span>{item.title}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  const renderGroup = (label: string, items: NavItem[]) => (
    <Collapsible
      key={label}
      open={openGroups.has(label)}
      onOpenChange={(o) =>
        setOpenGroups((prev) => {
          const next = new Set(prev);
          if (o) next.add(label); else next.delete(label);
          return next;
        })
      }
      className="group/collapsible"
    >
      <SidebarGroup>
        <SidebarGroupLabel asChild>
          <CollapsibleTrigger className="flex w-full items-center justify-between">
            {label}
            <ChevronRight className="h-3 w-3 text-muted-foreground transition-transform group-data-[state=open]/collapsible:rotate-90" />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => renderLink(item, isActive(item.url)))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          {orgName && (
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <div className="flex items-center gap-2 cursor-default">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-sm bg-foreground/10">
                    <Building2 className="size-4 text-foreground/70" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{orgName}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {memberCount} member{memberCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {renderLink(dashboardItem, isActive(dashboardItem.url))}
              {viewItems.map((item) => renderLink(item, isViewActive(item.view)))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {navGroups.map((g) => renderGroup(g.label, g.items))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
                    <AvatarFallback className="rounded-lg text-[10px]">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{displayName}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user?.email}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side={isMobile ? "bottom" : "right"}
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="h-8 w-8 rounded-lg">
                      {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
                      <AvatarFallback className="rounded-lg text-[10px]">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{displayName}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {user?.email}
                      </span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Settings2 className="mr-2 h-4 w-4" />
                  Edit profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => resetDemo()}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset demo data
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
        <ProfileEditDialog open={editOpen} onOpenChange={setEditOpen} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
