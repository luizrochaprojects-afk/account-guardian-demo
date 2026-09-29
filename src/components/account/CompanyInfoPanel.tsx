import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { useAccounts, type Account } from '@/contexts/AccountsContext';
import { useCustomProperties, type CustomProperty } from '@/hooks/useCustomProperties';
import { useAccountFieldValue } from '@/hooks/useAccountFieldValue';
import { PropertyField, formatPropertyValue } from '@/components/properties/PropertyField';
import { PropertyRow } from '@/components/properties/PropertyRow';
import { useStageReadiness } from '@/hooks/useStageReadiness';
import { blockerFor, type BlockerField } from '@/lib/stageReadiness';
import { isExitStage, type PipelineStage } from '@/lib/pipelineStages';
import { useOrgSettings } from '@/hooks/useOrgSettings';
import { formatCurrencyValue } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrgMembers } from '@/hooks/useOrgMembers';

interface CompanyInfoPanelProps {
  account: Account;
  /** One-shot intent to open a specific field's editor immediately (used by the
   * setup checklist's "Assign owner" / "Set date" / "Set MRR" actions — the
   * sidebar is mounted on every tab, so there's no need to switch tabs first
   * the way the old "Edit in Sales" link did).
   *
   * `mrr` is the odd one out: it is a property row, not a Commercial row, so it
   * is routed to the property list below instead of CommercialSection. It is
   * also the only way to set the account's ARR, which is derived (mrr * 12). */
  focusField?: FocusField | null;
  onFocusHandled?: () => void;
}

export type FocusField = 'revenue_owner_id' | 'delivery_owner_id' | 'expected_close_date' | 'mrr';

const VISIBLE_PROPERTY_COUNT = 8;
// Stage now has exactly one home: the header picker.
// Filtered out here rather than just marked read-only, so it
// doesn't appear as a second, dead copy in the sidebar's custom-property list.
const HIDDEN_PROPERTY_KEYS = new Set(['pipeline_stage']);

