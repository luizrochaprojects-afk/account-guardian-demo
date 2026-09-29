import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useNavigationType } from 'react-router-dom';
import type { ReactNode } from 'react';
import {
  useDashboardPeriod,
  resolveTab,
  presetFromSince,
  DEFAULT_TAB,
} from './useDashboardPeriod';

function wrapperFor(initialEntry: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>;
  };
}

const renderAt = (url: string) =>
  renderHook(() => useDashboardPeriod(), { wrapper: wrapperFor(url) });

describe('resolveTab', () => {
  it('accepts the known tab', () => {
    expect(resolveTab('pipeline')).toBe('pipeline');
  });

  // Old bookmarks and links can carry a tab that no longer exists; they must
  // land on the default rather than render nothing.
  it('sends an unknown ?tab to the default tab', () => {
    expect(resolveTab('today')).toBe(DEFAULT_TAB);
    expect(resolveTab('revenue')).toBe(DEFAULT_TAB);
  });

  it('falls back to the default for garbage or absence — never a blank page', () => {
    expect(resolveTab('nonsense')).toBe(DEFAULT_TAB);
    expect(resolveTab(null)).toBe(DEFAULT_TAB);
    expect(resolveTab('')).toBe(DEFAULT_TAB);
    expect(resolveTab('PIPELINE')).toBe(DEFAULT_TAB); // case-sensitive on purpose
  });
});

describe('presetFromSince', () => {
  const now = new Date(2026, 6, 28);
  it('recognises the three presets exactly', () => {
    expect(presetFromSince(new Date(2026, 6, 21), now)).toBe('7');
    expect(presetFromSince(new Date(2026, 5, 30), now)).toBe('28');
    expect(presetFromSince(new Date(2026, 3, 29), now)).toBe('90');
  });

  it('anything else is custom', () => {
    expect(presetFromSince(new Date(2026, 6, 15), now)).toBe('custom');
  });
});

describe('useDashboardPeriod — URL as the source of truth', () => {
  it('hydrates tab and since from the query string', () => {
    const { result } = renderAt('/dashboard?tab=pipeline&since=2026-07-01');
    expect(result.current.tab).toBe('pipeline');
    expect(result.current.sinceIso).toBe('2026-07-01');
  });

  it('defaults to the Pipeline tab with no params', () => {
    const { result } = renderAt('/dashboard');
    expect(result.current.tab).toBe('pipeline');
  });

  it('survives a garbage since without throwing, falling back to the default window', () => {
    const { result } = renderAt('/dashboard?since=banana');
    expect(result.current.preset).toBe('28');
    expect(result.current.since).toBeInstanceOf(Date);
    expect(Number.isNaN(result.current.since.getTime())).toBe(false);
  });

  it('setTab writes the param', () => {
    const { result } = renderAt('/dashboard?tab=nonsense');
    act(() => result.current.setTab('pipeline'));
    expect(result.current.tab).toBe('pipeline');
  });

  it('changing one param preserves the others', () => {
    const { result } = renderAt('/dashboard?since=2026-07-01');
    act(() => result.current.setTab('pipeline'));
    expect(result.current.tab).toBe('pipeline');
    expect(result.current.sinceIso).toBe('2026-07-01'); // not clobbered
  });

  it('setPreset moves the window to the preset span', () => {
    const { result } = renderAt('/dashboard');
    act(() => result.current.setPreset('7'));
    expect(result.current.preset).toBe('7');
  });

  it('weeksInWindow is clamped to a chart-sensible 4..26', () => {
    expect(renderAt('/dashboard?since=2026-07-27').result.current.weeksInWindow)
      .toBeGreaterThanOrEqual(4);
    expect(renderAt('/dashboard?since=2020-01-01').result.current.weeksInWindow)
      .toBe(26);
  });
});

describe('useDashboardPeriod — history behaviour', () => {
  /**
   * Tab flips must REPLACE, not push. Otherwise leaving the dashboard costs one
   * Back press per tab the user happened to look at.
   */
  it('navigates by REPLACE, not PUSH, when switching tabs', () => {
    const { result } = renderHook(
      () => ({ period: useDashboardPeriod(), navType: useNavigationType() }),
      { wrapper: wrapperFor('/dashboard') },
    );

    act(() => result.current.period.setTab('pipeline'));
    expect(result.current.navType).toBe('REPLACE');
    expect(result.current.period.tab).toBe('pipeline');
  });

  it('navigates by REPLACE for window changes too', () => {
    const { result } = renderHook(
      () => ({ period: useDashboardPeriod(), navType: useNavigationType() }),
      { wrapper: wrapperFor('/dashboard') },
    );

    act(() => result.current.period.setPreset('7'));
    expect(result.current.navType).toBe('REPLACE');

    act(() => result.current.period.setSince(new Date(2026, 6, 1)));
    expect(result.current.navType).toBe('REPLACE');
  });
});
