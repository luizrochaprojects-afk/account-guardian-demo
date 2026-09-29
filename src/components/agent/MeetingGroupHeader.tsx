import { ChevronDown, ChevronRight, Folder, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { SuggestionWithContext } from '@/types/agent';

interface Props {
  meetingId: string;
  title: string | null;
  folderName: string | null;
  meetingDate: string | null;
  suggestions: SuggestionWithContext[];
  open: boolean;
  onToggle: () => void;
  onApproveAll?: () => void;
}

export function MeetingGroupHeader({ title, folderName, meetingDate, suggestions, open, onToggle, onApproveAll }: Props) {
  const date = meetingDate ? new Date(meetingDate) : null;
  const allApprovable = suggestions.length > 0 && suggestions.every((s) => s.account_id !== null && s.status === 'pending');

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
      <button type="button" onClick={onToggle} className="flex items-center gap-2 min-w-0 flex-1 text-left">
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm truncate">{title ?? 'Untitled meeting'}</div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {folderName && (
              <span className="inline-flex items-center gap-1">
                <Folder className="h-3 w-3" /> {folderName}
              </span>
            )}
            {date && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" /> {date.toLocaleDateString('en-US')}
              </span>
            )}
          </div>
        </div>
      </button>

      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs">{suggestions.length} suggestion{suggestions.length === 1 ? '' : 's'}</Badge>
        {onApproveAll && allApprovable && (
          <Button size="sm" variant="ghost" onClick={onApproveAll}>Approve all</Button>
        )}
      </div>
    </div>
  );
}
