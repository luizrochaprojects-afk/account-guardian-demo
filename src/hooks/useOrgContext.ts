import { useProfile } from '@/hooks/useProfile';

const MISSING_ORG_ERROR = new Error(
  'Profile loaded without an organization id — data scope cannot be resolved.',
);

export interface OrgContext {
  orgId: string | null;
  profileLoading: boolean;
  profileError: Error | null;
}

/** Shared org scope + the loading/error plumbing every org-scoped query hook needs. */
export function useOrgContext(): OrgContext {
  const { profile, loading } = useProfile();
  const orgId = profile?.organization_id ?? null;
  const profileError = !loading && !orgId ? MISSING_ORG_ERROR : null;
  return { orgId, profileLoading: loading, profileError };
}

/**
 * The honest loading flag for a query gated on `enabled: !!orgId`.
 *
 * WHY THIS EXISTS: `orgId` comes from an async profile fetch, and a *disabled*
 * React Query v5 query reports `isLoading === false`. Every hook here also
 * defaults its data to `[]`/zeros. So between mount and the profile resolving,
 * a consumer reads `loading === false, data === []` and renders an empty state
 * or a `0` that is simply untrue — then it flips seconds later. That flash is
 * the whole bug this helper closes; use it instead of a bare `query.isLoading`
 * anywhere `enabled` depends on the org.
 *
 * A user whose profile genuinely has no org resolves to `profileError`, and is
 * NOT reported as loading — otherwise that account would spin forever.
 */
export function orgQueryLoading(
  ctx: OrgContext,
  query: { isLoading: boolean },
): boolean {
  return ctx.profileLoading || (!ctx.orgId && !ctx.profileError) || query.isLoading;
}
