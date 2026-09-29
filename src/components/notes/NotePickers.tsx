import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Check, Plus, Tag, X } from "lucide-react";

/**
 * Category dropdown with create/remove. Shared between the global Notes
 * page and account-scoped inline note feed.
 */
export function CategoryPicker({
  value,
  options,
  onChange,
  isInUse,
  triggerClassName,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  isInUse: (cat: string) => boolean;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [localOptions, setLocalOptions] = useState<string[]>(options);

  useEffect(() => {
    setLocalOptions(options);
  }, [options]);

  const normalized = query.trim().toLowerCase();
  const visible = localOptions.filter((o) => o.toLowerCase().includes(normalized));
  const canCreate = normalized.length > 0 && !localOptions.some((o) => o.toLowerCase() === normalized);

  function commit(v: string) {
    onChange(v);
    if (!localOptions.includes(v)) setLocalOptions((prev) => [...prev, v]);
    setQuery("");
    setOpen(false);
  }

  function removeOption(opt: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (isInUse(opt) || opt === value) return;
    setLocalOptions((prev) => prev.filter((o) => o !== opt));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={
            triggerClassName ??
            "h-7 px-2 text-xs rounded-sm hover:bg-muted/50 flex items-center gap-1 capitalize"
          }
        >
          {value || "Set category"}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canCreate) commit(query.trim());
          }}
          placeholder="Search or create"
          className="w-full h-7 px-2 text-xs bg-transparent border-b border-border outline-none mb-1"
        />
        <div className="max-h-52 overflow-y-auto">
          {visible.map((opt) => (
            <div
              key={opt}
              className="group flex items-center justify-between px-2 py-1 text-xs rounded-sm hover:bg-muted cursor-pointer"
              onClick={() => commit(opt)}
            >
              <span className="flex items-center gap-1.5 capitalize">
                {opt === value && <Check className="h-3 w-3" />}
                <span className={opt === value ? "" : "ml-[18px]"}>{opt}</span>
              </span>
              {!isInUse(opt) && opt !== value && (
                <button
                  className="opacity-0 group-hover:opacity-100 hover:text-destructive"
                  onClick={(e) => removeOption(opt, e)}
                  aria-label={`Remove category ${opt}`}
                  title="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          {canCreate && (
            <div
              className="px-2 py-1 text-xs rounded-sm hover:bg-muted cursor-pointer flex items-center gap-1.5 text-muted-foreground"
              onClick={() => commit(query.trim())}
            >
              <Plus className="h-3 w-3" /> Create "{query.trim()}"
            </div>
          )}
          {!canCreate && visible.length === 0 && (
            <div className="px-2 py-2 text-xs text-muted-foreground">No matches</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * "+ Add tag" picker. Suggests existing tags and lets user create new ones.
 */
export function TagPicker({
  suggestions,
  onAdd,
}: {
  suggestions: string[];
  onAdd: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const normalized = query.trim().toLowerCase();
  const visible = suggestions.filter((o) => o.toLowerCase().includes(normalized));
  const canCreate = normalized.length > 0 && !suggestions.some((o) => o.toLowerCase() === normalized);

  function commit(v: string) {
    onAdd(v);
    setQuery("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="h-5 px-1.5 text-xs bg-transparent border border-dashed border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 inline-flex items-center gap-1">
          <Plus className="h-2.5 w-2.5" /> Add tag
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canCreate) commit(query.trim());
          }}
          placeholder="Search or create"
          className="w-full h-7 px-2 text-xs bg-transparent border-b border-border outline-none mb-1"
        />
        <div className="max-h-52 overflow-y-auto">
          {visible.map((opt) => (
            <div
              key={opt}
              className="px-2 py-1 text-xs rounded-sm hover:bg-muted cursor-pointer flex items-center gap-1.5"
              onClick={() => commit(opt)}
            >
              <Tag className="h-3 w-3 text-muted-foreground" /> {opt}
            </div>
          ))}
          {canCreate && (
            <div
              className="px-2 py-1 text-xs rounded-sm hover:bg-muted cursor-pointer flex items-center gap-1.5 text-muted-foreground"
              onClick={() => commit(query.trim())}
            >
              <Plus className="h-3 w-3" /> Create "{query.trim()}"
            </div>
          )}
          {!canCreate && visible.length === 0 && (
            <div className="px-2 py-2 text-xs text-muted-foreground">No matches</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}