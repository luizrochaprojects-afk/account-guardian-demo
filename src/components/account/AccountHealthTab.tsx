import { useMemo, useState } from 'react';
import { useAccountHealthProfile } from '@/contexts/HealthConfigContext';
import { HealthBadge } from '@/components/HealthBadge';
import { TrendIndicator } from '@/components/TrendIndicator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, CalendarIcon, Trash2 } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip, CartesianGrid } from 'recharts';
import { db } from '@/demo/db';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { formatDate, formatDateTooltip } from '@/lib/formatDate';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui/empty-state';
import {
  evaluateGrade,
  scoreMultiplier,
  extractGrade,
  extractValue,
  buildMetricsSnapshot,
  getLogMetrics,
  getHealthState,
  HEALTH_STATE_LABEL,
  type Grade,
  type HealthState,
} from '@/lib/healthScoring';
import { useHealthLogs } from '@/hooks/useHealthLogs';

interface AccountHealthTabProps {
  accountId: string;
  trend: 'up' | 'down' | 'flat';
  /**
   * The account's `pipeline_stage`. Decides WHICH metric set scores this
   * account — an onboarding account and a live customer are not measured by
   * the same signals. Omitted/unmapped means the account isn't scored at all.
   */
  stage?: string | null;
}

// Unified palette — mirrors HealthBadge.tsx's score-tier colors (emerald/yellow/destructive).
const statusBarColors: Record<Grade, string> = {
  healthy: 'bg-emerald-500',
  concerning: 'bg-yellow-500',
  poor: 'bg-red-500',
};

const statusChipColors: Record<Grade, string> = {
  healthy: 'text-emerald-700 bg-emerald-50',
  concerning: 'text-yellow-700 bg-yellow-50',
  poor: 'text-destructive bg-destructive/10',
};

const noDataChipColor = 'text-muted-foreground bg-muted';

const gradeLabels: Record<Grade, string> = {
  healthy: 'Healthy',
  concerning: 'Needs attention',
  poor: 'At risk',
};

// Maps the subset of HealthState reachable once metrics + logs both exist
// onto the same chip colors used for per-metric grades.
const overallStatusChipColors: Record<Extract<HealthState, 'healthy' | 'needs_attention' | 'at_risk'>, string> = {
  healthy: statusChipColors.healthy,
  needs_attention: statusChipColors.concerning,
  at_risk: statusChipColors.poor,
};

