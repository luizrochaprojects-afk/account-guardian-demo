import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Download, ChevronDown } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip, CartesianGrid } from 'recharts';
import { db } from '@/demo/db';
import { useAccounts } from '@/contexts/AccountsContext';
import { extractGrade, getLogMetrics } from '@/lib/healthScoring';
import { format, subDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { PulseLoader } from '@/components/ui/pulse-loader';

type Grade = 'healthy' | 'concerning' | 'poor';

interface LogRow {
  id: string;
  account_id: string;
  logged_at: string;
  total_score: number;
  /** Either a bare grade (legacy) or `{ value, grade }` — read via extractGrade. */
  scores: Record<string, unknown>;
  observation: string | null;
  /** The metric set in force when this log was written. */
  metrics_snapshot: unknown;
}

const CHART_COLORS = [
  'hsl(var(--primary))', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16',
];

export function HealthMonitorTab() {
  const { accounts } = useAccounts();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allSelected, setAllSelected] = useState(true);
  const [dateFrom, setDateFrom] = useState<Date>(subDays(new Date(), 90));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [accountFilterOpen, setAccountFilterOpen] = useState(false);

  // On first load, select all accounts
  useEffect(() => {
    if (accounts.length > 0 && selectedIds.size === 0 && allSelected) {
      setSelectedIds(new Set(accounts.map(a => a.id)));
    }
  }, [accounts]);

  const toggleAccount = (id: string) => {
    setAllSelected(false);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
      setAllSelected(false);
    } else {
      setSelectedIds(new Set(accounts.map(a => a.id)));
      setAllSelected(true);
    }
  };

  const fetchLogs = useCallback(async () => {
    if (selectedIds.size === 0) { setLogs([]); return; }
    setLoading(true);
    const { data } = await db
      .from('health_score_logs')
      .select('id, account_id, logged_at, total_score, scores, observation, metrics_snapshot')
      .in('account_id', Array.from(selectedIds))
      .gte('logged_at', format(dateFrom, 'yyyy-MM-dd'))
      .lte('logged_at', format(dateTo, 'yyyy-MM-dd'))
      .order('logged_at', { ascending: true });
    if (data) setLogs(data as unknown as LogRow[]);
    setLoading(false);
  }, [selectedIds, dateFrom, dateTo]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const accountNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    accounts.forEach(a => { map[a.id] = a.name; });
    return map;
  }, [accounts]);

  // Summary: latest log per account
  const summary = useMemo(() => {
    const byAccount: Record<string, LogRow[]> = {};
    logs.forEach(l => {
      if (!byAccount[l.account_id]) byAccount[l.account_id] = [];
      byAccount[l.account_id].push(l);
    });

    return Array.from(selectedIds).map(id => {
      const accountLogs = byAccount[id] || [];
      const latest = accountLogs.length > 0 ? accountLogs[accountLogs.length - 1] : null;
      const prev = accountLogs.length > 1 ? accountLogs[accountLogs.length - 2] : null;
      const trend = latest && prev ? (latest.total_score > prev.total_score ? 'up' : latest.total_score < prev.total_score ? 'down' : 'flat') : 'flat';
      return {
        id,
        name: accountNameMap[id] || id,
        latestScore: latest?.total_score ?? null,
        status: latest ? (latest.total_score >= 70 ? 'healthy' : latest.total_score >= 40 ? 'concerning' : 'poor') : null,
        trend,
        lastUpdated: latest?.logged_at ?? null,
        logCount: accountLogs.length,
      };
    }).sort((a, b) => (a.latestScore ?? 999) - (b.latestScore ?? 999));
  }, [logs, selectedIds, accountNameMap]);

  // Chart data: pivot by date
  const chartData = useMemo(() => {
    const dateMap: Record<string, Record<string, number>> = {};
    logs.forEach(l => {
      const d = l.logged_at;
      if (!dateMap[d]) dateMap[d] = {};
      dateMap[d][l.account_id] = l.total_score;
    });
    return Object.keys(dateMap).sort().map(d => ({
      date: format(new Date(d), 'MMM d'),
      ...dateMap[d],
    }));
  }, [logs]);

  const chartAccountIds = useMemo(() => {
    const ids = new Set<string>();
    logs.forEach(l => ids.add(l.account_id));
    return Array.from(ids);
  }, [logs]);

  function exportCSV() {
    // Columns come from each log's own metrics_snapshot, not from a single
    // profile's metrics. This export spans accounts, and accounts on different
    // pipeline stages are scored by different profiles — keying the columns off
    // one profile silently blanked every metric belonging to the others, or
    // worse, lined a value up under an unrelated header.
    //
    // Names, not ids: two profiles can measure "Product Usage" under different
    // metric rows, and a human reading the CSV wants those in one column.
    const perLog = logs.map(l => {
      const byName = new Map<string, string>();
      for (const m of getLogMetrics(l, [])) {
        const entry = l.scores?.[m.id];
        byName.set(m.name, entry === undefined ? '' : extractGrade(entry));
      }
      return { log: l, byName };
    });

    const columns: string[] = [];
    for (const { byName } of perLog) {
      for (const name of byName.keys()) if (!columns.includes(name)) columns.push(name);
    }

    const headers = ['Account', 'Date', 'Score', ...columns, 'Observation'];
    const rows = perLog.map(({ log: l, byName }) => [
      accountNameMap[l.account_id] || l.account_id,
      l.logged_at,
      l.total_score,
      ...columns.map(name => byName.get(name) ?? ''),
      l.observation || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    downloadFile(csv, 'health-scores.csv', 'text/csv');
  }

  function exportMD() {
    const lines: string[] = ['# Health Score Report', '', `Generated: ${format(new Date(), 'PPP')}`, '', `Date range: ${format(dateFrom, 'PPP')} – ${format(dateTo, 'PPP')}`, ''];
    lines.push('| Account | Score | Status | Last Updated |', '|---|---|---|---|');
    summary.forEach(s => {
      lines.push(`| ${s.name} | ${s.latestScore ?? '—'} | ${s.status ?? '—'} | ${s.lastUpdated ? format(new Date(s.lastUpdated), 'MMM d, yyyy') : '—'} |`);
    });
    downloadFile(lines.join('\n'), 'health-scores.md', 'text/markdown');
  }

  function downloadFile(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  const statusColors: Record<string, string> = {
    healthy: 'bg-emerald-100 text-emerald-800',
    concerning: 'bg-yellow-100 text-yellow-800',
    poor: 'bg-red-100 text-red-800',
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Popover open={accountFilterOpen} onOpenChange={setAccountFilterOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
              Accounts ({selectedIds.size}/{accounts.length}) <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2 max-h-64 overflow-y-auto" align="start">
            <label className="flex items-center gap-2 px-2 py-1 text-xs font-medium cursor-pointer hover:bg-muted rounded-sm">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              Select All
            </label>
            <div className="border-t my-1" />
            {accounts.map(a => (
              <label key={a.id} className="flex items-center gap-2 px-2 py-1 text-xs cursor-pointer hover:bg-muted rounded-sm">
                <Checkbox checked={selectedIds.has(a.id)} onCheckedChange={() => toggleAccount(a.id)} />
                {a.name}
              </label>
            ))}
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
              <CalendarIcon className="h-3 w-3" /> {format(dateFrom, 'MMM d')} – {format(dateTo, 'MMM d')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <div className="flex gap-4">
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">From</p>
                <Calendar mode="single" selected={dateFrom} onSelect={d => d && setDateFrom(d)} className="pointer-events-auto" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">To</p>
                <Calendar mode="single" selected={dateTo} onSelect={d => d && setDateTo(d)} className="pointer-events-auto" />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex-1" />
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={exportCSV}><Download className="h-3 w-3" /> CSV</Button>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={exportMD}><Download className="h-3 w-3" /> MD</Button>
      </div>

      {/* Chart */}
      {chartData.length > 1 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-xs font-medium text-muted-foreground mb-3">Health Over Time</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ fontSize: 11, border: '1px solid hsl(var(--border))', borderRadius: 4, background: 'hsl(var(--background))' }} labelStyle={{ fontSize: 10 }} />
                  {chartAccountIds.map((id, i) => (
                    <Line key={id} type="monotone" dataKey={id} name={accountNameMap[id] || id} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={1.5} dot={{ r: 2 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Account</th>
                <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground w-20">Score</th>
                <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground w-24">Status</th>
                <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground w-16">Trend</th>
                <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground w-28">Last Updated</th>
                <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground w-16">Logs</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && <tr><td colSpan={6} className="px-3 py-4"><PulseLoader size={16} /></td></tr>}
              {!loading && summary.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-xs text-muted-foreground text-center">No data. Select accounts and ensure logs exist.</td></tr>}
              {!loading && summary.map(s => (
                <tr key={s.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 text-xs font-medium">{s.name}</td>
                  <td className="px-3 py-2 text-center text-xs font-mono">{s.latestScore ?? '—'}</td>
                  <td className="px-3 py-2 text-center">
                    {s.status ? <span className={`text-[10px] px-1.5 py-0.5 rounded-sm ${statusColors[s.status]}`}>{s.status}</span> : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center text-xs">
                    {s.trend === 'up' ? '↑' : s.trend === 'down' ? '↓' : '→'}
                  </td>
                  <td className="px-3 py-2 text-center text-xs text-muted-foreground">
                    {s.lastUpdated ? format(new Date(s.lastUpdated), 'MMM d') : '—'}
                  </td>
                  <td className="px-3 py-2 text-center text-xs font-mono text-muted-foreground">{s.logCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
