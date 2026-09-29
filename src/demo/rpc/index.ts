/**
 * The SQL functions the frontend calls through `db.rpc()`, ported to
 * TypeScript. Each handler receives the store and the same named arguments the
 * Postgres function takes, and returns what PostgREST would: a row set for
 * `RETURNS TABLE`, a single value for scalar returns.
 */
import type { Store } from '../store';
import { getUserOrgId, getUserRole } from './auth';
import { transitionStage } from './transitionStage';
import { dashboardLossReasons, dashboardNorthStarCounts, dashboardSalesFunnel } from './dashboard';
import { accountHygieneFlags } from './hygiene';
import { classifyCustomerStages } from './customers';
import { revertLifecycleOnDelete } from './lifecycle';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const RPC_HANDLERS: Record<string, (store: Store, args: any) => unknown> = {
  get_user_org_id: getUserOrgId,
  get_user_role: getUserRole,
  transition_stage: transitionStage,
  dashboard_north_star_counts: dashboardNorthStarCounts,
  dashboard_loss_reasons: dashboardLossReasons,
  dashboard_sales_funnel: dashboardSalesFunnel,
  account_hygiene_flags: accountHygieneFlags,
  classify_customer_stages: classifyCustomerStages,
  revert_lifecycle_on_delete: revertLifecycleOnDelete,
};
