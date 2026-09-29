import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useNotesDB, type DbNote } from "@/hooks/useNotesDB";
import { NoteCard } from "@/components/notes/NoteCard";
import { useAutosaveStatus, SaveStatusIndicator } from "@/components/listing";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

const DEFAULT_CATEGORIES = ["meeting", "note", "call"];

interface Props {
  accountId: string;
}

/**
 * Inline, account-scoped notes feed shown inside the workspace Activity tab.
 * Single-column stack of editable cards, no side panel.
 */
export function AccountNotesInline({ accountId }: Props) {
  const { notes, addNote, updateNote, deleteNote } = useNotesDB({ accountId });
  const { state: saveState, track } = useAutosaveStatus();
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Always-visible composer with an "N" shortcut, so writing a note is never
  // more than one keystroke away. "N" only fires when focus
  // isn't already inside a text field, so it doesn't hijack typing elsewhere.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "n" && e.key !== "N") return;
      const active = document.activeElement;
      const isTyping = active instanceof HTMLElement && (
        active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable
      );
      if (isTyping) return;
      e.preventDefault();
      composerRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const allCategories = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES);
    notes.forEach((n) => n.category && set.add(n.category));
    return Array.from(set);
  }, [notes]);

  const presentCategories = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => n.category && set.add(n.category));
    return Array.from(set);
  }, [notes]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => (n.tags || []).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [notes]);

  const visible = useMemo(() => {
    if (!filterCategory) return notes;
    return notes.filter((n) => n.category === filterCategory);
  }, [notes, filterCategory]);

  function handleUpdate(id: string, patch: Partial<DbNote>) {
    void track(Promise.resolve(updateNote(id, patch)));
  }

  async function submitDraft() {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    await addNote({
      title: "",
      category: "note",
      author: "You",
      account_id: accountId,
      body,
      participants: [],
      tags: [],
    });
  }

  async function handleDelete() {
    if (!deleteId) return;
    await deleteNote(deleteId);
    setDeleteId(null);
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold">Notes</h3>
          <span className="text-xs text-muted-foreground">{notes.length}</span>
          <SaveStatusIndicator state={saveState} className="ml-1" />
        </div>
      </div>

      {/* Always-visible composer — writing a note never requires creating an
          empty card first. */}
      <div className="flex flex-col gap-2 border rounded-md bg-card p-2">
        <Textarea
          ref={composerRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void submitDraft();
            }
          }}
          placeholder="Write a note about this account... (N)"
          className="min-h-[56px] text-sm border-0 shadow-none focus-visible:ring-0 resize-none p-1"
        />
        <div className="flex justify-end">
          <Button size="sm" className="h-7 text-xs" disabled={!draft.trim()} onClick={() => void submitDraft()}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add note
          </Button>
        </div>
      </div>

      {/* Optional category filter chips */}
      {presentCategories.length >= 2 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setFilterCategory(null)}
            className={cn(
              "h-6 px-2 text-[11px] rounded-sm border transition-colors capitalize",
              filterCategory === null
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            All
          </button>
          {presentCategories.map((c) => (
            <button
              key={c}
              onClick={() => setFilterCategory(c)}
              className={cn(
                "h-6 px-2 text-[11px] rounded-sm border transition-colors capitalize",
                filterCategory === c
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Empty state — the composer above is already the entry point */}
      {notes.length === 0 && (
        <div className="border border-dashed rounded-md p-6 text-center space-y-1">
          <FileText className="h-4 w-4 text-muted-foreground/60 mx-auto" strokeWidth={1.75} />
          <p className="text-xs text-muted-foreground">
            No notes yet. Capture meeting notes, observations, and follow-ups above.
          </p>
        </div>
      )}

      {/* Cards */}
      <div className="space-y-3">
        {visible.map((n) => (
          <NoteCard
            key={n.id}
            note={n}
            allCategories={allCategories}
            allTags={allTags}
            isInUse={(cat) => notes.some((o) => o.id !== n.id && o.category === cat)}
            autoFocusTitle={false}
            onAutoFocused={() => {}}
            onUpdate={(patch) => handleUpdate(n.id, patch)}
            onDelete={() => setDeleteId(n.id)}
          />
        ))}
        {notes.length > 0 && visible.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            No notes in this category.
          </p>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}