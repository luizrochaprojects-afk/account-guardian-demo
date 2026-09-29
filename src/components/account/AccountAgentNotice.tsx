import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Inbox, ArrowRight } from 'lucide-react';
import { db } from '@/demo/db';
import { useProfile } from '@/hooks/useProfile';
import { cn } from '@/lib/utils';

// AccountAgentNotice — banner shown on AccountWorkspace when the agent has
// at least one pending suggestion for this account. Deep-links into the
// inbox pre-filtered to that account.

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose client at the agent tables' boundary
const sb = db as unknown as { from: (table: string) => any };

interface Props {
  accountId: string;
  /** Inline styling for the Overview "Now" block, instead of a full-bleed
   * banner that would repeat on every tab and push the account name down. */
  compact?: boolean;
}

export function AccountAgentNotice({ accountId, compact }: Props) {
  const { profile } = useProfile();
  const orgId = profile?.organization_id;

  const { data: count = 0 } = useQuery<number>({
    queryKey: ['agent_pending_by_account', orgId, accountId],
    enabled: !!orgId && !!accountId,
    queryFn: async () => {
      const { count, error } = await sb
        .from('agent_suggestions')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('account_id', accountId)
        .eq('status', 'pending');
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });

  if (!count) return null;
  return (
    <Link
      to={`/accounts?view=inbox&account=${accountId}`}
      className={cn(
        'flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors',
        compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm',
      )}
    >
      <Inbox className={compact ? 'h-3.5 w-3.5 text-primary shrink-0' : 'h-4 w-4 text-primary shrink-0'} />
      <span className="flex-1">
        <strong>{count}</strong> pending agent suggestion{count === 1 ? '' : 's'} for this account
      </span>
      <ArrowRight className={compact ? 'h-3.5 w-3.5 text-primary shrink-0' : 'h-4 w-4 text-primary shrink-0'} />
    </Link>
  );
}
