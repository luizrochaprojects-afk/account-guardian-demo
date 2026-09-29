/**
 * get_user_org_id / get_user_role — the two helpers every RLS policy and every
 * SECURITY DEFINER function in production leans on. The demo has one user, so
 * they resolve that user's profile.
 */
import type { Row, Store } from '../store';
import { DbError } from '../runtime';
import { DEMO_USER } from '../seed/org';

export function callerProfile(store: Store): Row {
  const profile = store.table('profiles').find((p) => p.user_id === DEMO_USER.id);
  if (!profile) throw new DbError('caller has no profile', '42501');
  return profile;
}

/** The org scope check every dashboard RPC opens with. */
export function assertOrg(store: Store, orgId: unknown, fn: string) {
  const caller = callerProfile(store).organization_id;
  if (caller && orgId && caller !== orgId) {
    throw new DbError(`${fn}: org ${String(orgId)} is not the caller's org`, '42501');
  }
}

export const getUserOrgId = (store: Store) => callerProfile(store).organization_id ?? null;
export const getUserRole = (store: Store) => callerProfile(store).role ?? null;
