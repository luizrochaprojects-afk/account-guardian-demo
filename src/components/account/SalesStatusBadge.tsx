// NOTE: this file used to also export a `SalesStatusBadge` component that
// rendered these same stage/days/confidence facts inline. The stage picker
// in AccountHeader.tsx absorbed that surface (see the comment above
// StagePicker there), so the component was dead — removed, keeping just the
// label/color maps it and AccountHeader both still depend on.

export const STAGE_LABEL: Record<string, string> = {
  target: 'Target',
  working: 'Working',
  paused: 'Paused',
  disqualified: 'Disqualified',
  discovery_call: 'Meeting booked',
  qualified_opportunity: 'Qualified Opp.',
  business_case: 'Business Case',
  sign_off: 'Sign-off',
  closed_lost: 'Closed Lost',
  closed_won: 'Closed Won',
  setup: 'Setup',
  pilot_running: 'Pilot Running',
  pilot_review: 'Pilot Review',
  adoption: 'Adoption',
  ramping: 'Ramping',
  steady: 'Steady',
  expanding: 'Expanding',
  at_risk: 'At Risk',
  churned: 'Churned',
};

export const STAGE_COLOR: Record<string, string> = {
  closed_won: 'bg-green-100 text-green-900 border-green-300',
  steady: 'bg-green-100 text-green-900 border-green-300',
  expanding: 'bg-green-100 text-green-900 border-green-300',
  ramping: 'bg-blue-100 text-blue-900 border-blue-300',
  at_risk: 'bg-amber-100 text-amber-900 border-amber-300',
  closed_lost: 'bg-red-100 text-red-900 border-red-300',
  churned: 'bg-red-100 text-red-900 border-red-300',
  disqualified: 'bg-red-100 text-red-900 border-red-300',
  qualified_opportunity: 'bg-blue-100 text-blue-900 border-blue-300',
};
