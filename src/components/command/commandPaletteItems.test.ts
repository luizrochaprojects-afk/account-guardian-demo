import { describe, it, expect } from 'vitest';
import { buildPaletteSections, PAGES, ACTIONS } from './commandPaletteItems';

const sampleAccounts = [
  { id: 'acc-1', name: 'Acme Corp', segment: 'Enterprise', healthScore: 85 },
  { id: 'acc-2', name: 'Globex', segment: 'Mid-Market', healthScore: 72 },
];

describe('buildPaletteSections', () => {
  it('maps accounts to {id, name, segment, healthScore}', () => {
    const { accounts } = buildPaletteSections(sampleAccounts, false);
    expect(accounts).toHaveLength(2);
    expect(accounts[0]).toEqual({
      id: 'acc-1',
      name: 'Acme Corp',
      segment: 'Enterprise',
      healthScore: 85,
    });
    expect(accounts[1]).toEqual({
      id: 'acc-2',
      name: 'Globex',
      segment: 'Mid-Market',
      healthScore: 72,
    });
  });

  it('returns all accounts without capping or sorting', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      id: `id-${i}`,
      name: `Account ${i}`,
      segment: 'Startup',
      healthScore: i,
    }));
    const { accounts } = buildPaletteSections(many, false);
    expect(accounts).toHaveLength(100);
  });

  it('gives members and founders the same demo pages and actions', () => {
    const member = buildPaletteSections([], false);
    const founder = buildPaletteSections([], true);
    expect(member.pages).toEqual(founder.pages);
    expect(member.actions).toEqual(founder.actions);
  });

  it('hides founder-only entries from members', () => {
    const founderOnly = PAGES.filter((p) => p.founderOnly).map((p) => p.id);
    const member = buildPaletteSections([], false);
    for (const id of founderOnly) expect(member.pages.map((p) => p.id)).not.toContain(id);
  });
});

describe('palette contents', () => {
  // Every entry must land on a screen the demo actually has: a palette entry
  // pointing at a route that doesn't exist is a dead end on the first ⌘K.
  const ROUTES = ['/dashboard', '/accounts', '/tasks', '/health-config', '/about'];

  it('only lists pages that exist', () => {
    for (const p of PAGES) expect(ROUTES).toContain(p.path.split('?')[0]);
  });

  it('offers the tour and a reset, and no sign-out', () => {
    expect(ACTIONS.map((a) => a.run).sort()).toEqual(['resetDemo', 'tour']);
    expect(ACTIONS.some((a) => /sign out/i.test(a.label))).toBe(false);
  });
});
