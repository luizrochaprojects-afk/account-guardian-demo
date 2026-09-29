import { useState } from 'react';
import { differenceInCalendarDays } from 'date-fns';
import { type Account } from '@/contexts/AccountsContext';
import { HealthBadge } from '@/components/HealthBadge';
import { TrendIndicator } from '@/components/TrendIndicator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Building2, MoreHorizontal } from 'lucide-react';
import { useSystemPropertyOptions } from '@/hooks/useSystemPropertyOptions';
import { useOrgSettings } from '@/hooks/useOrgSettings';
import { formatCurrencyValue } from '@/lib/currency';
import { LifecycleHistoryDialog } from './LifecycleHistoryDialog';
import { StageReasonModal } from '@/components/accounts/StageReasonModal';
import { useStageTransition } from '@/hooks/useStageTransition';
import type { PipelineStage } from '@/lib/transitionStage';
import { STAGE_LABEL, STAGE_COLOR } from './SalesStatusBadge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EditableTitle } from '@/components/EditableTitle';
import { cn } from '@/lib/utils';

const SEGMENT_FALLBACK = ['SMB', 'Mid-Market', 'Enterprise'];

interface AccountHeaderProps {
  account: Account;
  healthScore: number;
  onUpdate?: (patch: Partial<Account>) => void;
  onLogInteraction: () => void;
  onAddContact: () => void;
}

export function AccountHeader({ account, healthScore, onUpdate, onLogInteraction, onAddContact }: AccountHeaderProps) {
  const { options: segmentOptions } = useSystemPropertyOptions('account', 'segment', SEGMENT_FALLBACK);
  const { currencySymbol, currencyCode } = useOrgSettings();
  const hasHealthData = healthScore > 0;
  const [historyOpen, setHistoryOpen] = useState(false);
  const { requestStageChange, reasonGatedStage, reasonGatedAccount, closeReasonModal } = useStageTransition();

  const stage = account.pipeline_stage ?? 'target';
  const daysInStage = account.stage_changed_at
    ? differenceInCalendarDays(new Date(), new Date(account.stage_changed_at))
    : null;

  return (
    <div className="border-b px-4 py-4 sm:px-6 shrink-0">
      <div className="flex flex-wrap items-start gap-3">
        <div className="h-10 w-10 rounded-md border bg-muted flex items-center justify-center shrink-0">
          <Building2 className="h-5 w-5 text-muted-foreground" />
        </div>

        <div className="flex-1 min-w-[200px]">
          {/* Line 1: name + health */}
          <div className="flex items-center gap-2 flex-wrap">
            <EditableTitle
              as="h1"
              autoWidth
              value={account.name}
              onSave={(v) => onUpdate?.({ name: v })}
              disabled={!onUpdate}
              placeholder="Account name"
            />
            <HealthBadge score={healthScore} size="sm" noData={!hasHealthData} />
            <TrendIndicator trend={account.trend} />
          </div>

          {/* Line 2: industry · segment */}
          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
            {account.industry && <span>{account.industry}</span>}
            {account.industry && <span>·</span>}
            <InlineEditSelect
              value={account.segment}
              options={segmentOptions}
              onSave={(v) => onUpdate?.({ segment: v })}
              editable={!!onUpdate}
            />
          </div>

          {/* Line 3: sales status (absorbs SalesStatusBadge) */}
          <div className="flex items-center gap-2 mt-1.5 text-xs flex-wrap">
            <StagePicker stage={stage} onChange={(next) => requestStageChange(account, next)} />
            {daysInStage !== null && (
              <span className="text-muted-foreground">
                {daysInStage === 0
                  ? 'New in stage today'
                  : daysInStage === 1
                    ? '1 day in stage'
                    : `${daysInStage} days in stage`}
              </span>
            )}
            {account.arr > 0 && (
              <span className="text-muted-foreground">· {formatCurrencyValue(account.arr, currencySymbol, currencyCode)} potential ARR</span>
            )}
            {account.founder_confidence && (
              <span className="text-muted-foreground">· confidence {account.founder_confidence}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0 max-sm:w-full">
          <Button size="sm" onClick={onLogInteraction}>Log interaction</Button>
          <Button size="sm" variant="outline" onClick={onAddContact}>Add contact</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setHistoryOpen(true)}>View lifecycle history</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <LifecycleHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        accountId={account.id}
        accountCreatedAt={account.createdAt ?? null}
      />
      <StageReasonModal
        open={!!reasonGatedStage}
        onOpenChange={(o) => { if (!o) closeReasonModal(); }}
        account={reasonGatedAccount}
        stage={reasonGatedStage}
      />
    </div>
  );
}

/**
 * Single stage-change surface for the account page — the header pill IS the
 * picker. The other four read-only/
 * editable copies that used to exist (sidebar Commercial "Stage" row, the
 * sidebar's duplicate "Pipeline stage" custom-property row, SalesMotionTab's
 * Stage row, and this header's buried "..." → "Move stage" submenu) have all
 * been removed; every stage change on this page routes through here.
 */
function StagePicker({ stage, onChange }: { stage: string; onChange: (next: PipelineStage) => void }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <Badge
        className={cn('font-medium cursor-pointer hover:opacity-80', STAGE_COLOR[stage])}
        variant="outline"
        role="button"
        tabIndex={0}
        onClick={() => setEditing(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(true); } }}
      >
        {STAGE_LABEL[stage] ?? stage}
      </Badge>
    );
  }

  return (
    <Select
      value={stage}
      defaultOpen
      onValueChange={(v) => { onChange(v as PipelineStage); setEditing(false); }}
      onOpenChange={(o) => { if (!o) setEditing(false); }}
    >
      <SelectTrigger className="h-6 text-xs px-2 gap-1 rounded-full w-auto min-w-0 [&>svg]:h-3 [&>svg]:w-3">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(STAGE_LABEL).map(([key, label]) => (
          <SelectItem key={key} value={key} className="text-xs">{label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function InlineEditSelect({ value, options, onSave, editable }: { value: string; options: string[]; onSave: (v: string) => void; editable: boolean }) {
  const [editing, setEditing] = useState(false);

  const save = (v: string) => {
    setEditing(false);
    if (v !== value) onSave(v);
  };

  if (!editing) {
    return (
      <Badge
        variant="outline"
        className={`text-[11px] px-1.5 py-0 h-5 rounded-sm ${editable ? 'cursor-pointer hover:bg-accent' : ''}`}
        onClick={() => editable && setEditing(true)}
      >
        {value}
      </Badge>
    );
  }

  return (
    <Select
      value={value}
      defaultOpen
      onValueChange={save}
      onOpenChange={(o) => { if (!o) setEditing(false); }}
    >
      <SelectTrigger className="h-5 text-[11px] px-1.5 py-0 gap-1 rounded-sm w-auto min-w-0 [&>svg]:h-3 [&>svg]:w-3">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(o => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
