#!/usr/bin/env node
/**
 * Sanitization gate for the public repository.
 *
 * This project is a public, reduced edition of an internal system. Two layers
 * keep anything internal from leaking into it:
 *
 *  1. Generic patterns, versioned here: infrastructure identifiers, tokens,
 *     real email addresses, private hosts.
 *  2. A denylist of real names (customers, prospects, people, internal
 *     vocabulary) that must NEVER be versioned in this repo. It is read from:
 *       - the SANITIZE_DENYLIST env var (newline- or comma-separated), which is
 *         how CI gets it, from a repository secret; or
 *       - the file at SANITIZE_DENYLIST_FILE; or
 *       - `.sanitize-denylist.txt` at the repo root (git-ignored), if present.
 *
 * Denylist hits are reported by term number, never by the term itself: CI logs
 * of a public repository are public, and printing the name would leak it. A
 * line reviewed by hand as a false positive can carry `sanitize-allow`, which
 * exempts it from the denylist (never from the generic patterns).
 *
 * Usage:
 *   node scripts/check-sanitize.mjs            # source tree
 *   node scripts/check-sanitize.mjs --dist     # also scan the production build
 *   node scripts/check-sanitize.mjs --generic-only
 *
 * Exit code 1 on any finding, or when no denylist is available and
 * --generic-only was not passed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-ssr', '.superpowers', '.playwright-mcp', '.vercel', '.claude']);
const SKIP_FILES = new Set(['package-lock.json', 'bun.lockb', '.sanitize-denylist.txt']);
const TEXT_EXT = /\.(ts|tsx|js|mjs|cjs|jsx|json|md|html|css|sql|yml|yaml|txt|svg|toml|example)$/i;

/**
 * [label, regex] — deliberately neutral. Anything that names the internal
 * origin (company, vendors, hosts) belongs in the private denylist, never
 * here: this file is public.
 */
const GENERIC = [
  ['Supabase project host', /[a-z]{20}\.supabase\.co/i],
  ['Supabase project ref flag', /--project-(id|ref)[ =][a-z]{20}\b/i],
  ['Slack token', /xox[abprs]-[0-9A-Za-z-]{8,}/],
  ['Slack user id', /\bU0[0-9A-Z]{9,10}\b/],
  ['JWT', /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\./],
  ['API key', /\b(sk|pk|rk)_(live|test)_[0-9A-Za-z]{10,}|sk-ant-[0-9A-Za-z-]{10,}|AKIA[0-9A-Z]{16}|ghp_[0-9A-Za-z]{20,}/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

// Email addresses must be fictional (.example) or GitHub noreply.
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}/g;
const EMAIL_OK = /@([a-z0-9-]+\.)*example(\.(com|org|net))?$|@users\.noreply\.github\.com$/i;

function loadDenylist() {
  let raw = process.env.SANITIZE_DENYLIST ?? null;
  let source = 'SANITIZE_DENYLIST';
  if (!raw) {
    const candidates = [process.env.SANITIZE_DENYLIST_FILE, path.join(root, '.sanitize-denylist.txt')].filter(Boolean);
    const file = candidates.find((f) => fs.existsSync(f));
    if (file) {
      raw = fs.readFileSync(file, 'utf8');
      source = 'denylist file';
    }
  }
  if (!raw) return { terms: [], source: null };
  const terms = raw
    .split(/[\n,]/)
    .map((t) => t.trim())
    .filter((t) => t && !t.startsWith('#'));
  return { terms, source };
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

function termRegex(raw) {
  // Accent- and case-insensitive, flexible whitespace, whole words at the edges.
  // A leading "=" marks a term that is also a common word: exact case only.
  const exact = raw.startsWith('=');
  const term = exact ? raw.slice(1) : raw;
  const body = escape(fold(term)).replace(/\s+/g, '[\\s_-]*');
  const start = /^\w/.test(term) ? '\\b' : '';
  const end = /\w$/.test(term) ? '\\b' : '';
  return new RegExp(`${start}${body}${end}`, exact ? '' : 'i');
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (TEXT_EXT.test(entry.name) && !SKIP_FILES.has(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const files = walk(root, []);
if (args.has('--dist')) {
  const dist = path.join(root, 'dist');
  if (!fs.existsSync(dist)) {
    console.error('check-sanitize: --dist given but dist/ does not exist; run `npm run build` first.');
    process.exit(1);
  }
  const all = (d, acc) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) all(p, acc);
      else if (/\.(js|html|css|json|txt|svg)$/.test(e.name)) acc.push(p);
    }
    return acc;
  };
  files.push(...all(dist, []));
}

const { terms, source } = loadDenylist();
const denylist = terms.map((t, i) => ({ n: i + 1, re: termRegex(t), commonWord: t.startsWith('=') }));
const findings = [];

for (const file of files) {
  const rel = path.relative(root, file).replaceAll('\\', '/');
  if (rel === 'scripts/check-sanitize.mjs') continue;
  // Minified bundles are full of short identifiers and font names; the
  // exact-case "common word" terms only produce noise there.
  const isBuild = rel.startsWith('dist/');
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const where = `${rel}:${i + 1}`;
    for (const [label, re] of GENERIC) if (re.test(line)) findings.push(`${where}  ${label}`);
    for (const m of line.matchAll(EMAIL)) {
      if (!EMAIL_OK.test(m[0]) && !/\.(png|svg|js|css|ts)$/i.test(m[0])) findings.push(`${where}  non-fictional email address`);
    }
    // A line reviewed by hand and found to be a false positive carries
    // `sanitize-allow`.
    if (line.includes('sanitize-allow')) return;
    const folded = fold(line);
    for (const d of denylist) {
      if (isBuild && d.commonWord) continue;
      if (d.re.test(folded)) findings.push(`${where}  denylist term #${d.n}`);
    }
  });
}

console.log(`check-sanitize: ${files.length} files, ${GENERIC.length} generic patterns, ${denylist.length} denylist terms${source ? ` (${source})` : ''}`);

if (!source && !args.has('--generic-only')) {
  console.error('check-sanitize: no denylist available. Set SANITIZE_DENYLIST or pass --generic-only.');
  process.exit(1);
}

if (findings.length) {
  console.error(`check-sanitize: ${findings.length} finding(s)`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log('check-sanitize: clean');
