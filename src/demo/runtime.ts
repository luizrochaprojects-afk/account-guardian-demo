/**
 * Small shared pieces of the demo database, kept apart from store.ts so the
 * triggers can use them without an import cycle.
 */

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // RFC 4122 v4 fallback for environments without crypto.randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export class DbError extends Error {
  constructor(message: string, public code = 'P0001', public details: string | null = null, public hint: string | null = null) {
    super(message);
  }
}

/**
 * Transaction-local settings — the demo's `set_config('app.x', ..., true)`.
 * transition_stage raises a flag that the pipeline_stage guard trigger reads,
 * exactly as the SQL function does.
 */
export const session = new Map<string, string>();

export function withSetting<T>(key: string, value: string, fn: () => T): T {
  const previous = session.get(key);
  session.set(key, value);
  try {
    return fn();
  } finally {
    if (previous === undefined) session.delete(key);
    else session.set(key, previous);
  }
}

