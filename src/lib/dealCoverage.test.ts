import { describe, it, expect } from 'vitest';
import {
  ROLE_OPTIONS,
  ROLE_COLORS,
  ROLE_PRIORITY,
  ROLE_FULL_LABELS,
  ENGAGEMENT_OPTIONS,
  type DealRole,
} from './dealCoverage';

const ALL_ROLES = ROLE_OPTIONS.map((o) => o.value);

// role_in_deal is the single role vocabulary. Four maps key off it —
// options, colours, sort priority, tooltips — and a role missing from any one of
// them fails silently: an unstyled badge, or a contact sorted to position -1 and
// jumping to the top of the table. These lock the maps together.
describe('deal role maps stay in step', () => {
  it('every role has a badge colour', () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_COLORS[role], `${role} has no colour`).toBeTruthy();
    }
  });

  it('every role has a full label for the tooltip', () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_FULL_LABELS[role], `${role} has no full label`).toBeTruthy();
    }
  });

  it('every role appears exactly once in the sort priority', () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_PRIORITY.indexOf(role), `${role} is missing from ROLE_PRIORITY`)
        .toBeGreaterThanOrEqual(0);
    }
    expect(ROLE_PRIORITY.length).toBe(ALL_ROLES.length);
    expect(new Set(ROLE_PRIORITY).size).toBe(ROLE_PRIORITY.length);
  });

  it('sorts the people who decide above the people who do not', () => {
    const rank = (r: DealRole) => ROLE_PRIORITY.indexOf(r);
    expect(rank('decision_maker')).toBeLessThan(rank('user'));
    expect(rank('champion')).toBeLessThan(rank('influencer'));
    // 'none' means nobody has said what this contact is — it belongs last, so a
    // contacts table opens on the people who matter to the deal.
    expect(rank('none')).toBe(ROLE_PRIORITY.length - 1);
  });
});

// The values themselves are a data contract with the CHECK constraint on
// contacts.role_in_deal and with the closed_won gate in transition_stage(), which
// looks for role_in_deal = 'decision_maker' and deal_engagement = 'engaged'.
describe('mirror with the CHECK constraints', () => {
  it('carries exactly the roles the database accepts', () => {
    expect([...ALL_ROLES].sort()).toEqual([
      'blocker', 'budget_owner', 'champion', 'decision_maker', 'influencer',
      'legal', 'none', 'procurement', 'technical_evaluator', 'user',
    ]);
  });

  it('carries exactly the engagement values the database accepts', () => {
    expect(ENGAGEMENT_OPTIONS.map((o) => o.value).sort()).toEqual([
      'approached', 'engaged', 'identified', 'left_company', 'not_interested',
    ]);
  });

  it('keeps the two values the closed_won gate reads', () => {
    expect(ALL_ROLES).toContain('decision_maker');
    expect(ENGAGEMENT_OPTIONS.map((o) => o.value)).toContain('engaged');
  });
});
