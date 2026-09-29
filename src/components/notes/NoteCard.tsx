import { useEffect, useRef, useState } from "react";
import { Tag, X } from "lucide-react";
import { DocumentEditor } from "@/components/DocumentEditor";
import { CategoryPicker, TagPicker } from "@/components/notes/NotePickers";
import { RowActionsMenu } from "@/components/listing";
import { useOrgMembers } from "@/hooks/useOrgMembers";
import { initialsOf } from "@/lib/initials";
import { formatDate, formatDateTooltip } from "@/lib/formatDate";
import type { DbNote } from "@/hooks/useNotesDB";

export function NoteCard({
  note,
  allCategories,
  allTags,
  isInUse,
  autoFocusTitle,
  onAutoFocused,
  onUpdate,
  onDelete,
}: {
  note: DbNote;
  allCategories: string[];
  allTags: string[];
  isInUse: (cat: string) => boolean;
  autoFocusTitle: boolean;
  onAutoFocused: () => void;
  onUpdate: (patch: Partial<DbNote>) => void;
  onDelete: () => void;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(note.title);
  const { members } = useOrgMembers();

  useEffect(() => {
    if (autoFocusTitle && titleRef.current) {
      titleRef.current.focus();
      onAutoFocused();
    }
  }, [autoFocusTitle, onAutoFocused]);

  // Prefer the resolved author from user_id — `author` is a legacy free-text
  // column that was always written as the literal string "You" and never
  // meant anything else, which left notes with no real author. Fall back to it only for notes with no user_id, e.g.
  // agent-authored ones.
  const authorName = (note.user_id && members.find((m) => m.user_id === note.user_id)?.display_name)
    || note.author
    || "Unknown";

  return (
    <div className="group border rounded-md bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-medium flex items-center justify-center shrink-0">
          {initialsOf(authorName === "Unknown" ? undefined : authorName)}
        </span>
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            onUpdate({ title: e.target.value });
          }}
          placeholder="Untitled note"
          className="flex-1 min-w-0 text-sm font-medium bg-transparent border-0 outline-none placeholder:text-muted-foreground placeholder:font-normal"
        />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {authorName} · <span title={formatDateTooltip(note.updated_at)}>{formatDate(note.updated_at)}</span>
        </span>
        <RowActionsMenu
          actions={[{ label: "Delete", destructive: true, onSelect: onDelete }]}
        />
      </div>

      <div className="px-3 py-2 min-h-[80px] flex flex-col">
        <DocumentEditor
          content={note.body || ""}
          onChange={(v) => onUpdate({ body: v })}
          placeholder="Click to add details, or press / for commands"
        />
      </div>

      {/* Type + tags are metadata, not content — shown on hover/focus rather
          than as permanent chrome. */}
      <div className="px-3 py-2 border-t bg-muted/10 flex flex-wrap items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        <CategoryPicker
          value={note.category}
          options={allCategories}
          onChange={(v) => onUpdate({ category: v })}
          isInUse={isInUse}
          triggerClassName="h-6 px-2 text-[11px] rounded-sm bg-muted/60 hover:bg-muted flex items-center gap-1 capitalize text-muted-foreground"
        />
        {(note.tags || []).map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-accent text-[11px]"
          >
            <Tag className="h-2.5 w-2.5" /> {tag}
            <button
              className="ml-0.5 hover:text-destructive"
              onClick={() =>
                onUpdate({ tags: (note.tags || []).filter((t) => t !== tag) })
              }
              aria-label={`Remove tag ${tag}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <TagPicker
          suggestions={allTags.filter((t) => !(note.tags || []).includes(t))}
          onAdd={(t) => {
            if (!(note.tags || []).includes(t)) {
              onUpdate({ tags: [...(note.tags || []), t] });
            }
          }}
        />
      </div>
    </div>
  );
}