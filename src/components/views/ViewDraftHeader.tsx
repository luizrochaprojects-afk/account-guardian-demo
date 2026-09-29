import { ReactNode, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Layers, Star } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCustomViews, type CustomView } from "@/hooks/useCustomViews";
import {
  applyFiltersToSearchParams, type AnyFilters, type ViewEntity,
} from "@/lib/viewFilters";
import { DisplayOptionsPopover } from "@/components/views/DisplayOptionsPopover";
import { cn } from "@/lib/utils";

type Mode = "draft" | "edit";

interface Props {
  entity: ViewEntity;
  /** Current live filters from the page (read-only, will be persisted on save). */
  currentFilters: AnyFilters;
  /** Optional account name lookup so the filter summary can render names. */
  accountMap?: Record<string, string>;
  /** When set, header is in EDIT mode for an existing view. */
  existingView?: CustomView | null;
  /** Called when display options change inside the Display popover.
   *  Hosts merge the patch into their own filter state. */
  onDisplayChange?: (patch: Partial<AnyFilters>) => void;
  /** Per-entity filter section rendered inside the `Filter` popover. */
  filterSlot?: ReactNode;
  /** Number of active filters (drives the badge on the Filter trigger). */
  activeFilterCount?: number;
}

const ENTITY_TABS: { value: ViewEntity; label: string; path: string }[] = [
  { value: "issues", label: "Issues", path: "/tasks" },
  { value: "projects", label: "Projects", path: "/projects" },
  { value: "accounts", label: "Accounts", path: "/accounts" },
];

export function ViewDraftHeader({
  entity, currentFilters, accountMap, existingView, onDisplayChange,
  filterSlot, activeFilterCount = 0,
}: Props) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { createView, updateView } = useCustomViews(entity);

  const mode: Mode = existingView ? "edit" : "draft";

  // Carry-over from query params lets a draft survive an entity switch
  // (we navigate to a new path; React Router unmounts the page).
  const [name, setName] = useState(existingView?.name ?? searchParams.get("name") ?? "");
  const [description, setDescription] = useState(existingView?.description ?? searchParams.get("desc") ?? "");
  const [favorite, setFavorite] = useState(existingView?.is_favorite ?? searchParams.get("fav") === "1");

  // Re-sync if the loaded view changes underneath us
  useEffect(() => {
    if (existingView) {
      setName(existingView.name);
      setDescription(existingView.description ?? "");
      setFavorite(existingView.is_favorite);
    }
  }, [existingView?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCancel = () => {
    if (mode === "draft") {
      navigate("/accounts");
    } else {
      // Drop &edit=1, keep ?view=...
      const next = new URLSearchParams(searchParams);
      next.delete("edit");
      setSearchParams(next, { replace: true });
    }
  };

  /** Switch the host page for the same draft, preserving title/desc/fav. */
  const handleEntitySwitch = (target: ViewEntity) => {
    if (mode !== "draft") return; // saved views are pinned to their entity
    if (target === entity) return;
    const path = ENTITY_TABS.find(t => t.value === target)?.path;
    if (!path) return;
    const sp = new URLSearchParams();
    sp.set("draft", "1");
    if (name) sp.set("name", name);
    if (description) sp.set("desc", description);
    if (favorite) sp.set("fav", "1");
    navigate(`${path}?${sp.toString()}`);
  };

  const persistAsNew = async () => {
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    const v = await createView.mutateAsync({
      name: name.trim(),
      description: description.trim() || null,
      entity_type: entity,
      filters: currentFilters,
      is_favorite: favorite,
    });
    // Switch URL to ?view=<id> + active filter keys, drop draft/edit
    const sp = applyFiltersToSearchParams(entity, new URLSearchParams(), currentFilters);
    sp.set("view", v.id);
    setSearchParams(sp, { replace: true });
    toast.success(mode === "draft" ? "View created" : `Saved as new view "${v.name}"`);
  };

  const persistUpdate = async () => {
    if (!existingView) return;
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    await updateView.mutateAsync({
      id: existingView.id,
      patch: {
        name: name.trim(),
        description: description.trim() || null,
        filters: currentFilters,
        is_favorite: favorite,
      },
    });
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true });
    toast.success("View updated");
  };

  return (
    <div className="shrink-0 border-b bg-background">
      {/* Row 1 — title / description / save controls */}
      <div className="flex items-start gap-3 px-6 pt-4 pb-2">
        <Layers className="h-4 w-4 text-muted-foreground mt-1.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={mode === "draft" ? "New view" : "View name"}
              className="h-7 text-base font-semibold border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
              autoFocus={mode === "draft"}
            />
            <button
              type="button"
              onClick={() => setFavorite(v => !v)}
              className="p-1 rounded-sm hover:bg-muted/50 transition-colors shrink-0"
              title={favorite ? "Remove from favorites" : "Add to favorites"}
              aria-label="Favorite"
            >
              <Star className={cn("h-3.5 w-3.5", favorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
            </button>
          </div>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="h-6 text-xs text-muted-foreground border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
          />
        </div>
        <div className="flex items-center gap-1 shrink-0 pt-0.5">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleCancel}>
            {mode === "draft" ? "Cancel" : "Discard"}
          </Button>
          {mode === "edit" && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={persistAsNew}
              disabled={createView.isPending}
            >
              Save as new
            </Button>
          )}
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={mode === "edit" ? persistUpdate : persistAsNew}
            disabled={createView.isPending || updateView.isPending}
          >
            {mode === "edit" ? "Update view" : "Save view"}
          </Button>
        </div>
      </div>

      {/* Row 2 — entity chips · filter · display */}
      <div className="flex items-center justify-between gap-2 px-6 pb-3">
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center gap-1">
            {ENTITY_TABS.map(tab => {
              const active = tab.value === entity;
              const disabled = mode === "edit" && !active;
              const chip = (
                <button
                  key={tab.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleEntitySwitch(tab.value)}
                  className={cn(
                    "h-7 px-2.5 text-[11px] rounded-sm border transition-colors",
                    active
                      ? "bg-accent border-accent text-foreground font-medium"
                      : "bg-background border-border text-muted-foreground hover:text-foreground hover:bg-muted/40",
                    disabled && "opacity-50 cursor-not-allowed hover:bg-background hover:text-muted-foreground",
                  )}
                >
                  {tab.label}
                </button>
              );
              if (disabled) {
                return (
                  <Tooltip key={tab.value}>
                    <TooltipTrigger asChild><span>{chip}</span></TooltipTrigger>
                    <TooltipContent className="text-[11px]">
                      Saved views can't change type — duplicate to convert.
                    </TooltipContent>
                  </Tooltip>
                );
              }
              return chip;
            })}
          </div>
        </TooltipProvider>

        <div className="flex items-center gap-1 shrink-0">
          {filterSlot}
          {onDisplayChange && (
            <DisplayOptionsPopover
              entity={entity}
              value={currentFilters}
              onChange={onDisplayChange}
              triggerLabel="Display"
            />
          )}
        </div>
      </div>
    </div>
  );
}