// Mirror of the server-side AuditAction union. Frontend uses this list to
// populate the action filter dropdown and to validate user input. Keep in
// sync with the server-side type — there's no runtime check binding the two.

export const AGENT_AUDIT_ACTIONS = [
  'ingested',
  'extracted',
  'extraction_failed',
  'extraction_retry_scheduled',
  'extraction_retried',
  'matched',
  'no_match',
  'suggested',
  'approved',
  'edited',
  'rejected',
  'created_record',
  'auth_failed',
  'settings_changed',
] as const;

export type AgentAuditAction = (typeof AGENT_AUDIT_ACTIONS)[number];

export const AGENT_ACTOR_TYPES = ['agent', 'human', 'system'] as const;
export type AgentActorType = (typeof AGENT_ACTOR_TYPES)[number];
