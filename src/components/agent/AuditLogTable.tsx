import { Bot, User, Settings as SettingsIcon, Loader2, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AgentAuditLog } from '@/types/agent';

// AuditLogTable — purely presentational paged feed. The owning pane drives
// the query (via `useAgentAuditLog`) and threads the result through props.
// Keeping the table presentation-only lets the pane reuse the same rows
// for CSV export without re-firing the query.

interface Props {
  rows: AgentAuditLog[];
  isLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  className?: string;
  /** Called when the operator clicks "Retry" on a failed-extraction row. */
  onRetryIngest?: (meetingIngestId: string) => void;
  /** ID currently being retried (disables its button + shows spinner). */
  retryingIngestId?: string | null;
}

export function AuditLogTable({
  rows,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  className,
  onRetryIngest,
  retryingIngestId,
}: Props) {
  return (
    <div className={className}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[160px]">When</TableHead>
            <TableHead className="w-[80px]">Actor</TableHead>
            <TableHead className="w-[140px]">Action</TableHead>
            <TableHead>Summary</TableHead>
            {onRetryIngest && <TableHead className="w-[90px] text-right">Tools</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={onRetryIngest ? 5 : 4} className="p-0">
                <TableSkeleton rows={4} header={false} cols={['w-28', 'w-40', 'w-20', 'w-16']} label="Loading audit log" />
              </TableCell>
            </TableRow>
          )}
          {!isLoading && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={onRetryIngest ? 5 : 4} className="text-center text-xs text-muted-foreground py-6">No audit entries match these filters.</TableCell>
            </TableRow>
          )}
          {rows.map((r) => {
            // Only failed extractions are eligible for manual retry.
            // `extraction_retry_scheduled` is already on its way back; don't
            // double-fire from the panel.
            const canRetry =
              !!onRetryIngest &&
              r.action === 'extraction_failed' &&
              !!r.meeting_ingest_id;
            const isRetrying = !!retryingIngestId && retryingIngestId === r.meeting_ingest_id;
            return (
            <TableRow key={r.id}>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(r.created_at).toLocaleString('en-US')}
              </TableCell>
              <TableCell>
                <ActorChip actor={r.actor_type} />
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-[10px] uppercase">{r.action}</Badge>
              </TableCell>
              <TableCell className="text-xs">
                <Summary payload={r.payload} />
              </TableCell>
              {onRetryIngest && (
                <TableCell className="text-right">
                  {canRetry && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => onRetryIngest!(r.meeting_ingest_id!)}
                      disabled={isRetrying}
                      title="Re-queue this meeting for extraction"
                    >
                      {isRetrying
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <RotateCw className="h-3 w-3" />}
                      <span className="ml-1">Retry</span>
                    </Button>
                  )}
                </TableCell>
              )}
            </TableRow>
          );})}
        </TableBody>
      </Table>

      {hasNextPage && (
        <div className="flex justify-center py-3">
          <Button size="sm" variant="outline" onClick={onLoadMore} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

function ActorChip({ actor }: { actor: 'agent' | 'human' | 'system' }) {
  if (actor === 'agent') return <span className="inline-flex items-center gap-1 text-xs"><Bot className="h-3 w-3" />Agent</span>;
  if (actor === 'human') return <span className="inline-flex items-center gap-1 text-xs"><User className="h-3 w-3" />Human</span>;
  return <span className="inline-flex items-center gap-1 text-xs"><SettingsIcon className="h-3 w-3" />System</span>;
}

function Summary({ payload }: { payload: Record<string, unknown> }) {
  // Cheap human-readable rendering. The full payload is in the row, but the
  // viewer just shows the headline keys most callers set.
  const keys = ['title', 'reason', 'tokens_used', 'suggestions', 'record_id', 'table', 'edited_fields', 'patch'];
  const parts: string[] = [];
  for (const k of keys) {
    if (payload[k] === undefined) continue;
    const v = payload[k];
    if (Array.isArray(v)) parts.push(`${k}: ${v.join(', ')}`);
    else if (typeof v === 'object' && v !== null) parts.push(`${k}: ${JSON.stringify(v).slice(0, 60)}…`);
    else parts.push(`${k}: ${String(v)}`);
  }
  if (parts.length === 0) return <span className="text-muted-foreground">—</span>;
  return <span className="line-clamp-1">{parts.join(' · ')}</span>;
}
