import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  LayoutGrid,
  Inbox,
  Users,
  CheckSquare,
  Heart,
  Info,
  PlayCircle,
  RotateCcw,
} from 'lucide-react';

export interface PageItem {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  founderOnly?: boolean;
}

export interface ActionItem {
  id: string;
  label: string;
  icon: LucideIcon;
  founderOnly?: boolean;
  run: 'navigate' | 'tour' | 'resetDemo';
  path?: string;
}

/** Every page of the demo, and nothing that is not in it. */
export const PAGES: PageItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { id: 'pipeline', label: 'Pipeline', path: '/accounts?view=pipeline', icon: LayoutGrid },
  { id: 'agent-inbox', label: 'Agent inbox', path: '/accounts?view=inbox', icon: Inbox },
  { id: 'accounts', label: 'Accounts', path: '/accounts', icon: Users },
  { id: 'tasks', label: 'Issues', path: '/tasks', icon: CheckSquare },
  { id: 'health-config', label: 'Health Score', path: '/health-config', icon: Heart },
  { id: 'about', label: 'About this demo', path: '/about', icon: Info },
];

export const ACTIONS: ActionItem[] = [
  { id: 'tour', label: 'Take the tour', icon: PlayCircle, run: 'tour' },
  { id: 'reset-demo', label: 'Reset demo data', icon: RotateCcw, run: 'resetDemo' },
];

export interface PaletteAccount {
  id: string;
  name: string;
  segment: string;
  healthScore: number;
}

export interface PaletteSections {
  accounts: PaletteAccount[];
  pages: PageItem[];
  actions: ActionItem[];
}

/**
 * Pure function: maps accounts to the palette shape and applies role-gating.
 * Does NOT cap/sort accounts — caller handles rendering limits.
 */
export function buildPaletteSections(
  accounts: { id: string; name: string; segment: string; healthScore: number }[],
  isFounder: boolean,
): PaletteSections {
  const paletteAccounts: PaletteAccount[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    segment: a.segment,
    healthScore: a.healthScore,
  }));

  const pages = isFounder ? PAGES : PAGES.filter((p) => !p.founderOnly);
  const actions = isFounder ? ACTIONS : ACTIONS.filter((a) => !a.founderOnly);

  return { accounts: paletteAccounts, pages, actions };
}
