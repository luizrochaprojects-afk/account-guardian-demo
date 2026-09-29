// Buying-committee role + engagement options for deal coverage (Phase 2).
// Values must match the CHECK constraints on `contacts` in
// supabase/schema.sql.

export type DealRole =
  | 'champion' | 'decision_maker' | 'budget_owner' | 'user' | 'technical_evaluator'
  | 'influencer' | 'procurement' | 'legal' | 'blocker' | 'none';

export type DealEngagement =
  | 'identified' | 'approached' | 'engaged' | 'left_company' | 'not_interested';

export const ROLE_OPTIONS: { value: DealRole; label: string }[] = [
  { value: 'none', label: '—' },
  { value: 'champion', label: 'Champion' },
  { value: 'decision_maker', label: 'Decision maker' },
  { value: 'budget_owner', label: 'Budget owner' },
  { value: 'user', label: 'User' },
  { value: 'technical_evaluator', label: 'Technical evaluator' },
  { value: 'influencer', label: 'Influencer' },
  { value: 'procurement', label: 'Procurement' },
  { value: 'legal', label: 'Legal' },
  { value: 'blocker', label: 'Blocker' },
];

export const ENGAGEMENT_OPTIONS: { value: DealEngagement; label: string }[] = [
  { value: 'identified', label: 'Identified' },
  { value: 'approached', label: 'Approached' },
  { value: 'engaged', label: 'Engaged' },
  { value: 'left_company', label: 'Left company' },
  { value: 'not_interested', label: 'Not interested' },
];

const ROLE_LABEL = Object.fromEntries(ROLE_OPTIONS.map(o => [o.value, o.label]));
const ENGAGEMENT_LABEL = Object.fromEntries(ENGAGEMENT_OPTIONS.map(o => [o.value, o.label]));

export const roleLabel = (v: string) => ROLE_LABEL[v] ?? v;
export const engagementLabel = (v: string) => ENGAGEMENT_LABEL[v] ?? v;

/**
 * Badge colours per role, for the contacts table.
 *
 * `blocker` is red; roles with no strong signal get the neutral muted
 * treatment, so colour only shows up where it means something.
 */
export const ROLE_COLORS: Record<DealRole, string> = {
  champion: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  budget_owner: 'bg-blue-100 text-blue-800 border-blue-200',
  technical_evaluator: 'bg-violet-100 text-violet-800 border-violet-200',
  decision_maker: 'bg-amber-100 text-amber-800 border-amber-200',
  blocker: 'bg-red-100 text-red-800 border-red-200',
  user: 'bg-muted text-muted-foreground',
  influencer: 'bg-muted text-muted-foreground',
  procurement: 'bg-muted text-muted-foreground',
  legal: 'bg-muted text-muted-foreground',
  none: 'bg-muted text-muted-foreground',
};

/**
 * Most-to-least load-bearing in a deal, for sorting the contacts table. The
 * people who decide come first; `none` sinks to the bottom.
 */
export const ROLE_PRIORITY: readonly DealRole[] = [
  'decision_maker', 'champion', 'budget_owner', 'technical_evaluator',
  'influencer', 'procurement', 'legal', 'user', 'blocker', 'none',
] as const;

/** Full role name, for the badge tooltip. */
export const ROLE_FULL_LABELS: Record<DealRole, string> = {
  champion: 'Champion',
  decision_maker: 'Decision maker',
  budget_owner: 'Budget owner',
  user: 'User',
  technical_evaluator: 'Technical evaluator',
  influencer: 'Influencer',
  procurement: 'Procurement',
  legal: 'Legal',
  blocker: 'Blocker',
  none: 'No role set',
};
