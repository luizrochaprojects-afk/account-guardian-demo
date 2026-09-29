import { useState } from "react";
import { Bookmark, ChevronDown } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useCustomViews } from "@/hooks/useCustomViews";
import type { AnyFilters, ViewEntity } from "@/lib/viewFilters";
import { hasActiveFilters } from "@/lib/viewFilters";

export function SaveViewButton({
  entity, filters,
}: { entity: ViewEntity; filters: AnyFilters }) {
  const [searchParams] = useSearchParams();
  const viewId = searchParams.get("view");
  const { views, createView, updateView } = useCustomViews(entity);
  const currentView = viewId ? views.find(v => v.id === viewId) : null;

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [favorite, setFavorite] = useState(false);

  const active = hasActiveFilters(entity, filters);
  if (!active && !currentView) return null;

  const openSaveAsNew = () => {
    setName("");
    setFavorite(false);
    setOpen(true);
  };

  const saveAsNew = async () => {
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    await createView.mutateAsync({
      name: name.trim(),
      entity_type: entity,
      filters,
      is_favorite: favorite,
    });
    toast.success(`Saved view "${name.trim()}"`);
    setOpen(false);
  };

  const updateCurrent = async () => {
    if (!currentView) return;
    await updateView.mutateAsync({ id: currentView.id, patch: { filters } });
    toast.success(`Updated "${currentView.name}"`);
  };

  if (currentView) {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1 border-dashed">
              <Bookmark className="h-3.5 w-3.5" />
              Save
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={updateCurrent}>
              Update "{currentView.name}"
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={openSaveAsNew}>
              Save as new view…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-sm">Save as new view</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="vname" className="text-xs">Name</Label>
                <Input id="vname" value={name} onChange={e => setName(e.target.value)} placeholder="My view" autoFocus />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="vfav" checked={favorite} onCheckedChange={c => setFavorite(c === true)} />
                <Label htmlFor="vfav" className="text-xs cursor-pointer">Add to sidebar favorites</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={saveAsNew} disabled={createView.isPending}>Save view</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <Button
        variant="outline" size="sm"
        className="h-8 text-xs gap-1 border-dashed"
        onClick={openSaveAsNew}
        title="Save view"
      >
        <Bookmark className="h-3.5 w-3.5" />
        Save view
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Save view</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="vname" className="text-xs">Name</Label>
              <Input id="vname" value={name} onChange={e => setName(e.target.value)} placeholder="My view" autoFocus />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="vfav" checked={favorite} onCheckedChange={c => setFavorite(c === true)} />
              <Label htmlFor="vfav" className="text-xs cursor-pointer">Add to sidebar favorites</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={saveAsNew} disabled={createView.isPending}>Save view</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}