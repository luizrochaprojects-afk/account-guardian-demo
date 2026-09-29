import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Plus } from 'lucide-react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import { useAccounts } from '@/contexts/AccountsContext';
import { useRole } from '@/hooks/useRole';
import { resetDemo } from '@/demo/store';
import { startTour } from '@/components/DemoTour';
import { QuickAddActivity } from '@/components/activities/QuickAddActivity';
import { buildPaletteSections } from './commandPaletteItems';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { accounts } = useAccounts();
  const { isFounder } = useRole();
  const [logOpen, setLogOpen] = useState(false);

  const { accounts: paletteAccounts, pages, actions } = buildPaletteSections(accounts, isFounder);

  const close = () => onOpenChange(false);

  return (
    <>
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search accounts, pages, and actions…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>

        {paletteAccounts.length > 0 && (
          <>
            <CommandGroup heading="Accounts">
              {paletteAccounts.map((account) => (
                <CommandItem
                  key={account.id}
                  value={`${account.name} ${account.segment}`}
                  onSelect={() => {
                    navigate(`/account/${account.id}`);
                    close();
                  }}
                >
                  <Building2 className="mr-2 shrink-0" />
                  <span className="flex-1 truncate">{account.name}</span>
                  {account.segment && (
                    <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                      {account.segment}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Pages">
          {pages.map((page) => {
            const Icon = page.icon;
            return (
              <CommandItem
                key={page.id}
                value={page.label}
                onSelect={() => {
                  navigate(page.path);
                  close();
                }}
              >
                <Icon className="mr-2 shrink-0" />
                <span>{page.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem
            value="Log activity"
            onSelect={() => {
              close();
              setLogOpen(true);
            }}
          >
            <Plus className="mr-2 shrink-0" />
            <span>Log activity</span>
          </CommandItem>
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <CommandItem
                key={action.id}
                value={action.label}
                onSelect={async () => {
                  try {
                    if (action.run === 'navigate' && action.path) {
                      navigate(action.path);
                    } else if (action.run === 'tour') {
                      startTour();
                    } else if (action.run === 'resetDemo') {
                      resetDemo();
                    }
                  } finally {
                    close();
                  }
                }}
              >
                <Icon className="mr-2 shrink-0" />
                <span>{action.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>

    {/* Controlled quick-add opened from the "Log activity" action (account picker). */}
    <QuickAddActivity open={logOpen} onOpenChange={setLogOpen} />
    </>
  );
}
