import { Fragment } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, Building2, SearchX } from 'lucide-react';
import type { Account } from '@/contexts/AccountsContext';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableEmptyRow } from '@/components/ui/table-empty-row';
import { segmentColors, healthDotColor, healthLabel, groupDotColors } from '@/lib/badgeTokens';
import { scoreToHealthStatus } from '@/lib/healthScoring';
import type { CustomProperty } from '@/hooks/useCustomProperties';
import { formatPropertyValue } from '@/components/properties/PropertyField';
import { isSystemAccountKey, SYSTEM_KEY_TO_ACCOUNT_FIELD } from '@/hooks/useAccountFieldValue';
import { TrendIndicator } from '@/components/TrendIndicator';
import { CUSTOMER_COLUMNS, formatCustomerCell } from '@/lib/customerColumns';
import type { CustomerSignalRow } from '@/hooks/useCustomerSignals';
import { cn } from '@/lib/utils';

// These types intentionally mirror the locals in AllAccounts.tsx exactly so
// the extraction is a pure mechanical move (no behavioural changes).
export interface AccountRow {
  id: string;
  name: string;
  segment: string;
  lifecycleStage: string;
  initials: string;
  color: string;
  healthScore: number;
  healthStatus: 'healthy' | 'concerning' | 'poor' | 'no_data';
  arr: number;
  lastSeen: string;
  lastInteraction: string;
  // Resolved display names, not uuids: the table renders them directly and the
  // group-by buckets by them (revenue and delivery owners are separate).
  revenueOwnerId: string | null;
  deliveryOwnerId: string | null;
  revenueOwner: string;
  deliveryOwner: string;
  rawUpdatedAt: string | undefined;
  rawLastContact: string | undefined;
}

export type TableDataColumn = { key: string; label: string; skeletonWidth: string };

export interface AccountsTableViewProps {
  // Data
  rows: AccountRow[];
  allRows: AccountRow[];
  grouped: Record<string, AccountRow[]>;
  accountById: Map<string, Account>;
  customProps: CustomProperty[];
  visibleCustomProps: CustomProperty[];
  customValuesByAccount: Record<string, Record<string, any>>;
  tableDataColumns: TableDataColumn[];
  healthTrends: Record<string, { latest: number; previous: number | null }>;

  // View / display state
  viewMode: 'table' | 'board';
  groupBy: string;
  isFilterUpdating: boolean;
  // True while the accounts query is loading with no data yet. Used to render
  // skeletons instead of the "No accounts yet" empty state — an in-flight fetch
  // must never masquerade as an empty org.
  loading: boolean;
  isColVisible: (key: string) => boolean;
  currencySymbol: string;
  formatCurrency: (n: number) => string;
  /**
   * Per-account customer signals for the Customer-phase columns; `undefined`
   * for any account outside that phase, which renders as an em-dash.
   */
  getCustomerSignals?: (id: string) => CustomerSignalRow | undefined;

  // Selection
  selected: Set<string>;
  allSelected: boolean;
  toggle: (id: string) => void;
  toggleAll: () => void;

  // Row actions
  navigate: NavigateFunction;
  prefetchAccount: (accountId: string) => void;
  openCreate: () => void;
  openEdit: (id: string) => Promise<void> | void;
  setDeleteId: (id: string | null) => void;
}

