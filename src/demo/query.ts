/**
 * A small PostgREST-compatible query builder over in-memory tables.
 *
 * The production app talks to Supabase through `supabase-js`. The portfolio
 * edition keeps every hook and component calling the database the same way —
 * `.from('tasks').select('*').eq('account_id', id).order('position')` — and
 * swaps the client underneath for this one. It implements the slice of the
 * builder API the app actually uses (filters, ordering, paging, counts, one
 * level of embedded relations, insert/update/upsert/delete with `.select()`),
 * and resolves to the same `{ data, error, count }` envelope.
 *
 * Unknown operators and tables return an `error`, as PostgREST would. It is not
 * a validating server, though: column names are not checked, so an unknown
 * column reads as null and a filter on one matches nothing.
 */
import type { Row, Store } from './store';

export interface PostgrestError {
  message: string;
  code: string;
  details?: string | null;
  hint?: string | null;
}

export interface QueryResult<T = any> {
  data: T;
  error: PostgrestError | null;
  count: number | null;
  status: number;
  statusText: string;
}

type Predicate = (row: Row) => boolean;
type Operation = 'select' | 'insert' | 'update' | 'upsert' | 'delete';

interface OrderSpec {
  column: string;
  ascending: boolean;
  nullsFirst: boolean;
}

interface Projection {
  /** null = every column. */
  columns: { alias: string; source: string }[] | null;
  embeds: { alias: string; table: string; inner: boolean; projection: Projection }[];
}

// ── Value helpers ────────────────────────────────────────────────────────────

const ISO_LIKE = /^\d{4}-\d{2}-\d{2}/;

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  if (typeof a === 'string' && typeof b === 'string' && ISO_LIKE.test(a) && ISO_LIKE.test(b)) {
    const ta = Date.parse(a);
    const tb = Date.parse(b);
    if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta - tb;
  }
  const na = typeof a === 'string' ? Number(a) : a;
  const nb = typeof b === 'string' ? Number(b) : b;
  if (typeof na === 'number' && typeof nb === 'number' && !Number.isNaN(na) && !Number.isNaN(nb)) {
    return na - nb;
  }
  return String(a).localeCompare(String(b));
}

function equals(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (typeof a === typeof b) return a === b;
  return String(a) === String(b);
}

