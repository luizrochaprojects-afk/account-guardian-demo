import { useState } from 'react';
import { ChevronDown, ChevronRight, FileText, ListChecks, CalendarDays, Building2, Check, X, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AccountMatchPill } from './AccountMatchPill';
import { SuggestionEditDialog } from './SuggestionEditDialog';
import type {
  SuggestionWithContext, TaskSuggestionPayload, NoteSuggestionPayload, ActivitySuggestionPayload,
  IncumbentCaptureSuggestionPayload,
} from '@/types/agent';
import type { ApproveEdits } from '@/hooks/useAgentSuggestions';

const TYPE_META: Record<string, { label: string; Icon: typeof FileText }> = {
  task: { label: 'Task', Icon: ListChecks },
  note: { label: 'Note', Icon: FileText },
  activity: { label: 'Meeting', Icon: CalendarDays },
  incumbent_capture: { label: 'Incumbent', Icon: Building2 },
};

// SuggestionCard — single proposal row in the inbox. Renders the title,
// source excerpts (collapsed by default), the account match pill, and the
// three actions. Approve when account is null is blocked at the parent
// level — the card disables it and the user has to pick an account via the
// pill's manual selector first.

interface Props {
  suggestion: SuggestionWithContext;
  onApprove: (edits?: ApproveEdits | null) => Promise<unknown>;
  onReject: (reason?: string) => Promise<unknown>;
  isBusy?: boolean;
}

export function SuggestionCard({ suggestion, onApprove, onReject, isBusy }: Props) {
  const [excerptsOpen, setExcerptsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);

  const accountId = pendingAccountId ?? suggestion.account_id;
  const canApprove = !!accountId && suggestion.status === 'pending';
  const isTask = suggestion.type === 'task';
  const isActivity = suggestion.type === 'activity';
  const isIncumbent = suggestion.type === 'incumbent_capture';
  const payload = suggestion.payload as TaskSuggestionPayload & NoteSuggestionPayload & ActivitySuggestionPayload;
  const incumbentPayload = suggestion.payload as unknown as IncumbentCaptureSuggestionPayload;
  const meta = TYPE_META[suggestion.type] ?? TYPE_META.note;
  const Icon = meta.Icon;

  const handleApprove = async () => {
    const edits: ApproveEdits | null = pendingAccountId && pendingAccountId !== suggestion.account_id
      ? { account_id: pendingAccountId }
      : null;
    await onApprove(edits);
  };

  return (
    <div className="rounded-md border border-border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-[10px] uppercase">{meta.label}</Badge>
              <AccountMatchPill
                accountId={accountId}
                suggestedName={suggestion.suggested_account_name}
                confidence={suggestion.confidence_score}
                onSelect={suggestion.account_id ? undefined : (id) => setPendingAccountId(id)}
              />
            </div>
            {isIncumbent ? (
              <>
                <h4 className="font-medium text-sm leading-tight truncate">{incumbentPayload.incumbent_vendor}</h4>
                <p className="text-xs text-muted-foreground line-clamp-2 italic">"{incumbentPayload.incumbent_evidence}"</p>
                {(incumbentPayload.incumbent_last_renewal || incumbentPayload.incumbent_cycle) && (
                  <p className="text-[10px] text-muted-foreground">
                    {incumbentPayload.incumbent_cycle ? incumbentPayload.incumbent_cycle : ''}
                    {incumbentPayload.incumbent_last_renewal ? ` · renews ${incumbentPayload.incumbent_last_renewal}` : ''}
                  </p>
                )}
              </>
            ) : (
              <>
                <h4 className="font-medium text-sm leading-tight truncate">{payload.title}</h4>
                {isTask && payload.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{payload.description}</p>
                )}
                {isActivity && (
                  <p className="text-xs text-muted-foreground">
                    {payload.activity_type === 'meeting_booked' ? 'Meeting booked' : 'Meeting held'}
                    {payload.occurred_at ? ` · ${new Date(payload.occurred_at).toLocaleString('en-US')}` : ''}
                    {payload.attendees?.length ? ` · ${payload.attendees.length} attendee${payload.attendees.length === 1 ? '' : 's'}` : ''}
                  </p>
                )}
                {!isTask && !isActivity && payload.content_markdown && (
                  <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-line">{payload.content_markdown}</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {suggestion.source_excerpts.length > 0 && (
        <div className="text-xs">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => setExcerptsOpen((v) => !v)}
          >
            {excerptsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <span>{suggestion.source_excerpts.length} source excerpt{suggestion.source_excerpts.length === 1 ? '' : 's'}</span>
          </button>
          {excerptsOpen && (
            <ul className="mt-2 space-y-1.5 pl-4 border-l-2 border-muted">
              {suggestion.source_excerpts.map((ex, i) => (
                <li key={i} className="text-xs text-muted-foreground">
                  <span className="italic">"{ex.text}"</span>
                  {ex.location && <span className="ml-2 text-[10px] opacity-70">— {ex.location}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => onReject()}
          disabled={isBusy || suggestion.status !== 'pending'}
        >
          <X className="h-3.5 w-3.5 mr-1" /> Reject
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEditOpen(true)}
          disabled={isBusy || suggestion.status !== 'pending'}
        >
          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
        </Button>
        <Button
          size="sm"
          onClick={handleApprove}
          disabled={isBusy || !canApprove}
          title={!canApprove ? 'Pick an account first' : undefined}
        >
          <Check className="h-3.5 w-3.5 mr-1" /> Approve
        </Button>
      </div>

      <SuggestionEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        suggestion={suggestion}
        initialAccountId={accountId}
        onSubmit={async (edits) => {
          await onApprove(edits);
          setEditOpen(false);
        }}
      />
    </div>
  );
}
