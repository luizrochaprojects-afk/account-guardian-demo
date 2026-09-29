import { describe, expect, it } from 'vitest';
import {
  buildCounterBoard,
  rowsForCell,
  HYGIENE_FLAGS,
  FLAG_META,
  UNASSIGNED_LABEL,
  type HygieneFlagRow,
} from './hygieneCounters';

const row = (over: Partial<HygieneFlagRow>): HygieneFlagRow => ({
  accountId: 'acc-1',
  accountName: 'Northwind Supply',
  pipelineStage: 'business_case',
  flag: 'no_next_step',
  detail: null,
  ownerUserId: 'u-priya',
  ownerDisplayName: 'Priya',
  ...over,
});

describe('flag vocabulary', () => {
  it('tracks the seven flags in board order', () => {
    expect([...HYGIENE_FLAGS]).toEqual([
      'near_money_stalled',
      'no_next_step',
      'next_step_overdue',
      'no_future_meeting',
      'stuck_in_stage',
      'missing_contact_roles',
      'missing_basics',
    ]);
  });

  it('numbers the counters 1 to 7 in that same order', () => {
    expect(HYGIENE_FLAGS.map((f) => FLAG_META[f].counter)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  });

  it('puts the same-day (crit) flags before the within-the-week (warn) ones', () => {
    const severities = HYGIENE_FLAGS.map((f) => FLAG_META[f].severity);
    expect(severities).toEqual(['crit', 'crit', 'crit', 'crit', 'warn', 'warn', 'warn']);
  });

  it('no longer knows the retired flags', () => {
    const board = buildCounterBoard(
      ['missing_incumbent', 'lost_without_reason', 'resurrection_overdue'].map((flag, i) =>
        row({ accountId: `r${i}`, flag }),
      ),
    );
    expect(board.grandTotal).toBe(0);
  });
});

describe('buildCounterBoard', () => {
  it('returns an empty board for no rows', () => {
    const board = buildCounterBoard([]);
    expect(board.owners).toEqual([]);
    expect(board.grandTotal).toBe(0);
  });

  it('counts per owner and per flag, with totals', () => {
    const board = buildCounterBoard([
      row({ accountId: 'a1' }),
      row({ accountId: 'a2' }),
      row({ accountId: 'a3', flag: 'next_step_overdue' }),
      row({ accountId: 'a4', ownerUserId: 'u-marcus', ownerDisplayName: 'Marcus Lee' }),
    ]);

    expect(board.grandTotal).toBe(4);
    expect(board.totals.no_next_step).toBe(3);
    expect(board.totals.next_step_overdue).toBe(1);

    const priya = board.owners.find((o) => o.ownerUserId === 'u-priya')!;
    expect(priya.counts.no_next_step).toBe(2);
    expect(priya.counts.next_step_overdue).toBe(1);
    expect(priya.total).toBe(3);
  });

  it('sorts owners by name and sinks the unassigned bucket to the end', () => {
    const board = buildCounterBoard([
      row({ ownerUserId: null, ownerDisplayName: null }),
      row({ ownerUserId: 'u-tomas', ownerDisplayName: 'Tomas Reyes' }),
      row({ ownerUserId: 'u-priya', ownerDisplayName: 'Priya' }),
    ]);

    expect(board.owners.map((o) => o.ownerDisplayName)).toEqual([
      'Priya',
      'Tomas Reyes',
      UNASSIGNED_LABEL,
    ]);
  });

  it('drops flags this build does not know, instead of crashing', () => {
    const board = buildCounterBoard([
      row({}),
      row({ accountId: 'a9', flag: 'brand_new_server_flag' }),
    ]);
    expect(board.grandTotal).toBe(1);
  });

  it('labels an owned row with a missing display name as Unknown owner', () => {
    const board = buildCounterBoard([row({ ownerDisplayName: null })]);
    expect(board.owners[0].ownerDisplayName).toBe('Unknown owner');
  });
});

describe('rowsForCell', () => {
  it('filters by flag and owner, keeping null owner distinct', () => {
    const rows = [
      row({ accountId: 'a1' }),
      row({ accountId: 'a2', ownerUserId: null }),
      row({ accountId: 'a3', flag: 'stuck_in_stage' }),
    ];
    expect(rowsForCell(rows, 'no_next_step', 'u-priya').map((r) => r.accountId)).toEqual(['a1']);
    expect(rowsForCell(rows, 'no_next_step', null).map((r) => r.accountId)).toEqual(['a2']);
  });
});
