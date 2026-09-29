import { describe, it, expect } from 'vitest';
import {
  stageReadiness,
  nextForwardStage,
  blockerFor,
  QUALIFICATION_REQUIRED_ITEMS,
  QUALIFICATION_AFFIRMATIVE_ITEMS,
  type ReadinessAccount,
  type ReadinessContact,
} from './stageReadiness';
import type { PipelineStage } from './pipelineStages';

const answered = (value: boolean) => ({ answer: value });

/** All 8 required items answered `true`. */
const fullChecklist = Object.fromEntries(
  QUALIFICATION_REQUIRED_ITEMS.map((k) => [k, answered(true)]),
);

const account = (over: Partial<ReadinessAccount> = {}): ReadinessAccount => ({
  pipeline_stage: 'discovery_call',
  mrr: 0,
  qualification_checklist: null,
  ...over,
});

const engagedDecisionMaker: ReadinessContact = {
  role_in_deal: 'decision_maker',
  deal_engagement: 'engaged',
};

describe('nextForwardStage', () => {
  it('walks the forward ladder one rung at a time', () => {
    expect(nextForwardStage('target')).toBe('working');
    expect(nextForwardStage('discovery_call')).toBe('qualified_opportunity');
    expect(nextForwardStage('business_case')).toBe('sign_off');
    expect(nextForwardStage('sign_off')).toBe('closed_won');
  });

  // Mirrors pipeline_stage_rank() returning NULL for these: a deal has to be
  // able to die from anywhere, so off-ladder stages are unconstrained.
  it.each(['paused', 'disqualified', 'closed_lost', 'churned', 'at_risk', 'expanding'] as PipelineStage[])(
    'has no next stage for the off-ladder stage %s',
    (stage) => {
      expect(nextForwardStage(stage)).toBeNull();
    },
  );

  it('has no next stage at the top of the ladder or with no stage at all', () => {
    expect(nextForwardStage('steady')).toBeNull();
    expect(nextForwardStage(null)).toBeNull();
  });
});

describe('stageReadiness — off the ladder', () => {
  it('reports nothing for a stage that cannot advance', () => {
    const r = stageReadiness(account({ pipeline_stage: 'closed_lost' }));
    expect(r.nextStage).toBeNull();
    expect(r.blockers).toEqual([]);
  });

  it('reports nothing for a missing account', () => {
    expect(stageReadiness(null).blockers).toEqual([]);
  });
});

// The core requirement: the signal appears when the field is missing and
// disappears when it is filled. Every gate is asserted in both directions.
describe('gate: business_case requires mrr > 0', () => {
  const at = (mrr: number | null) =>
    stageReadiness(account({ pipeline_stage: 'qualified_opportunity', mrr }));

  it('blocks when mrr is zero', () => {
    expect(blockerFor(at(0), 'mrr')).toBeDefined();
  });

  it('blocks when mrr is null', () => {
    expect(blockerFor(at(null), 'mrr')).toBeDefined();
  });

  it('clears once a value is set', () => {
    expect(blockerFor(at(20000), 'mrr')).toBeUndefined();
  });

  it('comes back when the value is removed again', () => {
    expect(blockerFor(at(20000), 'mrr')).toBeUndefined();
    expect(blockerFor(at(0), 'mrr')).toBeDefined();
  });

  it('does not fire at a stage where business_case is not next', () => {
    expect(blockerFor(stageReadiness(account({ pipeline_stage: 'target', mrr: 0 })), 'mrr'))
      .toBeUndefined();
  });
});

describe('gate: sign_off no longer requires a proposal expiry', () => {
  it('advances to sign_off with nothing but the stage', () => {
    const r = stageReadiness(account({ pipeline_stage: 'business_case' }));
    expect(r.nextStage).toBe('sign_off');
    expect(r.blockers).toEqual([]);
  });
});

describe('gate: closed_won requires an engaged decision maker', () => {
  const at = (contacts: ReadinessContact[]) =>
    stageReadiness(account({ pipeline_stage: 'sign_off' }), contacts);

  it('blocks with no contacts at all', () => {
    expect(blockerFor(at([]), 'deal_coverage')).toBeDefined();
  });

  // The common real-world state: roles filled in, and deal_engagement left at
  // 'identified' on every contact because nothing prompted the next step.
  it('blocks when the decision maker is only identified', () => {
    const r = at([{ role_in_deal: 'decision_maker', deal_engagement: 'identified' }]);
    expect(blockerFor(r, 'deal_coverage')).toBeDefined();
  });

  it('blocks when someone is engaged but is not the decision maker', () => {
    const r = at([{ role_in_deal: 'champion', deal_engagement: 'engaged' }]);
    expect(blockerFor(r, 'deal_coverage')).toBeDefined();
  });

  it('clears once a decision maker is engaged', () => {
    expect(blockerFor(at([engagedDecisionMaker]), 'deal_coverage')).toBeUndefined();
  });

  it('comes back if that contact is downgraded', () => {
    expect(blockerFor(at([engagedDecisionMaker]), 'deal_coverage')).toBeUndefined();
    const r = at([{ role_in_deal: 'decision_maker', deal_engagement: 'approached' }]);
    expect(blockerFor(r, 'deal_coverage')).toBeDefined();
  });
});

