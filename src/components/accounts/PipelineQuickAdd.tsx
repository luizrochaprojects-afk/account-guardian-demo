import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface Props {
  /** Column label, used for the accessible name ("Add account to Meeting booked"). */
  stageLabel: string;
  /**
   * `empty` matches the shape of the column's "No accounts" placeholder so the
   * two can swap on hover without shifting layout; `inline` is the compact row
   * that sits after the last card.
   */
  variant: 'empty' | 'inline';
  /** Controlled by the column, which needs to know whether to draw the placeholder. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Resolve `true` when the account was created, so the composer can stay open for the next one. */
  onCreate: (name: string) => Promise<boolean>;
  /** Reveal classes owned by the column (hover/focus), applied to the closed trigger only. */
  triggerClassName?: string;
}

export function PipelineQuickAdd({
  stageLabel,
  variant,
  open,
  onOpenChange,
  onCreate,
  triggerClassName,
}: Props) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function close() {
    onOpenChange(false);
    setName('');
  }

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    const ok = await onCreate(trimmed);
    setSaving(false);
    if (!ok) return;
    // Stay open and focused so a run of accounts can be typed in one go.
    setName('');
    inputRef.current?.focus();
  }

  if (open) {
    return (
      <div className={cn('rounded-lg border border-dashed border-border p-2', variant === 'inline' && 'mt-2')}>
        <Input
          ref={inputRef}
          autoFocus
          disabled={saving}
          value={name}
          placeholder="Account name…"
          aria-label={`New account in ${stageLabel}`}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); void submit(); }
            if (e.key === 'Escape') { e.preventDefault(); close(); }
          }}
          // Clicking away with nothing typed dismisses; a half-typed name is kept.
          onBlur={() => { if (!name.trim()) close(); }}
          className="h-7 text-xs border-dashed"
        />
        <div className="mt-1 text-[11px] text-muted-foreground">Enter to add · Esc to cancel</div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenChange(true)}
      aria-label={`Add account to ${stageLabel}`}
      className={cn(
        'flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border',
        'text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
        variant === 'empty' ? 'py-6 px-4' : 'mt-2 py-1.5 px-3',
        triggerClassName,
      )}
    >
      <Plus className="h-3.5 w-3.5" />
      Add account
    </button>
  );
}
