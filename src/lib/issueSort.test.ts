import { describe, it, expect } from 'vitest';
import { isTerminalStatus, splitIssuesByCompletion } from './issueSort';

const issue = (id: string, status: string | null, updated_at = '2026-01-01T00:00:00Z') =>
  ({ id, status, updated_at });

describe('isTerminalStatus', () => {
  it('treats done and cancelled as terminal', () => {
    expect(isTerminalStatus('done')).toBe(true);
    expect(isTerminalStatus('cancelled')).toBe(true);
  });

  it('treats every working status as non-terminal', () => {
    for (const s of ['backlog', 'todo', 'in_progress']) {
      expect(isTerminalStatus(s)).toBe(false);
    }
  });

  it('handles null and undefined without throwing', () => {
    expect(isTerminalStatus(null)).toBe(false);
    expect(isTerminalStatus(undefined)).toBe(false);
  });
});

describe('splitIssuesByCompletion', () => {
  it('separates open from finished issues', () => {
    const { open, done } = splitIssuesByCompletion([
      issue('a', 'todo'),
      issue('b', 'done'),
      issue('c', 'in_progress'),
      issue('d', 'cancelled'),
    ]);
    expect(open.map(i => i.id)).toEqual(['a', 'c']);
    expect(done.map(i => i.id)).toEqual(['b', 'd']);
  });

  it('preserves the incoming order of open issues', () => {
    // The rows carry a live title input — re-sorting would steal focus mid-edit.
    const { open } = splitIssuesByCompletion([
      issue('z', 'todo', '2020-01-01T00:00:00Z'),
      issue('y', 'backlog', '2030-01-01T00:00:00Z'),
      issue('x', 'in_progress'),
    ]);
    expect(open.map(i => i.id)).toEqual(['z', 'y', 'x']);
  });

  it('orders finished issues newest-first by updated_at', () => {
    const { done } = splitIssuesByCompletion([
      issue('old', 'done', '2026-01-01T00:00:00Z'),
      issue('newest', 'cancelled', '2026-06-01T00:00:00Z'),
      issue('mid', 'done', '2026-03-01T00:00:00Z'),
    ]);
    expect(done.map(i => i.id)).toEqual(['newest', 'mid', 'old']);
  });

  it('does not blow up on missing updated_at', () => {
    const { done } = splitIssuesByCompletion([
      { id: 'a', status: 'done', updated_at: null },
      { id: 'b', status: 'done', updated_at: '2026-01-01T00:00:00Z' },
    ]);
    expect(done.map(i => i.id)).toEqual(['b', 'a']);
  });

  it('returns empty buckets for an empty list', () => {
    expect(splitIssuesByCompletion([])).toEqual({ open: [], done: [] });
  });
});
