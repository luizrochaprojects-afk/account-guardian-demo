import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import { cn } from "@/lib/utils";

type AsTag = "h1" | "h2" | "h3" | "span";

interface EditableTitleProps {
  value: string;
  onSave: (next: string) => void;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  /** Used purely for default sizing/weight class. Visual element is still an input/textarea. */
  as?: AsTag;
  disabled?: boolean;
  /** Allow the value to be cleared (skips the "non-empty required" guard). */
  allowEmpty?: boolean;
  /** Forwarded to the underlying input/textarea (e.g. aria-label). */
  ariaLabel?: string;
  style?: CSSProperties;
  /** Sizes the input to match its content instead of stretching to 100% width. */
  autoWidth?: boolean;
  /** Optional external handle, so a parent can focus the field (e.g. click-row-to-rename). */
  inputRef?: MutableRefObject<HTMLInputElement | HTMLTextAreaElement | null>;
}

const SIZE_CLASS: Record<AsTag, string> = {
  h1: "text-lg font-semibold leading-tight",
  h2: "text-sm font-semibold leading-snug",
  h3: "text-xs font-semibold leading-snug",
  span: "text-xs",
};

/**
 * A title field that always behaves as editable on a single click.
 * Looks like plain text, but is a real input/textarea — so the caret lands
 * exactly where the user clicks, with no view↔edit mode toggle.
 */
export function EditableTitle({
  value,
  onSave,
  multiline = false,
  placeholder = "Untitled",
  className,
  as = "h2",
  disabled = false,
  allowEmpty = false,
  ariaLabel,
  style,
  autoWidth = false,
  inputRef: externalRef,
}: EditableTitleProps) {
  const [draft, setDraft] = useState(value);
  const lastSavedRef = useRef(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  // Keep the internal ref authoritative (commit/cancel/sync depend on it) and
  // mirror the node out to the caller when one asked for a handle.
  const setRefs = (el: HTMLInputElement | HTMLTextAreaElement | null) => {
    inputRef.current = el;
    if (externalRef) externalRef.current = el;
  };

  // Keep draft in sync when the upstream value changes (e.g. switching item).
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraft(value);
      lastSavedRef.current = value;
    }
  }, [value]);

  const commit = () => {
    const next = multiline ? draft : draft.trim();
    if (!allowEmpty && !next) {
      setDraft(lastSavedRef.current);
      return;
    }
    if (next === lastSavedRef.current) return;
    lastSavedRef.current = next;
    onSave(next);
  };

  const cancel = () => {
    setDraft(lastSavedRef.current);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
      return;
    }
    if (e.key === "Enter" && (!multiline || !e.shiftKey)) {
      e.preventDefault();
      (e.currentTarget as HTMLElement).blur();
    }
  };

  const baseClass = cn(
    autoWidth ? "bg-transparent outline-none rounded-sm px-1 -mx-1 py-0.5" : "w-full bg-transparent outline-none rounded-sm px-1 -mx-1 py-0.5",
    "border border-transparent",
    "placeholder:text-muted-foreground/50",
    "transition-colors",
    "hover:bg-muted/40",
    "focus:bg-background focus:border-input focus:ring-1 focus:ring-ring",
    disabled && "pointer-events-none opacity-70",
    SIZE_CLASS[as],
    className,
  );

  if (multiline) {
    return (
      <textarea
        ref={setRefs}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        rows={Math.min(8, Math.max(2, draft.split("\n").length))}
        className={cn(baseClass, "resize-none")}
        style={style}
      />
    );
  }

  return (
    <input
      ref={setRefs}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      className={baseClass}
      style={autoWidth ? { width: `${Math.max(draft.length, placeholder.length, 4)}ch`, ...style } : style}
    />
  );
}
