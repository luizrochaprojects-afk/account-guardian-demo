import { Loader2, Cloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SaveState } from './useAutosaveStatus';

interface SaveStatusIndicatorProps {
  state: SaveState;
  className?: string;
}

/**
 * Inline "Saving…" / "Saved" indicator. Renders nothing when idle so it can
 * sit next to a count or in a toolbar without consuming layout space.
 */
export function SaveStatusIndicator({ state, className }: SaveStatusIndicatorProps) {
  if (state === 'idle') return null;
  if (state === 'saving') {
    return (
      <span className={cn('inline-flex items-center gap-1 text-[11px] text-muted-foreground', className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving…
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-opacity', className)}>
      <Cloud className="h-3 w-3" />
      Saved
    </span>
  );
}
