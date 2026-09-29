import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import { GlobalFetchBar } from './fetch-bar';

/**
 * The bar answers the second half of the stale-data bug: the QueryClient runs
 * `placeholderData: (prev) => prev` globally, so a period or account change
 * keeps the PREVIOUS figures on screen with `isLoading === false` and then
 * swaps them without warning. This is the only thing that says "being checked".
 */
function renderBar(qc: QueryClient) {
  return render(
    <QueryClientProvider client={qc}>
      <div style={{ position: 'relative' }}>
        <GlobalFetchBar />
      </div>
    </QueryClientProvider>,
  );
}

const sweep = (c: HTMLElement) => c.querySelector('.animate-fetch-sweep')!.parentElement!;

describe('GlobalFetchBar', () => {
  let qc: QueryClient;

  beforeEach(() => {
    vi.useFakeTimers();
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });
  afterEach(() => {
    vi.useRealTimers();
    qc.clear();
  });

  it('stays hidden when nothing is fetching', () => {
    const { container } = renderBar(qc);
    expect(sweep(container)).toHaveClass('opacity-0');
  });

  it('stays hidden for a fetch that resolves inside the delay', async () => {
    // A hover-prefetch that lands in 40ms must not strobe the header.
    const { container } = renderBar(qc);
    const p = qc.fetchQuery({ queryKey: ['fast'], queryFn: () => Promise.resolve(1) });
    await act(async () => { await p; });
    await act(async () => { vi.advanceTimersByTime(400); });
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(sweep(container)).toHaveClass('opacity-0');
  });

  it('appears once a fetch outlives the delay, and clears when it settles', async () => {
    const { container } = renderBar(qc);

    let release!: (v: number) => void;
    const slow = new Promise<number>((res) => { release = res; });
    const p = qc.fetchQuery({ queryKey: ['slow'], queryFn: () => slow });

    // Two advances: the first lets react-query's notifyManager deliver the
    // isFetching change (which is when the component arms its delay), the
    // second lets that 250ms delay elapse.
    await act(async () => { await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(sweep(container)).toHaveClass('opacity-100');

    await act(async () => { release(1); await p; });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(sweep(container)).toHaveClass('opacity-0');
  });

  it('is decorative to assistive tech — the skeletons carry the announcement', () => {
    const { container } = renderBar(qc);
    expect(sweep(container)).toHaveAttribute('aria-hidden', 'true');
  });
});
