import { useEffect, useState } from 'react';
import { Check, AlertTriangle, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useAccounts } from '@/contexts/AccountsContext';

// AccountMatchPill — shows the matched account name + confidence band, or
// a "no match" pill with a popover that lets the user pick one manually.
//
// Confidence bands mirror the inbox UX spec:
//   High  ≥ 0.85 (green)
//   Med   0.60–0.85 (amber)
//   Low   < 0.60 (red) — also covers persisted-but-below-threshold rows
//
// Used by SuggestionCard. When `accountId` is null we render the manual
// selector; the parent reads back the chosen id via onSelect.

interface Props {
  accountId: string | null;
  suggestedName: string | null;
  confidence: number | null;
  // When set, manual selector is shown (low/no-match path).
  onSelect?: (accountId: string) => void;
  className?: string;
}

export function AccountMatchPill({ accountId, suggestedName, confidence, onSelect, className }: Props) {
  const { accounts } = useAccounts();
  const matchedName = accountId ? accounts.find((a) => a.id === accountId)?.name ?? null : null;

  if (accountId && matchedName) {
    return <MatchedPill name={matchedName} confidence={confidence} className={className} />;
  }

  // Unmatched path. If the parent didn't supply onSelect, just render the
  // warning pill (read-only). Otherwise wrap it in a popover with a search.
  if (!onSelect) {
    return <UnmatchedPill suggestedName={suggestedName} confidence={confidence} className={className} />;
  }

  return (
    <ManualPicker
      accounts={accounts}
      suggestedName={suggestedName}
      confidence={confidence}
      onSelect={onSelect}
      className={className}
    />
  );
}

function MatchedPill({ name, confidence, className }: { name: string; confidence: number | null; className?: string }) {
  const band = bandFor(confidence);
  return (
    <Badge variant="outline" className={`gap-1 ${band.classes} ${className ?? ''}`}>
      <Check className="h-3 w-3" />
      <span className="truncate max-w-[160px]">{name}</span>
      {confidence !== null && <span className="text-[10px] opacity-75">{(confidence * 100).toFixed(0)}%</span>}
    </Badge>
  );
}

function UnmatchedPill({ suggestedName, confidence, className }: { suggestedName: string | null; confidence: number | null; className?: string }) {
  return (
    <Badge variant="outline" className={`gap-1 border-amber-400 text-amber-700 bg-amber-50 ${className ?? ''}`}>
      <AlertTriangle className="h-3 w-3" />
      <span className="truncate max-w-[160px]">No match{suggestedName ? ` — was "${suggestedName}"` : ''}</span>
      {confidence !== null && <span className="text-[10px] opacity-75">{(confidence * 100).toFixed(0)}%</span>}
    </Badge>
  );
}

interface PickerProps {
  accounts: Array<{ id: string; name: string }>;
  suggestedName: string | null;
  confidence: number | null;
  onSelect: (id: string) => void;
  className?: string;
}

function ManualPicker({ accounts, suggestedName, confidence, onSelect, className }: PickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(suggestedName ?? '');

  // Seed the query with the LLM's guess on first open so the user lands on
  // close-name results.
  useEffect(() => {
    if (open && !query && suggestedName) setQuery(suggestedName);
  }, [open, query, suggestedName]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1 rounded-md border border-amber-400 bg-amber-50 px-2 py-0.5 text-xs text-amber-800 hover:bg-amber-100 ${className ?? ''}`}
        >
          <Search className="h-3 w-3" />
          <span>Pick account{suggestedName ? ` — was "${suggestedName}"` : ''}</span>
          {confidence !== null && <span className="text-[10px] opacity-75">{(confidence * 100).toFixed(0)}%</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Search accounts..." value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>No accounts found</CommandEmpty>
            <CommandGroup>
              {accounts.map((a) => (
                <CommandItem
                  key={a.id}
                  value={a.name}
                  onSelect={() => {
                    onSelect(a.id);
                    setOpen(false);
                  }}
                >
                  {a.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function bandFor(score: number | null): { label: string; classes: string } {
  if (score === null) return { label: 'unknown', classes: 'border-muted text-muted-foreground' };
  if (score >= 0.85) return { label: 'high', classes: 'border-emerald-500 text-emerald-700 bg-emerald-50' };
  if (score >= 0.60) return { label: 'med', classes: 'border-amber-500 text-amber-700 bg-amber-50' };
  return { label: 'low', classes: 'border-red-400 text-red-700 bg-red-50' };
}
