import { useState, useMemo } from 'react';
import { parseISO, differenceInCalendarDays } from 'date-fns';
import { Pencil, Plus, History } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSystemPropertyOptions } from '@/hooks/useSystemPropertyOptions';
import { useLifecycleHistory } from '@/hooks/useLifecycleHistory';
import { extractStage } from '@/lib/lifecycle';
import { formatDate, formatDateTooltip } from '@/lib/formatDate';
import { EditLifecycleEventDialog } from './EditLifecycleEventDialog';
import { PulseLoader } from '@/components/ui/pulse-loader';

const STAGE_FALLBACK = ['Onboarding', 'Adoption', 'Expansion', 'Mature'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  accountCreatedAt?: string | null;
}

export function LifecycleHistoryDialog({ open, onOpenChange, accountId, accountCreatedAt }: Props) {
  const { history, loading } = useLifecycleHistory(accountId);
  const { options } = useSystemPropertyOptions('account', 'pipeline_stage', STAGE_FALLBACK);

  const [editorState, setEditorState] = useState<
    | { open: false }
    | { open: true; mode: { kind: 'edit'; eventId: string } | { kind: 'insert'; insertBeforeId: string | null } }
  >({ open: false });

  const rows = useMemo(() => {
    return history.map((e, i) => {
      const next = history[i + 1];
      const enteredAt = parseISO(e.created_at);
      const exitedAt = next ? parseISO(next.created_at) : null;
      const days = Math.max(
        0,
        differenceInCalendarDays(exitedAt ?? new Date(), enteredAt)
      );
      return {
        event: e,
        stage: extractStage(e.title),
        enteredAt,
        exitedAt,
        days,
        isCurrent: !next,
        nextEventId: next?.id ?? null,
      };
    });
  }, [history]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" /> Lifecycle history
            </DialogTitle>
            <DialogDescription>
              Edit when each stage actually started, or backfill missing transitions.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <PulseLoader size={16} className="py-6" />
          ) : rows.length === 0 ? (
            <div className="text-center py-6 space-y-3">
              <div className="text-xs text-muted-foreground">No stage transitions yet.</div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditorState({ open: true, mode: { kind: 'insert', insertBeforeId: null } })}
              >
                <Plus className="h-3 w-3 mr-1" /> Backfill first transition
              </Button>
            </div>
          ) : (
            <div className="border rounded-sm divide-y max-h-[420px] overflow-y-auto">
              {rows.map((row, idx) => (
                <div key={row.event.id}>
                  {/* Insert-before button between rows (and at the top) */}
                  <InsertBetween
                    onClick={() =>
                      setEditorState({ open: true, mode: { kind: 'insert', insertBeforeId: row.event.id } })
                    }
                    label={idx === 0 ? 'Insert earlier transition' : 'Insert transition here'}
                  />

                  <div className="px-3 py-2.5 hover:bg-muted/30 group flex items-start gap-3">
                    <div className="flex flex-col items-center pt-0.5">
                      <div
                        className={`h-2 w-2 rounded-full ${row.isCurrent ? 'bg-foreground' : 'bg-muted-foreground/40'}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{row.stage}</span>
                        {row.isCurrent && (
                          <span className="text-[10px] px-1 py-0 rounded-sm bg-accent border text-foreground">
                            Current
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground font-mono ml-auto">
                          {row.days}d
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        <span title={formatDateTooltip(row.enteredAt)}>{formatDate(row.enteredAt)}</span>
                        {row.exitedAt && (
                          <> → <span title={formatDateTooltip(row.exitedAt)}>{formatDate(row.exitedAt)}</span></>
                        )}
                        {row.isCurrent && <> → now</>}
                      </div>
                      {row.event.summary && (
                        <div className="text-[11px] text-muted-foreground mt-1 italic">
                          {row.event.summary}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() =>
                        setEditorState({
                          open: true,
                          mode: { kind: 'edit', eventId: row.event.id },
                        })
                      }
                    >
                      <Pencil className="h-3 w-3 mr-1" /> Edit
                    </Button>
                  </div>
                </div>
              ))}
              {/* Insert AFTER the last (most recent) — only meaningful if there's a current row, since accounts.pipeline_stage already represents "now" */}
              <InsertBetween
                onClick={() =>
                  setEditorState({ open: true, mode: { kind: 'insert', insertBeforeId: null } })
                }
                label="Insert later transition"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {editorState.open && (
        <EditLifecycleEventDialog
          open={editorState.open}
          onOpenChange={(o) => { if (!o) setEditorState({ open: false }); }}
          accountId={accountId}
          accountCreatedAt={accountCreatedAt}
          history={history}
          stageOptions={options}
          mode={editorState.mode}
        />
      )}
    </>
  );
}

function InsertBetween({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full h-5 flex items-center justify-center text-[10px] text-muted-foreground/0 hover:text-muted-foreground hover:bg-muted/40 transition-colors group/insert"
      title={label}
    >
      <span className="flex items-center gap-1 opacity-0 group-hover/insert:opacity-100">
        <Plus className="h-3 w-3" /> {label}
      </span>
    </button>
  );
}