// AgentAuditPane — wraps AuditLogTable with filter controls and CSV export.
// Owns the query call (via `useAgentAuditLog`) so the export button can
// reuse the loaded rows without re-firing the request.
//
// Filters: actor type, action, free-form date range, and the inherited
// accountId from the parent inbox. The date pickers use plain
// `type="date"` inputs — good enough for an audit log, and avoids pulling
// in a date-picker dependency.
//
// Admin gating: v1 has no role column on `profiles`, so the audit tab is
// visible to all org members. When a role is added, scope the visibility
// in `AgentInbox` before rendering this pane.

import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { db } from '@/demo/db';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AuditLogTable } from './AuditLogTable';
import { useAgentAuditLog, type AuditFilters } from '@/hooks/useAgentAuditLog';
import {
  AGENT_ACTOR_TYPES,
  AGENT_AUDIT_ACTIONS,
  type AgentActorType,
  type AgentAuditAction,
} from '@/lib/agentAuditActions';
import { auditCsvFilename, buildAuditCsv } from '@/lib/agentAuditCsv';
import { downloadCsv } from '@/lib/csvExport';

interface Props {
  /** Inherited from the inbox account filter. */
  accountId?: string | null;
  className?: string;
}

export function AgentAuditPane({ accountId, className }: Props) {
  const [actorType, setActorType] = useState<AgentActorType | 'all'>('all');
  const [action, setAction] = useState<AgentAuditAction | 'all'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const filters: AuditFilters = useMemo(
    () => ({
      actorType,
      action,
      accountId: accountId || undefined,
      from: from ? new Date(from).toISOString() : undefined,
      // Treat the `to` date as inclusive end-of-day so a same-day range
      // captures everything from that day.
      to: to ? new Date(`${to}T23:59:59.999Z`).toISOString() : undefined,
    }),
    [actorType, action, accountId, from, to],
  );

  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useAgentAuditLog(filters);
  const rows = useMemo(() => (data?.pages ?? []).flatMap((p) => p.rows), [data?.pages]);

  const queryClient = useQueryClient();
  const retryMutation = useMutation({
    mutationFn: async (meetingIngestId: string) => {
      const { data, error } = await db.functions.invoke('agent-retry-ingest', {
        body: { meeting_ingest_id: meetingIngestId },
      });
      if (error) throw error;
      const payload = data as { error?: string } | null;
      if (payload?.error) throw new Error(payload.error);
      return data;
    },
    onSuccess: () => {
      toast.success('Reprocessing queued — refresh in a few seconds');
      // Refresh both the audit log and any inbox queries that depend on
      // ingest/suggestion state.
      queryClient.invalidateQueries({ queryKey: ['agent_audit_log'] });
      queryClient.invalidateQueries({ queryKey: ['agent_suggestions'] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'unknown_error';
      toast.error(`Retry failed: ${msg}`);
    },
  });

  const reset = () => {
    setActorType('all');
    setAction('all');
    setFrom('');
    setTo('');
  };

  const handleExport = () => {
    const csv = buildAuditCsv(rows);
    downloadCsv(auditCsvFilename(), csv);
  };

  const hasFilters = actorType !== 'all' || action !== 'all' || from !== '' || to !== '';

  return (
    <div className={className}>
      <div className="flex flex-wrap items-end gap-3 py-3 border-b mb-3">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Actor</Label>
          <Select value={actorType} onValueChange={(v) => setActorType(v as AgentActorType | 'all')}>
            <SelectTrigger className="h-8 text-xs w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All actors</SelectItem>
              {AGENT_ACTOR_TYPES.map((a) => (
                <SelectItem key={a} value={a} className="text-xs capitalize">
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Action</Label>
          <Select value={action} onValueChange={(v) => setAction(v as AgentAuditAction | 'all')}>
            <SelectTrigger className="h-8 text-xs w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All actions</SelectItem>
              {AGENT_AUDIT_ACTIONS.map((a) => (
                <SelectItem key={a} value={a} className="text-xs">
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="audit-from" className="text-[10px] text-muted-foreground">From</Label>
          <Input
            id="audit-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 text-xs w-[140px]"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="audit-to" className="text-[10px] text-muted-foreground">To</Label>
          <Input
            id="audit-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 text-xs w-[140px]"
          />
        </div>

        {hasFilters && (
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={reset}>
            Reset
          </Button>
        )}

        <div className="ml-auto flex flex-col items-end gap-0.5">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={handleExport}
            disabled={rows.length === 0}
          >
            <Download className="h-3 w-3 mr-1" /> Export CSV
          </Button>
          <span className="text-[10px] text-muted-foreground">
            Exports {rows.length} loaded row{rows.length === 1 ? '' : 's'}
            {hasNextPage ? ' — load more for full range' : ''}
          </span>
        </div>
      </div>

      <AuditLogTable
        rows={rows}
        isLoading={isLoading}
        hasNextPage={!!hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
        onRetryIngest={(id) => retryMutation.mutate(id)}
        retryingIngestId={retryMutation.isPending ? (retryMutation.variables as string | undefined) ?? null : null}
      />
    </div>
  );
}
