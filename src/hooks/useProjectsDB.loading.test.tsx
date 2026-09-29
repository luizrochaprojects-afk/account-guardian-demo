import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * ProjectWorkspace resolves its project with `projects.find(...) || null` and
 * then renders "Project not found." So the honesty of that page rests entirely
 * on this hook: while the org is still resolving, `projects` is `[]` and the
 * hook MUST say it is loading — otherwise a cold load on a real project's URL
 * greets the user by telling them it does not exist.
 */

vi.mock('@/demo/db', () => ({
  db: { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [] }) }) }) },
}));

const profileState = vi.hoisted(() => ({ loading: true, orgId: null as string | null }));

vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({
    profile: profileState.orgId ? { organization_id: profileState.orgId } : null,
    loading: profileState.loading,
    updateProfile: vi.fn(),
    refetch: vi.fn(),
  }),
}));

const { useProjectsDB } = await import('./useProjectsDB');

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe('useProjectsDB — loading honesty', () => {
  it('reports loading while the profile has not produced an org yet', () => {
    profileState.loading = true;
    profileState.orgId = null;

    const { result } = renderHook(() => useProjectsDB(), { wrapper: wrapper() });

    // The empty array is not evidence of anything yet.
    expect(result.current.projects).toEqual([]);
    expect(result.current.loading).toBe(true);
  });

  it('stops reporting loading once the query has actually answered', async () => {
    profileState.loading = false;
    profileState.orgId = 'org-1';

    const { result } = renderHook(() => useProjectsDB(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.projects).toEqual([]);
  });
});