export default function AccountsTableView({
  rows,
  allRows,
  grouped,
  accountById,
  customProps,
  visibleCustomProps,
  customValuesByAccount,
  tableDataColumns,
  healthTrends,
  viewMode,
  groupBy,
  isFilterUpdating,
  loading,
  isColVisible,
  currencySymbol,
  formatCurrency,
  getCustomerSignals,
  selected,
  allSelected,
  toggle,
  toggleAll,
  navigate,
  prefetchAccount,
  openCreate,
  openEdit,
  setDeleteId,
}: AccountsTableViewProps) {
  if (viewMode === 'table') {
    return (
      <div className="flex-1 overflow-auto px-6 pt-4 pb-6">
        <Card>
          <CardContent className="p-0">
            <div aria-busy={isFilterUpdating}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-9 pl-6">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                  </TableHead>
                  <TableHead>Account</TableHead>
                  {tableDataColumns.map(col => (
                    <TableHead key={col.key}>{col.label}</TableHead>
                  ))}
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  // 1 (checkbox) + 1 (Account) + dynamic data columns + 1 (actions)
                  const colSpan = 2 + tableDataColumns.length + 1;
                  // Render skeleton rows while (a) the accounts query is still
                  // loading with no data yet, or (b) the filter pulse is active.
                  // (a) prevents an in-flight fetch from rendering "No accounts
                  // yet"; (b) gives an instant ack on filter/sort changes.
                  const filterPulse = isFilterUpdating && allRows.length > 0;
                  if (loading || filterPulse) {
                    const skeletonCount = filterPulse
                      ? Math.min(Math.max(rows.length || 6, 3), 8)
                      : 6;
                    return Array.from({ length: skeletonCount }).map((_, i) => (
                      <TableRow key={`skeleton-${i}`} className="hover:bg-transparent">
                        <TableCell className="w-9 pl-6"><Skeleton className="h-3.5 w-3.5 rounded-sm" /></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-6 w-6 rounded-sm" />
                            <Skeleton className="h-3 w-32" />
                          </div>
                        </TableCell>
                        {tableDataColumns.map(col => (
                          <TableCell key={col.key}>
                            <Skeleton className={`h-3 ${col.skeletonWidth}`} />
                          </TableCell>
                        ))}
                        <TableCell className="w-20"></TableCell>
                      </TableRow>
                    ));
                  }
                  if (rows.length === 0) {
                    return allRows.length === 0 ? (
                      <TableEmptyRow
                        colSpan={colSpan}
                        icon={Building2}
                        title="No accounts yet"
                        description="Add your first account to start tracking customers."
                        action={<Button size="sm" onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1" />Add Account</Button>}
                      />
                    ) : (
                      <TableEmptyRow
                        colSpan={colSpan}
                        icon={SearchX}
                        title="No results"
                        description="Try adjusting your filters or search."
                      />
                    );
                  }
                  return Object.entries(grouped).map(([groupLabel, groupRows]) => {
                    return (
                      <Fragment key={groupLabel}>
                        {groupBy !== 'none' && (
                          <TableRow key={`group-${groupLabel}`} className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={colSpan} className="py-1">
                              <div className="flex items-center gap-2">
                                <span className={`h-1.5 w-1.5 rounded-full ${groupDotColors[groupLabel] || 'bg-muted-foreground'}`} />
                                <span className="text-[11px] font-semibold">{groupLabel}</span>
                                <span className="text-[11px] text-muted-foreground">{groupRows.length}</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                        {groupRows.map(row => {
                          const acct = accountById.get(row.id);
                          return (
                            <TableRow
                              key={row.id}
                              className="cursor-pointer group"
                              onMouseEnter={() => prefetchAccount(row.id)}
                              onClick={() => { prefetchAccount(row.id); navigate(`/account/${row.id}`); }}
                            >
                              <TableCell className="w-9 pl-6">
                                <Checkbox
                                  checked={selected.has(row.id)}
                                  onCheckedChange={() => toggle(row.id)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className={`h-6 w-6 rounded-sm flex items-center justify-center text-[9px] font-bold text-white shrink-0 ${row.color}`}>
                                    {row.initials}
                                  </div>
                                  <span className="font-medium">{row.name}</span>
                                </div>
                              </TableCell>
                              {isColVisible('segment') && (
                                <TableCell>
                                  <div className="flex items-center gap-1.5">
                                    <span className={`h-1.5 w-1.5 rounded-full ${segmentColors[row.segment] || 'bg-muted-foreground'}`} />
                                    <span className="text-muted-foreground">{row.segment || '—'}</span>
                                  </div>
                                </TableCell>
                              )}
                              {isColVisible('health') && (
                                <TableCell>
                                  {(() => {
                                    const t = healthTrends[row.id];
                                    // Logs are the source of truth: no log → no data, regardless of accounts.health_score
                                    const score = t ? t.latest : null;
                                    const status: AccountRow['healthStatus'] = scoreToHealthStatus(score);
                                    return (
                                      <div className="flex items-center gap-1.5">
                                        <span className={`h-2 w-2 rounded-full ${healthDotColor[status]}`} />
                                        <span className="font-medium">{score === null ? '—' : score}</span>
                                        {t && t.previous !== null && score !== null && (() => {
                                          const delta = score - t.previous;
                                          const trend: 'up' | 'down' | 'flat' = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
                                          const title = delta > 0 ? `+${delta} vs previous` : delta < 0 ? `${delta} vs previous` : 'No change';
                                          return (
                                            <span className="inline-flex items-center" title={title}>
                                              <TrendIndicator trend={trend} />
                                            </span>
                                          );
                                        })()}
                                        <span className="text-xs text-muted-foreground">{healthLabel[status]}</span>
                                      </div>
                                    );
                                  })()}
                                </TableCell>
                              )}
                              {isColVisible('arr') && (
                                <TableCell className="font-medium">{formatCurrency(row.arr)}</TableCell>
                              )}
                              {isColVisible('lastSeen') && (
                                <TableCell className="text-muted-foreground">{row.lastSeen}</TableCell>
                              )}
                              {isColVisible('lastInteraction') && (
                                <TableCell className="text-muted-foreground">{row.lastInteraction}</TableCell>
                              )}
                              {isColVisible('revenueOwner') && (
                                <TableCell className="text-muted-foreground">{row.revenueOwner || '—'}</TableCell>
                              )}
                              {isColVisible('deliveryOwner') && (
                                <TableCell className="text-muted-foreground">{row.deliveryOwner || '—'}</TableCell>
                              )}
                              {/* Customer-phase cells. Rendered from the same
                                  registry that built tableDataColumns, so the
                                  header and the body can never fall out of step
                                  the way the hand-written chain above can. */}
                              {CUSTOMER_COLUMNS.filter(c => isColVisible(c.key)).map(c => {
                                const ctx = {
                                  signals: getCustomerSignals?.(row.id),
                                  churnReason: acct?.churn_reason ?? null,
                                  symbol: currencySymbol,
                                  fxRate: null,
                                };
                                const text = formatCustomerCell(c, ctx);
                                const usd = c.usdTooltip?.(ctx) ?? null;
                                return (
                                  <TableCell
                                    key={c.key}
                                    className={cn(
                                      'tabular-nums',
                                      text === '—' ? 'text-muted-foreground' : 'text-foreground',
                                    )}
                                    // Keep the unconverted source amount reachable on hover
                                    // rather than only showing the converted number.
                                    title={usd !== null ? `US$ ${usd.toLocaleString('en-US')}` : undefined}
                                  >
                                    {text}
                                  </TableCell>
                                );
                              })}
                              {visibleCustomProps.map(p => {
                                const isSystemOnAccount = p.is_system && isSystemAccountKey(p.key);
                                const v = isSystemOnAccount
                                  ? (acct as any)?.[SYSTEM_KEY_TO_ACCOUNT_FIELD[p.key]]
                                  : customValuesByAccount[row.id]?.[p.id];
                                return (
                                  <TableCell key={p.id} className="text-muted-foreground">
                                    {formatPropertyValue(p, v, currencySymbol)}
                                  </TableCell>
                                );
                              })}
                              <TableCell>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(row.id); }}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteId(row.id); }}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </Fragment>
                    );
                  });
                })()}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    // Board (grouped) loading state: a few skeleton cards so an in-flight fetch
    // doesn't render as an empty org.
    return (
      <div className="flex-1 overflow-auto px-6 pt-4 pb-6">
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto p-4">
              <div className="flex gap-3 min-h-[400px]">
                {Array.from({ length: 3 }).map((_, col) => (
                  <div key={col} className="shrink-0 w-[240px] flex flex-col gap-1.5">
                    <Skeleton className="h-3 w-24 mb-1" />
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-sm" />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex-1 overflow-auto">
        {allRows.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No accounts yet"
            description="Add your first account to start tracking customers."
            action={<Button size="sm" onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1" />Add Account</Button>}
          />
        ) : (
          <EmptyState
            icon={SearchX}
            title="No results"
            description="Try adjusting your filters or search."
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto px-6 pt-4 pb-6">
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto p-4">
            <div className="flex gap-3 min-h-[400px]">
              {Object.entries(grouped).map(([label, gRows]) => ({
                  key: label, label, color: groupDotColors[label] || 'bg-muted-foreground', rows: gRows,
                })).map(col => (
                  <div key={col.key} className="shrink-0 w-[240px] flex flex-col">
                    <div className="flex items-center gap-1.5 mb-2 px-1">
                      <span className={`h-1.5 w-1.5 rounded-full ${col.color}`} />
                      <span className="text-[11px] font-semibold">{col.label}</span>
                      <span className="text-[11px] text-muted-foreground ml-auto">{col.rows.length}</span>
                    </div>
                    <div className="flex-1 space-y-1.5 overflow-y-auto">
                      {col.rows.map(row => (
                        <div
                          key={row.id}
                          className="border rounded-sm p-2.5 hover:bg-muted/30 transition-colors cursor-pointer group relative"
                          onMouseEnter={() => prefetchAccount(row.id)}
                          onClick={() => { prefetchAccount(row.id); navigate(`/account/${row.id}`); }}
                        >
                          <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="p-0.5 hover:bg-muted rounded-sm" onClick={(e) => { e.stopPropagation(); openEdit(row.id); }}>
                              <Pencil className="h-3 w-3 text-muted-foreground" />
                            </button>
                            <button className="p-0.5 hover:bg-muted rounded-sm" onClick={(e) => { e.stopPropagation(); setDeleteId(row.id); }}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </button>
                          </div>
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className={`h-5 w-5 rounded-sm flex items-center justify-center text-[8px] font-bold text-white shrink-0 ${row.color}`}>
                              {row.initials}
                            </div>
                            <span className="text-[13px] font-medium truncate">{row.name}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>{row.segment}</span>
                            <span className="font-medium text-foreground">{formatCurrency(row.arr)}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            Seen {row.lastSeen}
                          </div>
                          {visibleCustomProps.slice(0, 3).map(p => {
                            const isSystemOnAccount = p.is_system && isSystemAccountKey(p.key);
                            const v = isSystemOnAccount
                              ? (accountById.get(row.id) as any)?.[SYSTEM_KEY_TO_ACCOUNT_FIELD[p.key]]
                              : customValuesByAccount[row.id]?.[p.id];
                            const display = formatPropertyValue(p, v, currencySymbol);
                            if (!display || display === '—') return null;
                            return (
                              <div key={p.id} className="text-[11px] text-muted-foreground mt-0.5 truncate">
                                <span className="text-muted-foreground/60">{p.label}: </span>{display}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
