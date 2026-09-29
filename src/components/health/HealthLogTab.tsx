import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Trash2 } from 'lucide-react';
import { db } from '@/demo/db';
import { useQueryClient } from '@tanstack/react-query';
import { useHealthConfig, useAccountHealthProfile } from '@/contexts/HealthConfigContext';
import { useAccounts } from '@/contexts/AccountsContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { PulseLoader } from '@/components/ui/pulse-loader';
import {
  evaluateGrade,
  scoreMultiplier,
  extractGrade,
  extractValue,
  buildMetricsSnapshot,
  getLogMetrics,
  type Grade,
  type MetricSnapshotEntry,
} from '@/lib/healthScoring';

const gradeColors: Record<Grade, string> = {
  healthy: 'bg-emerald-100 text-emerald-800',
  concerning: 'bg-yellow-100 text-yellow-800',
  poor: 'bg-red-100 text-red-800',
};

const gradeLabels: Record<Grade, string> = {
  healthy: 'Healthy',
  concerning: 'Concerning',
  poor: 'Poor',
};

interface HealthLog {
  id: string;
  logged_at: string;
  scores: Record<string, unknown>;
  total_score: number;
  observation: string | null;
  account_id: string;
  metrics_snapshot?: MetricSnapshotEntry[] | null;
  profile_name?: string | null;
}