export function AccountHealthTab({ accountId, trend, stage }: AccountHealthTabProps) {
  // Resolve the profile for THIS account's stage. Reading `useHealthConfig().metrics`
  // here would score every account with whatever profile happens to be selected
  // in the config screen, which is what it used to do.
  const profile = useAccountHealthProfile(stage);
  const metrics = useMemo(() => profile?.metrics ?? [], [profile]);
  const { logs, loading: logsLoading, refetch: fetchLogs } = useHealthLogs(accountId);
  const qc = useQueryClient();
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [logDate, setLogDate] = useState<Date>(new Date());
  const [logValues, setLogValues] = useState<Record<string, number | boolean>>({});
  const [logObservation, setLogObservation] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const latestLog = logs.length > 0 ? logs[logs.length - 1] : null;
  const hasData = !!latestLog;
  const displayScore = latestLog?.total_score ?? 0;
  const healthState = getHealthState(metrics.length, logs.length, displayScore, {
    stageMapped: profile !== null,
  });

  const latestMetrics = useMemo(() => getLogMetrics(latestLog, metrics), [latestLog, metrics]);

  // Metrics without a logged entry never get a grade or a synthetic 0 —
  // absence of data must never present as risk.
  const breakdown = useMemo(() => {
    return latestMetrics.map(m => {
      const entry = latestLog?.scores?.[m.id];
      if (!entry) {
        return { id: m.id, name: m.name, hasEntry: false as const, maxContribution: m.weight };
      }
      const grade = extractGrade(entry);
      const contribution = Math.round(m.weight * scoreMultiplier[grade]);
      return { id: m.id, name: m.name, hasEntry: true as const, status: grade, contribution, maxContribution: m.weight };
    });
  }, [latestMetrics, latestLog]);

  const historyData = useMemo(() => {
    if (logs.length > 0) {
      return logs.map(l => ({ date: format(new Date(l.logged_at), 'MMM d'), score: l.total_score }));
    }
    return [{ date: format(new Date(), 'MMM d'), score: 0 }];
  }, [logs]);

  const computedGrades = useMemo(() => {
    const grades: Record<string, Grade> = {};
    metrics.forEach(m => {
      const val = logValues[m.id];
      grades[m.id] = val !== undefined ? evaluateGrade(val, m) : 'concerning';
    });
    return grades;
  }, [metrics, logValues]);

  const liveLogScore = useMemo(() => {
    let total = 0;
    metrics.forEach(m => {
      const grade = computedGrades[m.id] || 'concerning';
      total += Math.round(m.weight * scoreMultiplier[grade]);
    });
    return total;
  }, [metrics, computedGrades]);

  function openLogDialog() {
    const initial: Record<string, number | boolean> = {};
    metrics.forEach(m => {
      initial[m.id] = m.type === 'boolean' ? (m.booleanHealthyValue ?? true) : 0;
    });
    setLogValues(initial);
    setLogDate(new Date());
    setLogObservation('');
    setLogDialogOpen(true);
  }

  async function handleSaveLog() {
    setSaving(true);
    const { data: { user } } = await db.auth.getUser();
    if (!user) { toast.error('You must be logged in.'); setSaving(false); return; }
    const { data: orgId } = await db.rpc('get_user_org_id');
    if (!orgId) { toast.error('Could not determine your organization.'); setSaving(false); return; }

    const scores: Record<string, { value: number | boolean; grade: Grade }> = {};
    metrics.forEach(m => {
      scores[m.id] = {
        value: logValues[m.id] ?? (m.type === 'boolean' ? true : 0),
        grade: computedGrades[m.id] || 'concerning',
      };
    });

    const snapshot = buildMetricsSnapshot(metrics);

    const { error } = await db.from('health_score_logs').insert({
      account_id: accountId, user_id: user.id, organization_id: orgId,
      logged_at: format(logDate, 'yyyy-MM-dd'), observation: logObservation.trim() || null,
      scores: scores as any, total_score: liveLogScore,
      metrics_snapshot: snapshot as any,
    });

    if (error) { toast.error('Failed to save health log.'); } else { toast.success('Health update logged.'); setLogDialogOpen(false); fetchLogs(); }
    setSaving(false);
  }

  async function handleDeleteLog(logId: string) {
    setDeletingId(logId);
    const { error } = await db.from('health_score_logs').delete().eq('id', logId);
    if (error) { toast.error('Failed to delete log.'); }
    else {
      toast.success('Log deleted.');
      fetchLogs();
      qc.invalidateQueries({ queryKey: ['health_score_logs', accountId] });
    }
    setDeletingId(null);
  }

  // Shared across every state — the dialog is reachable from the not_data
  // CTA as well as the fully-populated view.
  const logDialog = (
    <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Log health update</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full h-8 text-sm mt-1 justify-start text-left font-normal", !logDate && "text-muted-foreground")}>
                  <CalendarIcon className="h-3.5 w-3.5 mr-2" />
                  {logDate ? format(logDate, 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={logDate} onSelect={(d) => d && setLogDate(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Metrics</label>
            <div className="mt-1 space-y-1.5">
              {metrics.map(m => {
                const grade = computedGrades[m.id] || 'concerning';
                return (
                  <div key={m.id} className="flex items-center gap-2">
                    <span className="text-xs flex-1 min-w-0 truncate">{m.name}</span>
                    {m.type === 'boolean' ? (
                      <Switch
                        checked={logValues[m.id] === true}
                        onCheckedChange={v => setLogValues(prev => ({ ...prev, [m.id]: v }))}
                      />
                    ) : (
                      <div className="relative">
                        <Input
                          type="number"
                          className={cn("h-7 text-xs w-20 text-right", m.type === 'percentage' && "pr-5")}
                          value={logValues[m.id] !== undefined ? String(logValues[m.id]) : ''}
                          onChange={e => {
                            const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                            setLogValues(prev => ({ ...prev, [m.id]: isNaN(val) ? 0 : val }));
                          }}
                        />
                        {m.type === 'percentage' && <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>}
                      </div>
                    )}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium whitespace-nowrap ${statusChipColors[grade]}`}>
                      {gradeLabels[grade]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2 py-1 border-t border-b">
            <span className="text-xs font-medium">Computed Score</span>
            <span className="text-sm font-mono font-semibold ml-auto">{liveLogScore}</span>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Observation (optional)</label>
            <Textarea className="mt-1 text-sm min-h-[60px]" placeholder="Any notes about this update..." value={logObservation} onChange={e => setLogObservation(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setLogDialogOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSaveLog} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // No profile claims this account's stage. Distinct from not_configured:
  // metrics may well exist, they just don't apply to an account at this point
  // in the pipeline. Scoring a lead with usage metrics produces a number
  // that means nothing, which is what happened before this branch existed.
  if (healthState === 'not_applicable') {
    return (
      <EmptyState
        title="Not scored at this stage"
        description="Health scoring applies once the account reaches onboarding — there's nothing to configure for this account specifically."
        action={
          // A secondary link, not a primary CTA: mapping a stage to a health
          // profile is an org-wide config change, not something scoped to
          // this account.
          <div className="flex flex-col items-center gap-1">
            <Link to="/health-config?tab=profiles" className="text-xs text-muted-foreground underline hover:text-foreground">
              Map this stage to a profile
            </Link>
            <span className="text-[11px] text-muted-foreground/70">Affects every account at this stage, not just this one.</span>
          </div>
        }
      />
    );
  }

  // Health score isn't configured at all — the whole tab is a single CTA.
  // No chart, no breakdown, no "Concerning" — there is nothing to grade yet.
  if (healthState === 'not_configured') {
    return (
      <EmptyState
        title="Health score not configured"
        description="Define the signals that determine account health, then start logging updates."
        action={
          <Button size="sm" asChild>
            <Link to="/health-config">Configure health score</Link>
          </Button>
        }
      />
    );
  }

  // Metrics exist but nothing has been logged — never render the chart or
  // breakdown grades against a score of 0; that would present absence of
  // data as risk.
  if (healthState === 'no_data') {
    return (
      <div className="space-y-4">
        <div className="border rounded-sm p-4 flex items-center gap-4">
          <HealthBadge score={displayScore} size="md" noData />
          <TrendIndicator trend={trend} />
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={openLogDialog}>
            <Plus className="h-3 w-3 mr-1" /> Log health update
          </Button>
        </div>
        <div className="border rounded-sm">
          <EmptyState
            title="No health data yet"
            description="Log the first update to start tracking."
            action={<Button size="sm" onClick={openLogDialog}><Plus className="h-3 w-3 mr-1" /> Log health update</Button>}
          />
        </div>
        {logDialog}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header strip */}
      <div className="border rounded-sm p-4 flex items-center gap-4">
        <HealthBadge score={displayScore} size="md" noData={!hasData} />
        <TrendIndicator trend={trend} />
        <span className={`inline-flex items-center px-2 py-1 rounded-sm text-xs font-medium ${overallStatusChipColors[healthState]}`}>
          {HEALTH_STATE_LABEL[healthState]}
        </span>
        {latestLog && (
          <span className="text-xs text-muted-foreground" title={formatDateTooltip(latestLog.logged_at)}>
            Updated {formatDate(latestLog.logged_at)}
          </span>
        )}
      </div>

      {/* Health Over Time */}
      <div className="border rounded-sm">
        <div className="px-3 py-2 border-b flex items-center justify-between">
          <span className="text-sm font-medium">Health Over Time</span>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openLogDialog}>
            <Plus className="h-3 w-3 mr-1" /> Log health update
          </Button>
        </div>
        {logs.length >= 2 ? (
          <div className="p-4 h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ fontSize: 12, border: '1px solid hsl(var(--border))', borderRadius: 2, boxShadow: 'none' }} />
                <Line type="monotone" dataKey="score" stroke="hsl(var(--foreground))" strokeWidth={1.5} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="px-3 py-6 text-xs text-muted-foreground text-center">
            One update logged — the trend chart appears after the second update.
          </div>
        )}
      </div>

      {/* Score Breakdown */}
      <div className="border rounded-sm">
        <div className="px-3 py-2 border-b">
          <span className="text-sm font-medium">Score Breakdown</span>
        </div>
        <div className="divide-y">
          {breakdown.map(m => (
            <div key={m.id} className="px-3 py-3 flex items-center gap-4">
              <span className="text-sm w-40">{m.name}</span>
              {m.hasEntry ? (
                <>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-xs font-medium ${statusChipColors[m.status]}`}>
                    {gradeLabels[m.status]}
                  </span>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${statusBarColors[m.status]}`}
                        style={{ width: `${m.maxContribution > 0 ? (m.contribution / m.maxContribution) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-muted-foreground w-16 text-right">
                      {m.contribution}/{m.maxContribution}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-xs font-medium ${noDataChipColor}`}>
                    No data
                  </span>
                  <div className="flex-1 flex items-center justify-end">
                    <span className="text-xs font-mono text-muted-foreground w-16 text-right">—</span>
                  </div>
                </>
              )}
            </div>
          ))}
          {logsLoading && breakdown.length === 0 && (
            <div role="status" aria-live="polite" className="px-3 py-3 space-y-2">
              <span className="sr-only">Loading health breakdown</span>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          )}
          {!logsLoading && breakdown.length === 0 && (
            <div className="px-3 py-6 text-xs text-muted-foreground text-center">No metrics configured</div>
          )}
        </div>
      </div>

      {/* Past Logs */}
      <div className="border rounded-sm">
        <div className="px-3 py-2 border-b">
          <span className="text-sm font-medium">
            {logsLoading ? 'Past Logs' : `Past Logs (${logs.length})`}
          </span>
        </div>
        <div className="divide-y">
          {[...logs].reverse().map(log => {
            const status = log.total_score >= 70 ? 'healthy' : log.total_score >= 40 ? 'concerning' : 'poor';
            return (
              <div key={log.id} className="px-3 py-2.5 group">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium w-24" title={formatDateTooltip(log.logged_at)}>{formatDate(log.logged_at)}</span>
                  <span className="text-sm font-mono font-semibold w-10">{log.total_score}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium ${statusChipColors[status]}`}>
                    {gradeLabels[status as Grade]}
                  </span>
                  <div className="flex-1" />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100"
                    disabled={deletingId === log.id}
                    onClick={() => handleDeleteLog(log.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 ml-[112px]">
                  {getLogMetrics(log, metrics).map(m => {
                    const entry = (log.scores as Record<string, unknown>)[m.id];
                    if (!entry) return null;
                    const grade = extractGrade(entry);
                    const rawVal = extractValue(entry);
                    return (
                      <span key={m.id} className="text-[11px] text-muted-foreground">
                        {m.name}: {rawVal !== null && (
                          <span className="font-mono">{String(rawVal)}{m.type === 'percentage' ? '%' : ''} </span>
                        )}
                        <span className={`font-medium ${grade === 'healthy' ? 'text-emerald-700' : grade === 'poor' ? 'text-destructive' : 'text-yellow-700'}`}>
                          {gradeLabels[grade]}
                        </span>
                      </span>
                    );
                  })}
                </div>
                {log.observation && (
                  <p className="text-xs text-muted-foreground italic mt-1 ml-[112px]">"{log.observation}"</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {logDialog}
    </div>
  );
}
