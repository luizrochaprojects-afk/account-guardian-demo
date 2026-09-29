import { useState } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { useContactsDB } from '@/hooks/useContactsDB';
import { useDealCoverage } from '@/hooks/useDealCoverage';
import {
  ROLE_OPTIONS, ENGAGEMENT_OPTIONS, type DealRole, type DealEngagement,
} from '@/lib/dealCoverage';
import { blockerFor } from '@/lib/stageReadiness';
import type { StageReadiness } from '@/lib/stageReadiness';

/** Buying-committee coverage: set each contact's role + engagement inline. */
export function DealCoverageSection(
  { accountId, readiness }: { accountId: string; readiness?: StageReadiness },
) {
  const { contacts, loading, addContact } = useContactsDB(accountId);
  const { setContactCoverage } = useDealCoverage();

  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftRole, setDraftRole] = useState<DealRole>('none');
  const [saving, setSaving] = useState(false);

  const engagedCount = contacts.filter(c => c.deal_engagement === 'engaged').length;
  const blocker = readiness ? blockerFor(readiness, 'deal_coverage') : undefined;

  // New contacts start as 'identified', and left alone they stay there because
  // nothing prompts the next step — so decision-maker coverage reads 0%. The
  // engagement select sits right there on the row, so the move is one click
  // away instead of a navigation.
  const submit = async () => {
    const name = draftName.trim();
    if (!name) { setAdding(false); return; }
    setSaving(true);
    await addContact({ account_id: accountId, name, role_in_deal: draftRole });
    setSaving(false);
    setDraftName('');
    setDraftRole('none');
    // Stay open: the buying committee is never one person, and reopening the
    // form for each name is the friction that leaves deals single-threaded.
  };

  if (loading) {
    return (
        <div role="status" aria-live="polite" className="space-y-2">
          <span className="sr-only">Loading deal coverage</span>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{engagedCount} engaged</span>
        {engagedCount >= 2 && <Badge variant="secondary" className="text-[10px] py-0">Multi-threaded</Badge>}
        {!adding && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 px-2 text-xs"
            onClick={() => setAdding(true)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add contact
          </Button>
        )}
      </div>

      {/*
        The closed_won gate needs a decision maker marked engaged. Flagged here
        rather than on a row, because the fix may be changing an existing
        contact's engagement OR adding someone who is not on the list yet —
        there is no single row to point at.
      */}
      {blocker && (
        <p
          className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700"
          title={blocker.reason}
        >
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{blocker.reason}</span>
        </p>
      )}

      {contacts.length === 0 && !adding && !blocker && (
        <p className="text-xs text-muted-foreground">
          No contacts yet. Coverage is what tells you whether this deal has a decision maker.
        </p>
      )}
      <ul className="space-y-2">
        {contacts.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <span className="text-sm min-w-0 flex-1 truncate" title={c.role ?? undefined}>
              {c.name}
            </span>
            <Select
              value={c.role_in_deal ?? 'none'}
              onValueChange={(v) => setContactCoverage(c.id, { role_in_deal: v as DealRole })}
            >
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={c.deal_engagement ?? 'identified'}
              onValueChange={(v) => setContactCoverage(c.id, { deal_engagement: v as DealEngagement })}
            >
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ENGAGEMENT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </li>
        ))}
      </ul>

      {adding && (
        <div className="flex items-center gap-2 border-t pt-2">
          <Input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void submit(); }
              if (e.key === 'Escape') { setAdding(false); setDraftName(''); }
            }}
            placeholder="Contact name"
            className="h-8 min-w-0 flex-1 text-xs"
          />
          <Select value={draftRole} onValueChange={(v) => setDraftRole(v as DealRole)}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8 text-xs" disabled={!draftName.trim() || saving} onClick={() => void submit()}>
            {saving ? 'Saving…' : 'Add'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => { setAdding(false); setDraftName(''); }}
          >
            Done
          </Button>
        </div>
      )}
    </div>
  );
}
