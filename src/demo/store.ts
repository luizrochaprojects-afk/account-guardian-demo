/**
 * The demo's database: every table is an array of rows held in memory.
 *
 * Boot order: load the seed (src/demo/seed), then overlay whatever this browser
 * saved earlier, if it was saved against the same seed version. Writes are
 * persisted to localStorage after a short debounce, so a visitor's edits
 * survive a reload in their own browser and never reach anyone else.
 *
 * Mutations go through `insert` / `upsert` / `update` / `remove`, which apply
 * column defaults and the few triggers the app's behaviour depends on
 * (src/demo/triggers.ts) — the same things Postgres does on the server.
 */
import { buildSeed, SEED_VERSION } from './seed';
import { TABLE_DEFAULTS } from './schema';
import { runTriggers } from './triggers';
import { VIEWS } from './views';
import { uuid, DbError } from './runtime';

export { uuid, DbError, session, withSetting } from './runtime';

export type Row = Record<string, any>;
export type Tables = Record<string, Row[]>;

const STORAGE_KEY = 'account-guardian-demo:db';
const PERSIST_DEBOUNCE_MS = 250;
const MAX_SAVED_AGE_MS = 24 * 60 * 60 * 1000;

const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

type Listener = () => void;

export class Store {
  private tables: Tables;
  private listeners = new Set<Listener>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(initial: Tables, private readonly persist: boolean) {
    this.tables = initial;
  }

  hasTable(name: string): boolean {
    return name in this.tables || name in VIEWS;
  }

  /**
   * Live rows of a table, or the computed rows of a view (src/demo/views.ts).
   * Callers must not mutate them; use the write methods.
   */
  table(name: string): Row[] {
    const view = VIEWS[name];
    if (view) return view(this);
    return this.tables[name] ?? [];
  }

  /** A deep copy of every table — for tests and debugging. */
  snapshot(): Tables {
    return clone(this.tables);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private ensure(name: string): Row[] {
    if (!this.tables[name]) this.tables[name] = [];
    return this.tables[name];
  }

  private withDefaults(table: string, row: Row): Row {
    const now = new Date().toISOString();
    const defaults = TABLE_DEFAULTS[table] ?? {};
    const out: Row = {};
    for (const [k, v] of Object.entries(defaults)) {
      if (k === 'updated_at') continue;
      out[k] = typeof v === 'function' ? (v as () => unknown)() : clone(v);
    }
    Object.assign(out, clone(row));
    if (out.id === undefined || out.id === null) out.id = uuid();
    if (out.created_at === undefined || out.created_at === null) out.created_at = now;
    if ('updated_at' in defaults && (out.updated_at === undefined || out.updated_at === null)) out.updated_at = now;
    return out;
  }

  insert(table: string, values: Row[]): Row[] {
    const rows = this.ensure(table);
    const inserted: Row[] = [];
    for (const v of values) {
      let row = this.withDefaults(table, v);
      row = runTriggers(this, table, 'insert', row, null);
      if (rows.some((r) => r.id === row.id)) {
        throw new DbError(`duplicate key value violates unique constraint "${table}_pkey"`, '23505');
      }
      rows.push(row);
      inserted.push(row);
      runTriggers(this, table, 'after_insert', row, null);
    }
    this.changed();
    return clone(inserted);
  }

  upsert(table: string, values: Row[], conflictColumns: string[], ignoreDuplicates: boolean): Row[] {
    const rows = this.ensure(table);
    const out: Row[] = [];
    for (const v of values) {
      // Like a unique index: NULL never conflicts with anything, not even NULL.
      const existing = rows.find((r) =>
        conflictColumns.every((c) => v[c] != null && r[c] != null && String(r[c]) === String(v[c])),
      );
      if (existing) {
        if (ignoreDuplicates) continue;
        const before = clone(existing);
        let next: Row = { ...existing, ...clone(v) };
        if ('updated_at' in existing) next.updated_at = new Date().toISOString();
        next = runTriggers(this, table, 'update', next, before);
        Object.assign(existing, next);
        out.push(existing);
        runTriggers(this, table, 'after_update', existing, before);
      } else {
        let row = this.withDefaults(table, v);
        row = runTriggers(this, table, 'insert', row, null);
        rows.push(row);
        out.push(row);
        runTriggers(this, table, 'after_insert', row, null);
      }
    }
    this.changed();
    return clone(out);
  }

  update(table: string, where: (row: Row) => boolean, patch: Row): Row[] {
    const rows = this.ensure(table);
    const updated: Row[] = [];
    for (const row of rows) {
      if (!where(row)) continue;
      const before = clone(row);
      let next: Row = { ...row, ...clone(patch) };
      if ('updated_at' in row && !('updated_at' in patch)) next.updated_at = new Date().toISOString();
      next = runTriggers(this, table, 'update', next, before);
      Object.assign(row, next);
      updated.push(row);
      runTriggers(this, table, 'after_update', row, before);
    }
    if (updated.length) this.changed();
    return clone(updated);
  }

  remove(table: string, where: (row: Row) => boolean): Row[] {
    const rows = this.ensure(table);
    const removed = rows.filter(where);
    if (removed.length === 0) return [];
    this.tables[table] = rows.filter((r) => !where(r));
    for (const r of removed) runTriggers(this, table, 'after_delete', r, r);
    this.changed();
    return clone(removed);
  }

  private changed() {
    for (const l of this.listeners) l();
    if (!this.persist) return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => saveTables(this.tables), PERSIST_DEBOUNCE_MS);
  }
}

// ── Persistence ─────────────────────────────────────────────────────────────

interface Saved {
  version: string;
  savedAt: string;
  tables: Tables;
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function saveTables(tables: Tables) {
  const storage = safeStorage();
  if (!storage) return;
  try {
    const payload: Saved = { version: SEED_VERSION, savedAt: new Date().toISOString(), tables };
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota or privacy mode: the demo keeps working, it just won't survive a reload.
  }
}

function loadSaved(): Tables | null {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Saved;
    // A new seed means new ids and new relative dates: old edits would point at
    // rows that no longer exist, so they are discarded rather than merged. Edits
    // older than a day go too: the saved rows carry absolute dates, and a
    // visitor coming back next week would find every deal overdue and stuck.
    const age = Date.now() - Date.parse(saved.savedAt);
    if (saved.version !== SEED_VERSION || !(age < MAX_SAVED_AGE_MS)) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    return saved.tables;
  } catch {
    return null;
  }
}

/** Whether this browser holds edits on top of the seed. */
export function hasLocalChanges(): boolean {
  const storage = safeStorage();
  try {
    return !!storage?.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

// ── The singleton ───────────────────────────────────────────────────────────

const isTest = typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test';

export function createStore(options: { persist?: boolean; now?: Date } = {}): Store {
  const seed = buildSeed(options.now ?? new Date());
  const persist = options.persist ?? false;
  const saved = persist ? loadSaved() : null;
  return new Store(saved ?? seed, persist);
}

export const store: Store = createStore({ persist: !isTest });

/** Drop this browser's edits and reload on a fresh seed. */
export function resetDemo() {
  const storage = safeStorage();
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined') window.location.reload();
}
