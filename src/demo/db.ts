/**
 * The demo's stand-in for the Supabase client.
 *
 * Same surface the app uses — `db.from()`, `db.rpc()`, `db.functions.invoke()`,
 * `db.auth.*`, `db.channel()` — backed by the in-memory store. Nothing here
 * opens a network connection.
 *
 *   from()             → QueryBuilder over the store (src/demo/query.ts)
 *   rpc()              → the SQL functions, ported to TypeScript (src/demo/rpc)
 *   functions.invoke() → the edge functions the UI calls (src/demo/functions.ts)
 *   auth               → one fictional, always-signed-in user
 *   channel()          → realtime subscriptions become no-ops
 */
import { QueryBuilder, type QueryResult } from './query';
import { store, type Store } from './store';
import { session } from './runtime';
import { RPC_HANDLERS } from './rpc';
import { FUNCTION_HANDLERS } from './functions';
import { DEMO_USER } from './seed/org';

export interface DemoClient {
  from: (table: string) => QueryBuilder<any>;
  rpc: (name: string, args?: Record<string, unknown>) => Promise<QueryResult<any>>;
  functions: {
    invoke: (name: string, options?: { body?: unknown }) => Promise<{ data: any; error: { message: string } | null }>;
  };
  auth: {
    getUser: () => Promise<{ data: { user: typeof DEMO_USER }; error: null }>;
    getSession: () => Promise<{ data: { session: { user: typeof DEMO_USER; access_token: string } }; error: null }>;
    onAuthStateChange: (cb: (event: string, session: unknown) => void) => { data: { subscription: { unsubscribe: () => void } } };
    signOut: () => Promise<{ error: null }>;
  };
  channel: (name: string) => DemoChannel;
  removeChannel: (channel: DemoChannel) => Promise<'ok'>;
}

interface DemoChannel {
  on: (...args: unknown[]) => DemoChannel;
  subscribe: (cb?: (status: string) => void) => DemoChannel;
  unsubscribe: () => Promise<'ok'>;
}

function makeChannel(): DemoChannel {
  const channel: DemoChannel = {
    on: () => channel,
    subscribe: () => channel,
    unsubscribe: async () => 'ok',
  };
  return channel;
}

export function createDemoClient(target: Store): DemoClient {
  return {
    from: (table) => new QueryBuilder(target, table),

    rpc: async (name, args = {}) => {
      await Promise.resolve();
      const handler = RPC_HANDLERS[name];
      if (!handler) {
        return {
          data: null,
          error: { message: `function public.${name} does not exist`, code: '42883', details: null, hint: null },
          count: null,
          status: 404,
          statusText: 'Not Found',
        };
      }
      try {
        const data = handler(target, args);
        return { data, error: null, count: null, status: 200, statusText: 'OK' };
      } catch (e) {
        const err = e as Error & { code?: string; details?: string; hint?: string };
        return {
          data: null,
          error: { message: err.message, code: err.code ?? 'P0001', details: err.details ?? null, hint: err.hint ?? null },
          count: null,
          status: 400,
          statusText: 'Bad Request',
        };
      }
    },

    functions: {
      invoke: async (name, options) => {
        await Promise.resolve();
        const handler = FUNCTION_HANDLERS[name];
        if (!handler) return { data: null, error: { message: `Edge function "${name}" is not part of the demo` } };
        try {
          return { data: handler(target, (options?.body ?? {}) as Record<string, any>), error: null };
        } catch (e) {
          return { data: null, error: { message: (e as Error).message } };
        }
      },
    },

    auth: {
      getUser: async () => ({ data: { user: DEMO_USER }, error: null }),
      getSession: async () => ({ data: { session: { user: DEMO_USER, access_token: 'demo' } }, error: null }),
      onAuthStateChange: (cb) => {
        queueMicrotask(() => cb('INITIAL_SESSION', { user: DEMO_USER }));
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signOut: async () => ({ error: null }),
    },

    channel: () => makeChannel(),
    removeChannel: async () => 'ok',
  };
}

// One visitor, one user: every write is attributed to them, the way auth.uid()
// attributes writes in production (history changed_by, lifecycle event user_id).
session.set('app.user_id', DEMO_USER.id);

export const db = createDemoClient(store);
