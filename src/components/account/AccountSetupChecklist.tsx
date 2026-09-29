import { Button } from '@/components/ui/button';
import type { Account } from '@/contexts/AccountsContext';

export interface SetupItem {
  key: string; label: string; done: boolean; actionLabel: string; onAction: () => void;
}

export function buildSetupItems(args: {
  account: Account; contactCount: number; eventCount: number;
  openLogInteraction: () => void; openAddContact: () => void;
  /** Focuses the requested field's editor in the sidebar's Commercial
   * section — mounted on every tab, so no tab switch is needed. See
   * CompanyInfoPanel's `focusField` / AccountWorkspace's `openSalesSetup`. */
  openSalesSetup: (field?: 'revenue_owner_id' | 'expected_close_date') => void;
}): SetupItem[] {
  const { account, contactCount, eventCount, openLogInteraction, openAddContact, openSalesSetup } = args;
  return [
    // Only the revenue owner gates setup completeness. The delivery owner is
    // nullable by design — a pre-sale account usually has
    // none yet, so making it an item would show every deal permanently
    // incomplete.
    { key: 'revenueOwner', label: 'Assign a revenue owner', done: !!account.revenue_owner_id, actionLabel: 'Assign owner', onAction: () => openSalesSetup('revenue_owner_id') },
    { key: 'contact', label: 'Add a key contact', done: contactCount > 0, actionLabel: 'Add contact', onAction: openAddContact },
    { key: 'close', label: 'Set an expected close date', done: !!account.expected_close_date, actionLabel: 'Set date', onAction: () => openSalesSetup('expected_close_date') },
    { key: 'interaction', label: 'Log the first interaction', done: eventCount > 0, actionLabel: 'Log interaction', onAction: openLogInteraction },
  ];
}

/**
 * A thin, dismissible-feeling footer bar — not the first thing an AE sees.
 * Product setup progress is onboarding, not account work, so it lives below
 * everything else instead of above it.
 */
export function AccountSetupChecklist({ items }: { items: SetupItem[] }) {
  const remaining = items.filter(i => !i.done);
  if (remaining.length === 0) return null;
  return (
    <div className="flex items-center gap-3 flex-wrap px-3 py-2 rounded-md border border-dashed text-xs text-muted-foreground">
      <span className="shrink-0">Account setup — {items.length - remaining.length} of {items.length} done</span>
      <div className="flex items-center gap-1.5 flex-wrap">
        {remaining.map(i => (
          <Button key={i.key} size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={i.onAction}>
            {i.actionLabel}
          </Button>
        ))}
      </div>
    </div>
  );
}