describe('gate: qualified_opportunity', () => {
  const at = (over: Partial<ReadinessAccount>) =>
    stageReadiness(account({ pipeline_stage: 'discovery_call', ...over }));

  it('blocks on an empty checklist', () => {
    const b = blockerFor(at({}), 'qualification_checklist');
    expect(b).toBeDefined();
    expect(b!.reason).toContain('6 items still unanswered');
    expect(b!.reason).toContain('needs all 6 answered');
  });

  it('counts a single remaining item in the singular', () => {
    const partial = { ...fullChecklist };
    delete (partial as Record<string, unknown>).timeline;
    const b = blockerFor(at({ qualification_checklist: partial }), 'qualification_checklist');
    expect(b!.reason).toContain('1 item still unanswered');
  });

  // A "no" is a valid answer for most items — you can win without a hard
  // deadline — so answered-but-negative must clear the unanswered blocker.
  it('accepts a negative answer on a non-critical item', () => {
    const checklist = { ...fullChecklist, timeline: answered(false) };
    const b = blockerFor(
      at({ qualification_checklist: checklist }),
      'qualification_checklist',
    );
    expect(b).toBeUndefined();
  });

  it.each(QUALIFICATION_AFFIRMATIVE_ITEMS)(
    'blocks when the critical item %s is answered no',
    (key) => {
      const checklist = { ...fullChecklist, [key]: answered(false) };
      const b = blockerFor(at({ qualification_checklist: checklist }), 'qualification_checklist');
      expect(b).toBeDefined();
      expect(b!.reason).toContain('must all be yes');
    },
  );

  // The incumbent record does not gate a stage: what they use today and when
  // it renews is worth capturing, but it arrives on its own schedule.
  it('does not block qualifying on the incumbent record', () => {
    const r = at({ qualification_checklist: fullChecklist });
    expect(r.blockers).toEqual([]);
  });
});

describe('mirror with the SQL gates', () => {
  // Locked the same way pipelineStages.test.ts locks stageRank against
  // public.pipeline_stage_rank(). If a migration changes the required set,
  // this fails and forces both sides to move together.
  it('requires exactly the 6 items transition_stage checks', () => {
    expect([...QUALIFICATION_REQUIRED_ITEMS]).toEqual([
      'is_decision_maker',
      'pain_exists_genuinely',
      'budget_path',
      'timeline',
      'champion',
      'technical_fit',
    ]);
  });

  it('requires exactly the 3 items that must be affirmative', () => {
    expect([...QUALIFICATION_AFFIRMATIVE_ITEMS]).toEqual([
      'is_decision_maker',
      'pain_exists_genuinely',
      'budget_path',
    ]);
  });

  it('every affirmative item is also a required item', () => {
    for (const k of QUALIFICATION_AFFIRMATIVE_ITEMS) {
      expect(QUALIFICATION_REQUIRED_ITEMS).toContain(k);
    }
  });
});

// --- Post-close gates ------------------------------------------------------

describe('stageReadiness - post-close gates', () => {
  const engagedBudgetOwner: ReadinessContact = {
    role_in_deal: `budget_owner`,
    deal_engagement: `engaged`,
  };

  it('blocks closed_won without a payment approver', () => {
    const r = stageReadiness(
      account({ pipeline_stage: `sign_off` }),
      [engagedDecisionMaker],
    );
    expect(r.nextStage).toBe(`closed_won`);
    expect(blockerFor(r, `payment_approver`)).toBeTruthy();
  });

  it('clears closed_won with an engaged decision maker + engaged budget owner', () => {
    const r = stageReadiness(
      account({ pipeline_stage: `sign_off` }),
      [engagedDecisionMaker, engagedBudgetOwner],
    );
    expect(r.blockers).toEqual([]);
  });

  it('an identified-only budget owner does not count as payment approver', () => {
    const r = stageReadiness(
      account({ pipeline_stage: `sign_off` }),
      [engagedDecisionMaker, { role_in_deal: `budget_owner`, deal_engagement: `identified` }],
    );
    expect(blockerFor(r, `payment_approver`)).toBeTruthy();
  });

  // No kickoff date gate: closed_won -> setup is free.
  it('does not block setup on a kickoff date', () => {
    const r = stageReadiness(account({ pipeline_stage: `closed_won` }));
    expect(r.nextStage).toBe(`setup`);
    expect(r.blockers).toEqual([]);
  });

  it('blocks pilot_running without first real usage', () => {
    const r = stageReadiness(
      account({ pipeline_stage: `setup`, first_usage_at: null }),
    );
    expect(r.nextStage).toBe(`pilot_running`);
    expect(blockerFor(r, `first_usage`)).toBeTruthy();
  });

  it('clears pilot_running once usage exists', () => {
    const r = stageReadiness(
      account({ pipeline_stage: `setup`, first_usage_at: `2026-08-20T10:00:00Z` }),
    );
    expect(r.blockers).toEqual([]);
  });

  it('does not block pilot_review on a scheduled ramp review', () => {
    const r = stageReadiness(account({ pipeline_stage: `pilot_running` }));
    expect(r.nextStage).toBe(`pilot_review`);
    expect(r.blockers).toEqual([]);
  });
});
