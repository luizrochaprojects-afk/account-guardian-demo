/**
 * supabase/schema.sql documents the production database; the demo runs on
 * src/types/database.ts and the seed. This test keeps the two from drifting:
 *
 *  - every table in schema.sql has exactly the columns of its Row type in
 *    database.ts (usage_weekly, which has no generated type, is checked
 *    against the rows the seed writes);
 *  - every table the seed fills exists in schema.sql, except the ones listed
 *    in NOT_IN_SCHEMA below, each with the reason it is left out.
 *
 * Both files are read as text: the types are parsed, not imported, because
 * TypeScript types do not exist at runtime.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSeed } from './seed';

const root = process.cwd();
const schemaSql = fs.readFileSync(path.join(root, 'supabase', 'schema.sql'), 'utf8');
const databaseTs = fs.readFileSync(path.join(root, 'src', 'types', 'database.ts'), 'utf8');

/** Seed tables deliberately absent from schema.sql. */
const NOT_IN_SCHEMA: Record<string, string> = {
  // Project planning: the demo keeps the tables so the UI renders, but they
  // start empty and the schema file does not document them.
  projects: 'project planning, empty in the demo',
  milestones: 'project planning, empty in the demo',
  issue_templates: 'task templates, empty in the demo',
  sla_rules: 'SLA configuration, empty in the demo',
  task_documents: 'task attachments, empty in the demo',
  task_relations: 'task links, empty in the demo',
  customer_requests: 'customer request inbox, empty in the demo',
  // Workspace UI configuration (custom fields and saved views): seeded so the
  // screens have content, but not part of the domain model documented here.
  custom_properties: 'custom field definitions (UI configuration)',
  custom_property_values: 'custom field values (UI configuration)',
  custom_views: 'saved list views (UI configuration)',
};

/** Tables whose shape is checked against the seed instead of database.ts. */
const SEED_SHAPED = new Set(['usage_weekly']);

// ── parsing ─────────────────────────────────────────────────────────────────

function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

/** Splits on commas that are not inside parentheses or quotes. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (const ch of body) {
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
    } else if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

const TABLE_CONSTRAINT = /^(constraint|primary\s+key|unique|check|foreign\s+key|exclude)\b/i;

/** table name -> column names, from every CREATE TABLE in schema.sql. */
function schemaTables(sql: string): Map<string, string[]> {
  const text = stripSqlComments(sql);
  const tables = new Map<string, string[]>();
  const head = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = head.exec(text))) {
    // Walk to the parenthesis that closes the column list.
    let depth = 1;
    let i = head.lastIndex;
    while (depth > 0 && i < text.length) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')') depth--;
      i++;
    }
    const body = text.slice(head.lastIndex, i - 1);
    const columns = splitTopLevel(body)
      .map((part) => part.trim())
      .filter((part) => part && !TABLE_CONSTRAINT.test(part))
      .map((part) => part.split(/\s+/)[0].replace(/"/g, ''));
    tables.set(m[1], columns);
  }
  return tables;
}

/** table name -> Row keys, from the `Tables` section of database.ts. */
function typeRows(ts: string): Map<string, string[]> {
  const start = ts.indexOf('    Tables: {');
  const end = ts.indexOf('    Views: {', start);
  const lines = ts.slice(start, end).split(/\r?\n/);
  const rows = new Map<string, string[]>();
  let table: string | null = null;
  let inRow = false;
  for (const line of lines) {
    const t = /^ {6}([a-z_][a-z0-9_]*): \{$/.exec(line);
    if (t) {
      table = t[1];
      continue;
    }
    if (/^ {8}Row: \{$/.test(line)) {
      inRow = true;
      rows.set(table as string, []);
      continue;
    }
    if (inRow && /^ {8}\}$/.test(line)) {
      inRow = false;
      continue;
    }
    const key = inRow ? /^ {10}([a-z_][a-z0-9_]*)\??:/.exec(line) : null;
    if (key && table) rows.get(table)!.push(key[1]);
  }
  return rows;
}

const sorted = (xs: Iterable<string>) => [...new Set(xs)].sort();

// ── the checks ──────────────────────────────────────────────────────────────

const tables = schemaTables(schemaSql);
const rows = typeRows(databaseTs);
const seed = buildSeed(new Date());

describe('supabase/schema.sql parity', () => {
  it('parses the schema and the generated types', () => {
    expect(tables.size).toBeGreaterThanOrEqual(20);
    expect(rows.size).toBeGreaterThanOrEqual(20);
  });

  for (const [table, columns] of tables) {
    if (SEED_SHAPED.has(table)) continue;
    it(`${table}: columns match the Row type in database.ts`, () => {
      expect(rows.has(table), `${table} has no Row type in database.ts`).toBe(true);
      expect(sorted(columns)).toEqual(sorted(rows.get(table)!));
    });
  }

  it('usage_weekly: columns match the rows the seed writes', () => {
    expect(tables.has('usage_weekly')).toBe(true);
    expect(seed.usage_weekly.length).toBeGreaterThan(0);
    const seedKeys = sorted(seed.usage_weekly.flatMap((r) => Object.keys(r)));
    expect(sorted(tables.get('usage_weekly')!)).toEqual(seedKeys);
  });

  it('has a table for every table the seed fills, except the listed exclusions', () => {
    const missing = Object.keys(seed).filter((t) => !tables.has(t) && !(t in NOT_IN_SCHEMA));
    expect(missing).toEqual([]);
  });

  it('keeps the exclusion list honest', () => {
    // An excluded table that appears in the schema, or disappears from the
    // seed, means the list is stale.
    for (const t of Object.keys(NOT_IN_SCHEMA)) {
      expect(tables.has(t), `${t} is excluded but defined in schema.sql`).toBe(false);
      expect(t in seed, `${t} is excluded but no longer in the seed`).toBe(true);
    }
  });

  it('defines the views the demo ports', () => {
    for (const view of ['account_deal_coverage', 'account_customer_signals', 'agent_cost_state']) {
      expect(schemaSql).toMatch(new RegExp(`create\\s+or\\s+replace\\s+view\\s+public\\.${view}\\b`, 'i'));
    }
  });
});
