import { Link } from 'react-router-dom';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { differenceInCalendarDays } from 'date-fns';
import type { Account } from '@/contexts/AccountsContext';
import { QuickAddActivity } from '@/components/activities/QuickAddActivity';
import { useCustomerSignals } from '@/hooks/useCustomerSignals';
import { customerBadges } from '@/lib/customerSignals';
import { compactAmount } from '@/lib/customerPortfolio';
import { useMoney } from '@/hooks/useMoney';
import { customerRiskReasonLabel } from '@/lib/pipelineStages';
import { phaseForStage } from '@/lib/pipelinePhases';
import { useHealthTrends } from '@/hooks/useHealthTrends';
import { scoreToHealthStatus } from '@/lib/healthScoring';
import { healthDotColor, healthLabel } from '@/lib/badgeTokens';
import { isFieldVisible, type CardFieldKey } from '@/lib/pipelineCardFields';
import { usePipelineCardFieldSet } from './PipelineCardFieldsContext';
import type { PipelinePhase } from '@/lib/transitionStage';
import { cn } from '@/lib/utils';

interface Props {
  account: Account;
}

const CONFIDENCE_LABEL: Record<string, string> = {
  low: 'LOW',
  medium: 'MED',
  high: 'HIGH',
};

export function PipelineCard({ account }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: account.id,
    data: { account },
  });

  // Which variables this card shows. Configured per phase from the board's
  // "Card fields" menu; `null` (no provider) falls back to the registry
  // defaults, which are the card exactly as it looked before it was
  // configurable.
  //
  // Hiding a field hides UI, it does NOT save a query: the hooks below are
  // unconditional (hooks always are) and are org-wide queries deduped by
  // react-query anyway.
  const fieldSet = usePipelineCardFieldSet();
  // `pipeline_phase` is stored, but rows written before it existed can still be
  // null — derive from the stage in that case so those cards get the right
  // field set instead of silently falling back to SDR.
  const phase: PipelinePhase =
    account.pipeline_phase ?? phaseForStage(account.pipeline_stage) ?? 'sdr';
  const show = (key: CardFieldKey) => isFieldVisible(key, phase, fieldSet);
  const { money } = useMoney();

  // Customer phase gets a different card: potential ARR and founder_confidence
  // are pre-close metrics and say nothing about a live account. Same component
  // on purpose — drag, link, prefetch and quick-add behave identically and must
  // not be duplicated into a parallel CustomerCard.
  const { byAccount: signalsByAccount, thresholds } = useCustomerSignals();
  const isCustomer = account.pipeline_phase === 'customer';
  const signals = isCustomer ? signalsByAccount.get(account.id) : undefined;
  const badges = signals ? customerBadges(signals, thresholds, Date.now()) : [];

  // Health from logs (source of truth, same as the Table view): no log → no chip.
  const { trends } = useHealthTrends();
  const healthScore = trends[account.id]?.latest ?? null;
  const healthStatus = scoreToHealthStatus(healthScore);

  const lastChangeDate = account.stage_changed_at
    ? new Date(account.stage_changed_at)
    : null;
  const daysInStage = lastChangeDate
    ? differenceInCalendarDays(new Date(), lastChangeDate)
    : null;

  // Composed lines: each part is its own toggle, and the order is the registry's
  // — so turning one off just drops it from the join instead of leaving a
  // dangling separator.
  const context = [
    show('segment') && account.segment,
    show('industry') && account.industry,
    show('plan') && account.plan,
    show('region') && account.region,
  ].filter(Boolean).join(' · ');
  const sourceLabel = show('source') && account.source ? account.source : null;
  const dates = [
    show('nextStepDue') && account.next_step_due
      ? `Next ${new Date(account.next_step_due).toLocaleDateString('en-US')}`
      : null,
    show('lastContact') && account.lastContact
      ? `Last ${new Date(account.lastContact).toLocaleDateString('en-US')}`
      : null,
  ].filter(Boolean).join(' · ');

  const tags = show('tags') ? account.tags ?? [] : [];
  // The same two columns the `potentialArr` chip reads, spelled out per period.
  // Off by default, so a board shows one of the two, not both.
  const mrrArr = show('mrrArr')
    ? [
        account.mrr ? `${money(account.mrr)}/mo` : null,
        account.arr ? `${money(account.arr)}/yr` : null,
      ].filter(Boolean).join(' · ')
    : '';

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
      }}
      {...attributes}
      {...listeners}
      className="group relative rounded-lg border border-subtle bg-card px-2.5 py-2 shadow-soft cursor-grab active:cursor-grabbing"
    >
      <Link
        to={`/account/${account.id}`}
        onClick={(e) => {
          if (isDragging) e.preventDefault();
        }}
        className="block"
      >
        {/* Name is the only strong text on the card; health rides the same line. */}
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold truncate">{account.name}</div>
          {show('health') && healthScore !== null && (
            <span
              className="flex items-center gap-1 shrink-0 text-xs font-medium tabular-nums"
              aria-label={`Health ${healthLabel[healthStatus]} (${healthScore})`}
              title={`Health: ${healthLabel[healthStatus]}`}
            >
              <span className={`h-2 w-2 rounded-full ${healthDotColor[healthStatus]}`} aria-hidden />
              {healthScore}
            </span>
          )}
        </div>
        {context && (
          <div className="text-xs text-muted-foreground truncate mt-0.5">{context}</div>
        )}
        {(sourceLabel || tags.length > 0) && (
          <div className="flex flex-wrap items-center gap-1 mt-1">
            {sourceLabel && (
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-medium">
                {sourceLabel}
              </Badge>
            )}
            {/* Same cap as the customer signal badges: a card with fifteen tags
                stops being scannable, which is the whole point of a card. */}
            {tags.slice(0, 3).map((t) => (
              <Badge key={t} variant="secondary" className="text-[9px] py-0 px-1">
                {t}
              </Badge>
            ))}
            {tags.length > 3 && (
              <Badge variant="secondary" className="text-[9px] py-0 px-1"
                     title={tags.slice(3).join(' · ')}>
                +{tags.length - 3}
              </Badge>
            )}
          </div>
        )}
        {/* Meta: owner status (left) · days-in-stage (right, clarified).
            Both owner markers stay negative-only: the board already groups by
            owner, and two resolved names would double the densest line here. */}
        <div className="flex items-center justify-between gap-2 mt-1 text-xs text-muted-foreground">
          <span className="truncate">
            {[
              show('revenueOwner') && !account.revenue_owner_id ? '○ No revenue owner' : '',
              show('deliveryOwner') && !account.delivery_owner_id ? '○ No delivery owner' : '',
            ].filter(Boolean).join(' · ')}
          </span>
          {show('daysInStage') && daysInStage !== null && (
            <span className="shrink-0 tabular-nums">{daysInStage}d in stage</span>
          )}
        </div>
        {isCustomer ? (
          signals && (
            <>
              {/* Usage line: how much they use, and which way it is going.
                  The delta carries an arrow AND a sign AND a number — status is
                  never conveyed by colour alone (WCAG). */}
              {(show('usage') || show('usageDelta')) && (
              <div className="flex items-center justify-between gap-2 mt-1">
                {show('usage') && (
                <span className="text-xs font-medium tabular-nums" title="Product usage, last 4 weeks">
                  {signals.usage4w > 0 ? `${compactAmount(signals.usage4w)} usage / 4w` : '—'}
                </span>
                )}
                {/* null means "no baseline", which is NOT a 0% change. */}
                {show('usageDelta') && (
                <span
                  className={cn(
                    'text-xs tabular-nums shrink-0 ml-auto',
                    signals.usageDeltaPct === null
                      ? 'text-muted-foreground'
                      : signals.usageDeltaPct > 0
                        ? 'text-emerald-700'
                        : signals.usageDeltaPct < 0
                          ? 'text-destructive'
                          : 'text-muted-foreground',
                  )}
                  title="Usage, last 4 weeks vs. the 4 before"
                >
                  {signals.usageDeltaPct === null
                    ? '—'
                    : `${signals.usageDeltaPct > 0 ? '▲ +' : signals.usageDeltaPct < 0 ? '▼ ' : ''}${Math.round(signals.usageDeltaPct * 100)}%`}
                </span>
                )}
              </div>
              )}

              {/* At Risk explains itself in words. A risk with no reason is noise. */}
              {show('riskReason') && account.pipeline_stage === 'at_risk' && account.customer_risk_reason && (
                <div className="text-[11px] text-destructive mt-1 truncate"
                     title={customerRiskReasonLabel(account.customer_risk_reason)}>
                  {customerRiskReasonLabel(account.customer_risk_reason)}
                </div>
              )}

              {/* Contraction and dormancy are not columns — they live here, so
                  the five-column board does not lose the information. Capped at
                  3 visible; the rest collapse rather than swamping the card. */}
              {show('customerBadges') && badges.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {badges.slice(0, 3).map((b) => (
                    <Badge
                      key={b}
                      variant={b === 'Dormant' ? 'destructive' : 'secondary'}
                      className="text-[9px] py-0 px-1"
                    >
                      {b}
                    </Badge>
                  ))}
                  {badges.length > 3 && (
                    <Badge variant="secondary" className="text-[9px] py-0 px-1"
                           title={badges.slice(3).join(' · ')}>
                      +{badges.length - 3}
                    </Badge>
                  )}
                </div>
              )}
            </>
          )
        ) : (
          ((show('potentialArr') && account.arr > 0) ||
            (show('confidence') && account.founder_confidence)) && (
            <div className="flex items-center justify-between gap-2 mt-1">
              <span className="text-xs font-medium tabular-nums">
                {show('potentialArr') && account.arr > 0
                  ? `~${money(account.arr)}`
                  : ''}
              </span>
              {show('confidence') && account.founder_confidence && (
                <Badge variant="outline" className="text-[10px] py-0 shrink-0">
                  {CONFIDENCE_LABEL[account.founder_confidence] ?? account.founder_confidence}
                </Badge>
              )}
            </div>
          )
        )}
        {show('expectedClose') && account.expected_close_date && (
          <div className="text-[11px] text-muted-foreground mt-1 truncate">
            Close {new Date(account.expected_close_date).toLocaleDateString('en-US')}
          </div>
        )}
        {show('nextStep') && account.next_step && (
          <div className="text-[11px] text-muted-foreground mt-1 truncate" title={account.next_step}>
            → {account.next_step}
          </div>
        )}
        {dates && (
          <div className="text-[11px] text-muted-foreground mt-1 truncate">{dates}</div>
        )}
        {mrrArr && (
          <div className="text-[11px] text-muted-foreground mt-1 truncate tabular-nums">{mrrArr}</div>
        )}
        {show('customerSince') && account.customerSince && (
          <div className="text-[11px] text-muted-foreground mt-1 truncate">
            Since {new Date(account.customerSince).toLocaleDateString('en-US')}
          </div>
        )}

      </Link>

      {/* Quick-add: hover/focus-revealed so it doesn't reserve a card row. It sits
          outside the Link and swallows pointer/click so it never starts a drag or
          navigates. focus-within keeps it keyboard-reachable. */}
      <div
        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <QuickAddActivity
          accountId={account.id}
          accountName={account.name}
          trigger={
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground bg-card border border-subtle shadow-soft"
            >
              <Plus className="h-3 w-3 mr-1" /> Log
            </Button>
          }
        />
      </div>
    </div>
  );
}
