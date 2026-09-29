import { LayoutGrid, List, Inbox } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';

export type AccountsViewMode = 'table' | 'pipeline' | 'inbox';

const LS_KEY = 'accounts.viewMode';

export function useAccountsViewMode(): [AccountsViewMode, (m: AccountsViewMode) => void] {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const raw = params.get('view');
  // The `view` param is overloaded in AllAccounts: it can also hold a saved-view UUID.
  // Only treat the three known view-mode values as switcher state. When the param holds
  // anything else (e.g. a saved-view UUID), we fall back to 'table' and skip LS hydration
  // so we don't clobber that UUID.
  const fromUrl = (raw === 'pipeline' || raw === 'inbox' || raw === 'table') ? raw : null;

  // The Money view moved to the dashboard's Pipeline tab. Honor old links and
  // stale localStorage instead of silently falling back to the table.
  const legacyMoney =
    raw === 'money' || (!raw && localStorage.getItem(LS_KEY) === 'money');
  useEffect(() => {
    if (!legacyMoney) return;
    localStorage.removeItem(LS_KEY);
    navigate('/dashboard?tab=pipeline', { replace: true });
  }, [legacyMoney, navigate]);

  // Sync URL <-> localStorage with URL winning. On mount with no URL param, hydrate from LS.
  useEffect(() => {
    if (legacyMoney) return;
    if (!fromUrl) {
      // Don't hydrate from LS if the URL already holds a non-mode value (saved-view UUID).
      if (raw) return;
      const stored = localStorage.getItem(LS_KEY) as AccountsViewMode | null;
      if (stored && (stored === 'pipeline' || stored === 'inbox')) {
        const next = new URLSearchParams(params);
        next.set('view', stored);
        setParams(next, { replace: true });
      }
    } else {
      localStorage.setItem(LS_KEY, fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromUrl]);

  const mode: AccountsViewMode = fromUrl ?? 'table';
  const setMode = (m: AccountsViewMode) => {
    const next = new URLSearchParams(params);
    if (m === 'table') next.delete('view');
    else next.set('view', m);
    setParams(next, { replace: true });
    localStorage.setItem(LS_KEY, m);
  };
  return [mode, setMode];
}

interface Props {
  mode: AccountsViewMode;
  onChange: (m: AccountsViewMode) => void;
}

const BUTTON_BASE =
  'inline-flex items-center gap-1 px-2.5 py-1 text-sm border-y border-l first:rounded-l-md last:rounded-r-md last:border-r transition-colors';

export function AccountsViewSwitcher({ mode, onChange }: Props) {
  return (
    <div className="inline-flex" role="tablist" aria-label="View mode">
      {([
        { key: 'table' as const,    label: 'Table',    icon: List },
        { key: 'pipeline' as const, label: 'Pipeline', icon: LayoutGrid },
        { key: 'inbox' as const,    label: 'Inbox',    icon: Inbox },
      ]).map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          role="tab"
          aria-selected={mode === key}
          className={cn(
            BUTTON_BASE,
            mode === key
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-foreground border-input hover:bg-accent'
          )}
          onClick={() => onChange(key)}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
