/**
 * The demo workspace, built fresh on every load from `now`, so dates are
 * always recent: a deal that "entered sign-off 9 days ago" does so relative to
 * whenever the page is opened.
 *
 * Bump SEED_VERSION whenever the seed changes shape — a visitor's saved edits
 * belong to the old ids and are discarded rather than merged.
 */
import type { Tables } from '../store';
import { makeClock } from './util';
import { orgTables } from './org';
import { healthTables } from './health';
import { buildAccounts } from './activity';
import { agentTables } from './agent';

export const SEED_VERSION = '2026-09-29.2';

/** Tables the app reads or writes that start empty in the demo. */
const EMPTY_TABLES = [
  'customer_requests',
  'issue_templates',
  'milestones',
  'projects',
  'sla_rules',
  'task_documents',
  'task_relations',
];

export function buildSeed(now: Date): Tables {
  const clock = makeClock(now);
  const { agent_notes, ...agent } = agentTables(clock);
  const accounts = buildAccounts(clock);
  const tables: Tables = {
    ...orgTables(clock),
    ...healthTables(clock),
    ...accounts,
    ...agent,
    notes: [...accounts.notes, ...agent_notes],
  };
  for (const t of EMPTY_TABLES) tables[t] = tables[t] ?? [];
  return tables;
}