export function HealthLogTab() {
  const { profiles } = useHealthConfig();
  const { accounts } = useAccounts();
  const qc = useQueryClient();
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const selectedAccount = accounts.find(a => a.id === selectedAccountId);
  const accountProfile = useAccountHealthProfile(selectedAccount?.lifecycleStage);
  // Must be memoised: the `?? []` allocates a fresh array on every render, and
  // the effect below depends on `metrics` by identity, so an unmemoised value
  // means setLogValues → re-render → new array → effect → forever. Only bites
  // when accountProfile is null (unmapped stage), because otherwise the array
  // comes straight from context state and is already stable.
  const metrics = useMemo(() => accountProfile?.metrics ?? [], [accountProfile]);
  const [logDate, setLogDate] = useState<Date>(new Date());
  const [logValues, setLogValues] = useState<Record<string, number | boolean>>({});
  const [logObservation, setLogObservation] = useState('');
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Init default values based on metric type
  useEffect(() => {
    const initial: Record<string, number | boolean> = {};
    metrics.forEach(m => {
      initial[m.id] = m.type === 'boolean' ? (m.booleanHealthyValue ?? true) : 0;
    });
    setLogValues(initial);
  }, [metrics]);

  const fetchLogs = useCallback(async () => {
    if (!selectedAccountId) { setLogs([]); return; }
    setLoadingLogs(true);
    const { data } = await db
      .from('health_score_logs')
      .select('id, logged_at, scores, total_score, observation, account_id, metrics_snapshot, profile_name')
      .eq('account_id', selectedAccountId)
      .order('logged_at', { ascending: false })
      .limit(20);
    if (data) setLogs(data as unknown as HealthLog[]);
    setLoadingLogs(false);
  }, [selectedAccountId]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Compute grades from raw values
  const computedGrades = useMemo(() => {
    const grades: Record<string, Grade> = {};
    metrics.forEach(m => {
      const val = logValues[m.id];
      if (val !== undefined) {
        grades[m.id] = evaluateGrade(val, m);
      } else {
        grades[m.id] = 'concerning';
      }
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

  async function handleSave() {
    if (!selectedAccountId) { toast.error('Select an account first.'); return; }
    // Guarded here as well as on the button: a zero-metric log scores 0, and
    // that 0 propagates to accounts.health_score via trigger. The button being
    // disabled is a UI affordance; this is the actual invariant.
    if (metrics.length === 0) { toast.error('No metrics apply to this account — nothing to log.'); return; }
    setSaving(true);
    const { data: { user } } = await db.auth.getUser();
    if (!user) { toast.error('You must be logged in.'); setSaving(false); return; }
    const { data: orgId } = await db.rpc('get_user_org_id');
    if (!orgId) { toast.error('Could not determine your organization.'); setSaving(false); return; }

    // Build scores with both raw value and computed grade
    const scores: Record<string, { value: number | boolean; grade: Grade }> = {};
    metrics.forEach(m => {
      scores[m.id] = {
        value: logValues[m.id] ?? (m.type === 'boolean' ? true : 0),
        grade: computedGrades[m.id] || 'concerning',
      };
    });

    // Snapshot the profile's current metric configuration so this log
    // is permanently anchored to the weights/thresholds used right now.
    const snapshot = buildMetricsSnapshot(metrics);

    const { error } = await db.from('health_score_logs').insert({
      account_id: selectedAccountId, user_id: user.id, organization_id: orgId,
      logged_at: format(logDate, 'yyyy-MM-dd'), observation: logObservation.trim() || null,
      scores: scores as any, total_score: liveLogScore,
      profile_id: accountProfile && accountProfile.id !== 'default-pending' ? accountProfile.id : null,
      profile_name: accountProfile?.name ?? null,
      metrics_snapshot: snapshot as any,
    });

    if (error) { toast.error('Failed to save health log.'); } else {
      toast.success('Health update logged.');
      setLogObservation('');
      fetchLogs();
    }
    setSaving(false);
  }

  async function handleDeleteLog(logId: string) {
    setDeletingId(logId);
    const { error } = await db.from('health_score_logs').delete().eq('id', logId);
    if (error) { toast.error('Failed to delete.'); }
    else {
      toast.success('Log deleted.');
      fetchLogs();
      qc.invalidateQueries({ queryKey: ['health_score_logs'] });
    }
    setDeletingId(null);
  }

  const accountName = (id: string) => accounts.find(a => a.id === id)?.name || id;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">
      {/* Log form */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Account</label>
            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
              <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="Select account…" /></SelectTrigger>
              <SelectContent>
                {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {selectedAccount && (
              <div className="mt-1.5 text-[10px] text-muted-foreground flex flex-wrap items-center gap-1">
                <span>Stage: <span className="font-medium text-foreground">{selectedAccount.lifecycleStage || '—'}</span></span>
                <span>→</span>
                <span>Profile: <span className="font-medium text-foreground">{accountProfile?.name ?? '—'}</span></span>
              </div>
            )}
          </div>

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
                <Calendar mode="single" selected={logDate} onSelect={(d) => d && setLogDate(d)} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Metrics</label>
            <div className="mt-1 space-y-2">
              {metrics.length === 0 && (
                <p className="text-xs text-muted-foreground italic">
                  {selectedAccount && !accountProfile
                    ? 'No profile covers this account’s stage, so there is nothing to score. Map the stage in the Profiles tab.'
                    : 'This profile has no metrics yet. Configure them in the Configure tab.'}
                </p>
              )}
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
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium whitespace-nowrap ${gradeColors[grade]}`}>
                      {gradeLabels[grade]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 py-2 border-t border-b">
            <span className="text-xs font-medium">Computed Score</span>
            <span className="text-sm font-mono font-semibold ml-auto">{liveLogScore}</span>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Observation (optional)</label>
            <Textarea className="mt-1 text-sm min-h-[60px]" placeholder="Notes about this update…" value={logObservation} onChange={e => setLogObservation(e.target.value)} />
          </div>

          <div className="flex justify-end">
            {/* No metrics ⇒ nothing to log. Saving anyway writes total_score 0,
                and the DB trigger copies that onto accounts.health_score, where
                every board bands 0 as "at risk" — inventing a crisis out of an
                unmapped stage. */}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !selectedAccountId || metrics.length === 0}
            >
              {saving ? 'Saving…' : 'Log Update'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent logs */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-xs font-medium text-muted-foreground mb-3">
            Recent Logs {selectedAccountId ? `— ${accountName(selectedAccountId)}` : ''}
          </h3>
          {!selectedAccountId && <p className="text-xs text-muted-foreground">Select an account to see logs.</p>}
          {selectedAccountId && loadingLogs && <PulseLoader size={16} className="py-2 justify-start" />}
          {selectedAccountId && !loadingLogs && logs.length === 0 && <p className="text-xs text-muted-foreground">No logs yet for this account.</p>}
          <div className="divide-y">
            {logs.map(log => (
              <div key={log.id} className="py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{format(new Date(log.logged_at), 'MMM d, yyyy')}</span>
                  <span className="text-xs font-mono">{log.total_score}</span>
                  <span className={`text-[10px] px-1 py-0.5 rounded-sm ${gradeColors[log.total_score >= 70 ? 'healthy' : log.total_score >= 40 ? 'concerning' : 'poor']}`}>
                    {log.total_score >= 70 ? 'Healthy' : log.total_score >= 40 ? 'Concerning' : 'Poor'}
                  </span>
                  {log.profile_name && (
                    <span className="text-[10px] px-1 py-0.5 rounded-sm bg-muted text-muted-foreground">
                      {log.profile_name}
                    </span>
                  )}
                  <div className="flex-1" />
                  <Button variant="ghost" size="icon" className="h-5 w-5" disabled={deletingId === log.id} onClick={() => handleDeleteLog(log.id)}>
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                  {getLogMetrics(log, metrics).map(m => {
                    const entry = (log.scores as Record<string, unknown>)[m.id];
                    if (!entry) return null;
                    const grade = extractGrade(entry);
                    const rawVal = extractValue(entry);
                    return (
                      <span key={m.id} className="text-[10px] text-muted-foreground">
                        {m.name}: {rawVal !== null ? (
                          <><span className="font-mono">{String(rawVal)}{m.type === 'percentage' ? '%' : ''}</span> </>
                        ) : null}
                        <span className={`font-medium ${grade === 'healthy' ? 'text-emerald-700' : grade === 'poor' ? 'text-red-700' : 'text-yellow-700'}`}>
                          {gradeLabels[grade]}
                        </span>
                      </span>
                    );
                  })}
                </div>
                {log.observation && <p className="text-[10px] text-muted-foreground italic mt-1">"{log.observation}"</p>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