export function CompanyInfoPanel({ account, focusField, onFocusHandled }: CompanyInfoPanelProps) {
  const { properties: allProperties } = useCustomProperties('account');
  const properties = allProperties.filter((p) => !HIDDEN_PROPERTY_KEYS.has(p.key));
  const [collapsed, setCollapsed] = useState(false);
  const [showAllProperties, setShowAllProperties] = useState(false);
  const readiness = useStageReadiness(account);

  // A property that is blocking the stage must be inside the visible slice, or
  // the whole signal is defeated exactly where it matters: `mrr` sits past the
  // 8th property on several accounts, and a warning hidden behind "View all
  // properties" is a warning nobody sees. Promoted to the front rather than
  // appended, so it is the first thing in the group.
  const blockingKeys = new Set(readiness.blockers.map((b) => b.field as string));
  const orderedProperties = properties.some((pr) => blockingKeys.has(pr.key))
    ? [
        ...properties.filter((pr) => blockingKeys.has(pr.key)),
        ...properties.filter((pr) => !blockingKeys.has(pr.key)),
      ]
    : properties;
  const visibleProperties = showAllProperties
    ? orderedProperties
    : orderedProperties.slice(0, VISIBLE_PROPERTY_COUNT);
  const hasMoreProperties = properties.length > VISIBLE_PROPERTY_COUNT;

  return (
    <div className="space-y-4">
      {/* Header with collapse toggle + link to Properties page */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1 text-xs text-muted-foreground font-medium hover:text-foreground"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          Properties
        </button>

      </div>

      {!collapsed && (
        <div className="space-y-4">
          <CommercialSection account={account} focusField={focusField} onFocusHandled={onFocusHandled} />

          {/* Account group — custom properties */}
          <div className="space-y-0.5">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Account
            </div>
            {visibleProperties.map((property) => (
              <AccountPropertyRow
                key={property.id}
                property={property}
                account={account}
                autoEdit={focusField === property.key}
                onFocusHandled={onFocusHandled}
              />
            ))}
            {properties.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                No properties defined.
              </p>
            )}
            {hasMoreProperties && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground w-full justify-start"
                onClick={() => setShowAllProperties((s) => !s)}
              >
                {showAllProperties ? 'Show fewer properties' : 'View all properties'}
              </Button>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

/**
 * Commercial group — inline-editable directly in the side panel (Expected
 * close, both owners, Source). Stage used to be duplicated here too, but it now has
 * exactly one home: the header picker — routing through
 * `useStageTransition` there, not here. (Editor duplication with
 * SalesMotionTab's Owner/Expected-close fields was removed for the same
 * reason; this panel is now their only editable copy — for both the revenue
 * owner and the delivery owner, which are separate fields.)
 *
 * Expected ARR used to sit here as well. It is gone: the account's annual
 * revenue is `arr`, derived from Potential MRR, and lives in the property list
 * below as a single read-only row.
 */
type CommercialField =
  | 'expected_close_date' | 'forecast_close_date'
  | 'revenue_owner_id' | 'delivery_owner_id' | 'source';

const SOURCE_OPTIONS = [
  'Investor relationships',
  'Founder relationships',
  'Outreach linkedin',
  'Outreach email',
  'Inbound',
];

function CommercialSection({
  account, focusField, onFocusHandled,
}: { account: Account; focusField?: FocusField | null; onFocusHandled?: () => void }) {
  const { updateAccount } = useAccounts();
  const { members: orgMembers } = useOrgMembers();
  const readiness = useStageReadiness(account);

  // "Closed" means the deal has left the sales motion — either it was won (and
  // is now an onboarding/customer account) or it exited. Both are terminal for
  // the purpose of a close date.
  const stage = account.pipeline_stage as PipelineStage | null;
  const isClosed =
    account.pipeline_phase === 'onboarding' ||
    account.pipeline_phase === 'customer' ||
    (!!stage && isExitStage(stage));

  const [editingField, setEditingField] = useState<CommercialField | null>(null);
  const [closeDraft, setCloseDraft] = useState('');
  const [forecastDraft, setForecastDraft] = useState('');

  // One-shot deep-link intent from the setup checklist (see CompanyInfoPanel).
  // `mrr` is not ours — it is a property row, and AccountPropertyRow claims it.
  useEffect(() => {
    if (!focusField || focusField === 'mrr') return;
    if (focusField === 'expected_close_date') setCloseDraft(account.expected_close_date ?? '');
    setEditingField(focusField);
    onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusField]);

  // An owner IS assigned whenever the column is set; fall back to "Unnamed" if
  // the display_name hasn't resolved rather than looking unassigned.
  const nameFor = (id: string | null) =>
    id ? orgMembers.find((m) => m.user_id === id)?.display_name || 'Unnamed' : null;

  // One editor shape, rendered twice, so the two owner rows cannot drift apart.
  const ownerEditor = (
    field: 'revenue_owner_id' | 'delivery_owner_id',
    current: string | null,
  ) => (
    <Select
      value={current ?? '__unassigned'}
      defaultOpen
      onValueChange={(v) => {
        updateAccount(account.id, { [field]: v === '__unassigned' ? null : v });
        setEditingField(null);
      }}
      onOpenChange={(o) => { if (!o) setEditingField(null); }}
    >
      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__unassigned">Not assigned</SelectItem>
        {orgMembers.map((m) => (
          <SelectItem key={m.user_id} value={m.user_id}>{m.display_name || 'Unnamed'}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-0.5">
      <div className="mb-1">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          Commercial
        </span>
      </div>


      {/*
        ONE close date on screen at a time, never both.

        These are two different facts wearing near-identical names, and showing
        them side by side was genuinely confusing: while a deal is open the only
        meaningful date is the one the seller predicts; once it has closed the
        only meaningful date is when it actually did.

        `expected_close_date` is not a forecast — the database stamps it to
        CURRENT_DATE on exit from the sales phase and it was retro-backfilled to
        organizations.created_at, which is why 8 of the 14 populated rows in
        production share 2026-04-14. Labelled "Closed on" here, and only shown
        once the deal has actually closed, where that is exactly what it means.

        `forecast_close_date` is the seller's own date, editable, and what
        close_date_changes / close_date_slips measure movement against.
      */}
      {!isClosed && (
      <PropertyRow
        label="Forecast close"
        value={account.forecast_close_date ? format(new Date(account.forecast_close_date), 'MMM d, yyyy') : undefined}
        emptyText="Not set"
        onEdit={() => { setForecastDraft(account.forecast_close_date ?? ''); setEditingField('forecast_close_date'); }}
        editing={editingField === 'forecast_close_date'}
        editor={
          <Input
            type="date"
            autoFocus
            value={forecastDraft}
            onChange={(e) => setForecastDraft(e.target.value)}
            onBlur={() => {
              updateAccount(account.id, { forecast_close_date: forecastDraft || null });
              setEditingField(null);
            }}
            className="h-7 text-xs"
          />
        }
      />
      )}

      {isClosed && (
        <PropertyRow
          label="Closed on"
          value={account.expected_close_date ? format(new Date(account.expected_close_date), 'MMM d, yyyy') : undefined}
          emptyText="Not set"
          onEdit={() => { setCloseDraft(account.expected_close_date ?? ''); setEditingField('expected_close_date'); }}
          editing={editingField === 'expected_close_date'}
          editor={
            <Input
              type="date"
              autoFocus
              value={closeDraft}
              onChange={(e) => setCloseDraft(e.target.value)}
              onBlur={() => {
                updateAccount(account.id, { expected_close_date: closeDraft || null });
                setEditingField(null);
              }}
              className="h-7 text-xs"
            />
          }
        />
      )}

      <PropertyRow
        label="Revenue owner"
        value={nameFor(account.revenue_owner_id) ?? undefined}
        emptyText="Not assigned"
        onEdit={() => setEditingField('revenue_owner_id')}
        editing={editingField === 'revenue_owner_id'}
        editor={ownerEditor('revenue_owner_id', account.revenue_owner_id)}
      />

      <PropertyRow
        label="Delivery owner"
        value={nameFor(account.delivery_owner_id) ?? undefined}
        emptyText="Not assigned"
        onEdit={() => setEditingField('delivery_owner_id')}
        editing={editingField === 'delivery_owner_id'}
        editor={ownerEditor('delivery_owner_id', account.delivery_owner_id)}
      />

      <PropertyRow
        label="Source"
        value={account.source ?? undefined}
        emptyText="Not set"
        onEdit={() => setEditingField('source')}
        editing={editingField === 'source'}
        editor={
          <Select
            value={account.source ?? '__unassigned'}
            defaultOpen
            onValueChange={(v) => {
              updateAccount(account.id, { source: v === '__unassigned' ? null : v });
              setEditingField(null);
            }}
            onOpenChange={(o) => { if (!o) setEditingField(null); }}
          >
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__unassigned">Not set</SelectItem>
              {SOURCE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

    </div>
  );
}

interface AccountPropertyRowProps {
  property: CustomProperty;
  account: Account;
  /** One-shot deep link from the setup checklist — opens this row's editor. */
  autoEdit?: boolean;
  onFocusHandled?: () => void;
}

function AccountPropertyRow({ property, account, autoEdit, onFocusHandled }: AccountPropertyRowProps) {
  const { value, setValue } = useAccountFieldValue(account, property);
  const readiness = useStageReadiness(account);
  const [editing, setEditing] = useState(false);
  const { currencySymbol, currencyCode } = useOrgSettings();

  useEffect(() => {
    if (!autoEdit) return;
    setEditing(true);
    onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit]);

  // ARR is derived from MRR (arr = mrr * 12) rather than entered directly, so
  // it's read-only here — but shown with its formula in a tooltip rather than
  // a "Calculated" badge, so the number is trustworthy at a glance.
  const readOnly = property.key === 'arr';

  const isEmpty = value === null || value === undefined || value === '';
  const display = isEmpty ? undefined : formatPropertyValue(property, value, currencySymbol);

  // select / multi_select render their menu in a portal. React's onBlur is a
  // bubbling focusout that propagates along the *React* tree — portal included
  // — so a blur-based close fires the instant the menu opens and unmounts the
  // editor before a click can land on an option. Let Radix's own open state
  // drive dismissal for those, exactly like the Commercial rows above.
  const isOverlay = property.type === 'select' || property.type === 'multi_select';

  const field = (
    <PropertyField
      property={property}
      value={value}
      autoOpen
      onDismiss={() => setEditing(false)}
      onChange={async (v) => {
        await setValue(v);
        // Overlays close themselves (-> onDismiss); text-ish inputs close on
        // blur. Only the checkbox has no dismissal of its own.
        if (property.type === 'checkbox') setEditing(false);
      }}
      size="sm"
    />
  );

  // `mrr` is the one custom property a stage gate reads (business_case needs
  // it > 0). Keyed off the property's own key rather than a separate list, so
  // adding a gate on another property is a one-line change here.
  const missing = blockerFor(readiness, property.key as BlockerField);

  return (
    <PropertyRow
      label={property.label}
      value={display}
      missing={missing}
      calculated={readOnly}
      formula={readOnly ? `${formatCurrencyValue(account.mrr, currencySymbol, currencyCode)} x 12 - from MRR` : undefined}
      onEdit={readOnly ? undefined : () => setEditing(true)}
      editing={editing}
      editor={
        isOverlay ? field : (
          <div
            onBlur={(e) => {
              // Safe here: these editors aren't portalled, so relatedTarget
              // tells us whether focus actually left the row.
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEditing(false);
            }}
          >
            {field}
          </div>
        )
      }
    />
  );
}