function likeToRegExp(pattern: string, caseInsensitive: boolean): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${escaped}$`, caseInsensitive ? 'is' : 's');
}

function containsValue(haystack: unknown, needle: unknown): boolean {
  if (Array.isArray(haystack)) {
    const wanted = Array.isArray(needle) ? needle : [needle];
    return wanted.every((w) => haystack.some((h) => equals(h, w) || JSON.stringify(h) === JSON.stringify(w)));
  }
  if (haystack && typeof haystack === 'object' && needle && typeof needle === 'object') {
    return Object.entries(needle as Row).every(([k, v]) =>
      containsValue((haystack as Row)[k], v) || equals((haystack as Row)[k], v),
    );
  }
  return false;
}

/** Parse a PostgREST literal as it appears in `.or()` / `.not()` / `.filter()` strings. */
function parseLiteral(raw: string): unknown {
  if (raw === 'null') return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw.replace(/^"(.*)"$/, '$1');
}

function parseList(raw: string): unknown[] {
  const inner = raw.trim().replace(/^\(/, '').replace(/\)$/, '');
  if (!inner) return [];
  return inner.split(',').map((s) => parseLiteral(s.trim()));
}

/** Build a predicate for one `column.operator.value` triple. */
function operatorPredicate(column: string, operator: string, value: unknown): Predicate {
  switch (operator) {
    case 'eq': return (r) => equals(r[column], value);
    case 'neq': return (r) => r[column] !== null && r[column] !== undefined && !equals(r[column], value);
    case 'gt': return (r) => r[column] != null && compare(r[column], value) > 0;
    case 'gte': return (r) => r[column] != null && compare(r[column], value) >= 0;
    case 'lt': return (r) => r[column] != null && compare(r[column], value) < 0;
    case 'lte': return (r) => r[column] != null && compare(r[column], value) <= 0;
    case 'is':
      if (value === null || value === 'null') return (r) => r[column] === null || r[column] === undefined;
      return (r) => r[column] === value;
    case 'in': {
      const list = Array.isArray(value) ? value : parseList(String(value));
      return (r) => list.some((v) => equals(r[column], v));
    }
    case 'like': return (r) => typeof r[column] === 'string' && likeToRegExp(String(value), false).test(r[column]);
    case 'ilike': return (r) => typeof r[column] === 'string' && likeToRegExp(String(value), true).test(r[column]);
    case 'cs': case 'contains': return (r) => containsValue(r[column], value);
    case 'ov': case 'overlaps': {
      const list = Array.isArray(value) ? value : parseList(String(value));
      return (r) => Array.isArray(r[column]) && list.some((v) => (r[column] as unknown[]).some((h) => equals(h, v)));
    }
    default:
      throw new Error(`demo db: unsupported filter operator "${operator}"`);
  }
}

/**
 * SQL three-valued logic: NOT (col = x) is NULL, not true, when col is NULL, so
 * the row is dropped. Only `not.is` tests nullness itself.
 */
function negated(column: string, operator: string, pred: Predicate): Predicate {
  if (operator === 'is') return (r) => !pred(r);
  return (r) => r[column] !== null && r[column] !== undefined && !pred(r);
}

/** `a.eq.1,b.is.null,and(c.gt.2,d.lt.3)` → predicate (top level is OR). */
function parseOrExpression(expr: string): Predicate {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of expr) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += ch;
  }
  if (current) parts.push(current);

  const preds = parts.map((part): Predicate => {
    const p = part.trim();
    const andMatch = p.match(/^and\((.*)\)$/);
    if (andMatch) {
      const terms = splitTopLevel(andMatch[1]).map((t) =>
        t.startsWith('or(') ? parseOrExpression(t.slice(3, -1)) : parseTerm(t),
      );
      return (r) => terms.every((t) => t(r));
    }
    return parseTerm(p);
  });
  return (r) => preds.some((p) => p(r));
}

function parseTerm(term: string): Predicate {
  const firstDot = term.indexOf('.');
  const column = term.slice(0, firstDot);
  let rest = term.slice(firstDot + 1);
  let negate = false;
  if (rest.startsWith('not.')) {
    negate = true;
    rest = rest.slice(4);
  }
  const secondDot = rest.indexOf('.');
  const operator = rest.slice(0, secondDot);
  const raw = rest.slice(secondDot + 1);
  const value = operator === 'in' ? parseList(raw) : parseLiteral(raw);
  const pred = operatorPredicate(column, operator, value);
  return negate ? negated(column, operator, pred) : pred;
}

// ── Projection ───────────────────────────────────────────────────────────────

function splitTopLevel(input: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of input) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
    } else current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

export function parseProjection(select: string | undefined): Projection {
  const cleaned = (select ?? '*').replace(/\s+/g, ' ').trim() || '*';
  const projection: Projection = { columns: [], embeds: [] };
  for (const item of splitTopLevel(cleaned)) {
    const embed = item.match(/^(?:([\w]+):)?([\w]+)(?:!([\w]+))?\s*\((.*)\)$/s);
    if (embed) {
      const [, alias, table, hint, inner] = embed;
      projection.embeds.push({
        alias: alias ?? table,
        table,
        inner: hint === 'inner',
        projection: parseProjection(inner),
      });
      continue;
    }
    if (item === '*') {
      projection.columns = null;
      continue;
    }
    const [alias, source] = item.includes(':') ? item.split(':') : [item, item];
    // Casts (`col::text`) are accepted and ignored.
    const src = source.split('::')[0].trim();
    if (projection.columns) projection.columns.push({ alias: alias.trim(), source: src });
  }
  if (projection.columns && projection.columns.length === 0 && projection.embeds.length === 0) {
    projection.columns = null;
  }
  return projection;
}

const singular = (t: string) => (t.endsWith('ies') ? `${t.slice(0, -3)}y` : t.replace(/s$/, ''));

function project(store: Store, table: string, row: Row, projection: Projection): Row | null {
  const out: Row = {};
  if (projection.columns === null) Object.assign(out, row);
  else for (const c of projection.columns) out[c.alias] = row[c.source] ?? null;

  for (const e of projection.embeds) {
    const childRows = store.table(e.table);
    // One-to-many: the child carries `<parent>_id`.
    const fkOnChild = `${singular(table)}_id`;
    // Many-to-one: the parent carries `<child>_id`.
    const fkOnParent = `${singular(e.table)}_id`;
    if (childRows.length > 0 && fkOnChild in childRows[0]) {
      const children = childRows
        .filter((c) => equals(c[fkOnChild], row.id))
        .map((c) => project(store, e.table, c, e.projection));
      if (e.inner && children.length === 0) return null;
      out[e.alias] = children;
    } else if (fkOnParent in row) {
      const parent = childRows.find((c) => equals(c.id, row[fkOnParent]));
      if (e.inner && !parent) return null;
      out[e.alias] = parent ? project(store, e.table, parent, e.projection) : null;
    } else {
      // Unknown relation shape with an empty child table: PostgREST would
      // return [] for a has-many, so do the same.
      out[e.alias] = [];
    }
  }
  return out;
}

// ── Builder ──────────────────────────────────────────────────────────────────

export class QueryBuilder<T = any> implements PromiseLike<QueryResult<T>> {
  private op: Operation = 'select';
  private projection: Projection = parseProjection('*');
  private returning = false;
  private predicates: Predicate[] = [];
  private orders: OrderSpec[] = [];
  private limitN: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private singleMode: 'single' | 'maybe' | null = null;
  private countMode: string | null = null;
  private headOnly = false;
  private payload: Row | Row[] | null = null;
  private onConflict: string[] = ['id'];
  private ignoreDuplicates = false;
  private shouldThrow = false;
  private buildError: PostgrestError | null = null;

  constructor(private readonly store: Store, private readonly tableName: string) {}

  // Operations
  select(columns?: string, options?: { count?: string; head?: boolean }): this {
    if (this.op === 'select') {
      this.projection = parseProjection(columns);
      this.countMode = options?.count ?? null;
      this.headOnly = !!options?.head;
    } else {
      this.returning = true;
      this.projection = parseProjection(columns);
    }
    return this;
  }

  insert(values: Row | Row[], options?: { count?: string }): this {
    this.op = 'insert';
    this.payload = values;
    this.countMode = options?.count ?? null;
    return this;
  }

  upsert(values: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }): this {
    this.op = 'upsert';
    this.payload = values;
    if (options?.onConflict) this.onConflict = options.onConflict.split(',').map((s) => s.trim());
    this.ignoreDuplicates = !!options?.ignoreDuplicates;
    return this;
  }

  update(values: Row, options?: { count?: string }): this {
    this.op = 'update';
    this.payload = values;
    this.countMode = options?.count ?? null;
    return this;
  }

  delete(options?: { count?: string }): this {
    this.op = 'delete';
    this.countMode = options?.count ?? null;
    return this;
  }

  // Filters
  private add(column: string, operator: string, value: unknown): this {
    try {
      this.predicates.push(operatorPredicate(column, operator, value));
    } catch (e) {
      this.buildError = { message: (e as Error).message, code: 'PGRST100' };
    }
    return this;
  }

  eq(column: string, value: unknown) { return this.add(column, 'eq', value); }
  neq(column: string, value: unknown) { return this.add(column, 'neq', value); }
  gt(column: string, value: unknown) { return this.add(column, 'gt', value); }
  gte(column: string, value: unknown) { return this.add(column, 'gte', value); }
  lt(column: string, value: unknown) { return this.add(column, 'lt', value); }
  lte(column: string, value: unknown) { return this.add(column, 'lte', value); }
  is(column: string, value: unknown) { return this.add(column, 'is', value); }
  in(column: string, values: readonly unknown[]) { return this.add(column, 'in', [...values]); }
  like(column: string, pattern: string) { return this.add(column, 'like', pattern); }
  ilike(column: string, pattern: string) { return this.add(column, 'ilike', pattern); }
  contains(column: string, value: unknown) { return this.add(column, 'cs', value); }
  overlaps(column: string, value: unknown) { return this.add(column, 'ov', value); }

  match(query: Row): this {
    for (const [k, v] of Object.entries(query)) this.eq(k, v);
    return this;
  }

  not(column: string, operator: string, value: unknown): this {
    try {
      const v = operator === 'in' && typeof value === 'string' ? parseList(value) : value;
      const pred = operatorPredicate(column, operator, v);
      this.predicates.push(negated(column, operator, pred));
    } catch (e) {
      this.buildError = { message: (e as Error).message, code: 'PGRST100' };
    }
    return this;
  }

  filter(column: string, operator: string, value: unknown): this {
    if (operator.startsWith('not.')) return this.not(column, operator.slice(4), value);
    const v = operator === 'in' && typeof value === 'string' ? parseList(value) : value;
    return this.add(column, operator, v);
  }

  or(expression: string): this {
    try {
      this.predicates.push(parseOrExpression(expression));
    } catch (e) {
      this.buildError = { message: (e as Error).message, code: 'PGRST100' };
    }
    return this;
  }

  // Modifiers
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string; referencedTable?: string }): this {
    // Ordering an embedded relation is accepted and ignored: no call site
    // depends on the order of embedded rows.
    if (options?.foreignTable || options?.referencedTable) return this;
    const ascending = options?.ascending ?? true;
    this.orders.push({ column, ascending, nullsFirst: options?.nullsFirst ?? !ascending });
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  single(): this {
    this.singleMode = 'single';
    return this;
  }

  maybeSingle(): this {
    this.singleMode = 'maybe';
    return this;
  }

  // No-op modifiers kept for API compatibility.
  abortSignal(): this { return this; }
  returns<U>(): QueryBuilder<U> { return this as unknown as QueryBuilder<U>; }
  throwOnError(): this {
    this.shouldThrow = true;
    return this;
  }

  // Execution
  private matches(row: Row): boolean {
    return this.predicates.every((p) => p(row));
  }

  private sort(rows: Row[]): Row[] {
    if (this.orders.length === 0) return rows;
    return [...rows].sort((a, b) => {
      for (const o of this.orders) {
        const av = a[o.column];
        const bv = b[o.column];
        const aNull = av === null || av === undefined;
        const bNull = bv === null || bv === undefined;
        if (aNull && bNull) continue;
        if (aNull) return o.nullsFirst ? -1 : 1;
        if (bNull) return o.nullsFirst ? 1 : -1;
        const c = compare(av, bv);
        if (c !== 0) return o.ascending ? c : -c;
      }
      return 0;
    });
  }

  private page(rows: Row[]): Row[] {
    let out = rows;
    if (this.rangeFrom !== null && this.rangeTo !== null) out = out.slice(this.rangeFrom, this.rangeTo + 1);
    if (this.limitN !== null) out = out.slice(0, this.limitN);
    return out;
  }

  private shape(rows: Row[]): Row[] {
    return rows
      .map((r) => project(this.store, this.tableName, r, this.projection))
      .filter((r): r is Row => r !== null);
  }

  private run(): QueryResult<any> {
    if (this.buildError) return fail(this.buildError);
    if (!this.store.hasTable(this.tableName)) {
      return fail({
        message: `relation "public.${this.tableName}" does not exist`,
        code: '42P01',
      });
    }

    let rows: Row[];
    let count: number | null = null;

    try {
      switch (this.op) {
        case 'select': {
          const filtered = this.store.table(this.tableName).filter((r) => this.matches(r));
          if (this.countMode) count = filtered.length;
          if (this.headOnly) return ok(null, count);
          rows = this.shape(this.page(this.sort(filtered)));
          break;
        }
        case 'insert': {
          const values = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
          rows = this.store.insert(this.tableName, values);
          if (this.countMode) count = rows.length;
          if (!this.returning) return ok(null, count, 201);
          rows = this.shape(rows);
          break;
        }
        case 'upsert': {
          const values = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
          rows = this.store.upsert(this.tableName, values, this.onConflict, this.ignoreDuplicates);
          if (!this.returning) return ok(null, null, 201);
          rows = this.shape(rows);
          break;
        }
        case 'update': {
          rows = this.store.update(this.tableName, (r) => this.matches(r), this.payload as Row);
          if (this.countMode) count = rows.length;
          if (!this.returning) return ok(null, count, 204);
          rows = this.shape(this.sort(rows));
          break;
        }
        case 'delete': {
          rows = this.store.remove(this.tableName, (r) => this.matches(r));
          if (this.countMode) count = rows.length;
          if (!this.returning) return ok(null, count, 204);
          rows = this.shape(rows);
          break;
        }
      }
    } catch (e) {
      const err = e as PostgrestError & Error;
      return fail({ message: err.message, code: err.code ?? 'P0001', details: err.details ?? null, hint: err.hint ?? null });
    }

    if (this.singleMode) {
      if (rows.length === 1) return ok(rows[0], count);
      if (rows.length === 0 && this.singleMode === 'maybe') return ok(null, count);
      return fail(
        {
          message: 'JSON object requested, multiple (or no) rows returned',
          code: 'PGRST116',
          details: `The result contains ${rows.length} rows`,
        },
        406,
      );
    }
    return ok(rows, count);
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    // Resolve on a microtask, like a network round trip would, so callers that
    // set loading state before awaiting still observe it.
    return Promise.resolve()
      .then(() => {
        const result = this.run();
        if (this.shouldThrow && result.error) throw result.error;
        return result as QueryResult<T>;
      })
      .then(onfulfilled, onrejected);
  }
}

function ok(data: any, count: number | null, status = 200): QueryResult<any> {
  return { data, error: null, count, status, statusText: 'OK' };
}

function fail(error: PostgrestError, status = 400): QueryResult<any> {
  return { data: null, error: { details: null, hint: null, ...error }, count: null, status, statusText: 'Error' };
}
