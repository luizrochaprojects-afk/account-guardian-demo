# Architecture

Account Guardian runs in production as a React single-page app on top of Supabase. This
repository is a public, reduced edition that runs entirely in the browser. This document
describes both, and exactly where they differ.

## Production

```
Browser (React SPA)
   │  supabase-js: PostgREST queries, RPC calls, edge-function calls
   ▼
Postgres (Supabase)
   • every domain table carries organization_id; row-level security scopes each
     query to the caller's organization through get_user_org_id()
   • business rules the UI must not be able to skip live in SQL functions
     (transition_stage) and triggers (stage history, lifecycle log, next-step mirror)
   • dashboards read SQL functions over account_stage_history, never "where the
     accounts sit today"
   ▼
Edge functions (Deno) + scheduled jobs
   • meeting agent: pull meeting notes → extract suggestions with an LLM, under a
     monthly cost cap → the inbox waits for a person
   • approve / reject: materialise the record and write the audit trail
   • nightly customer classifier, product-usage sync, notification digests
```

Three properties carry the design:

1. **Tenancy is enforced by the database.** A table without `organization_id` and an RLS
   policy of the shape `organization_id = get_user_org_id()` does not ship.
2. **Stage moves go through one function.** A trigger rejects any write to
   `accounts.pipeline_stage` that did not come through `transition_stage()`, which checks
   the exit criteria of the stage being left. The client mirrors the same criteria in a
   pure module (`src/lib/stageReadiness.ts`) to warn while the user types; the database
   is the enforcement.
3. **History is append-only.** Every stage change writes a row to `account_stage_history`
   (and a lifecycle event to the account timeline). Funnel, conversion and time-in-stage
   are computed from that log, so a number on the dashboard can always be traced to the
   moves behind it.

The full schema for the tables this edition keeps, with its policies, functions, views and
triggers, is in [`supabase/schema.sql`](../supabase/schema.sql). It targets Postgres 15+
(Supabase), and its header explains how to load it into a plain local database. CI applies
it twice to a fresh Postgres 16 on every push and runs a smoke test of the stage gate
(`supabase/tests/smoke.sql`).

## This demo

```
Browser (the same React SPA: same pages, hooks and queries)
   │  db.from(...).select(...).eq(...)   db.rpc(...)   db.functions.invoke(...)
   ▼
src/demo/db.ts        in-memory client with the same query API
src/demo/query.ts     PostgREST-compatible builder: filters, ordering, paging,
                      counts, one level of embedded relations, writes + returning
src/demo/store.ts     tables as arrays of rows, column defaults, per-tab persistence
src/demo/triggers.ts  the triggers above, ported
src/demo/views.ts     the views above, computed on read
src/demo/rpc/         the SQL functions above, ported
src/demo/functions.ts the agent's approve / reject edge functions, ported
src/demo/seed/        a fictional workspace, generated relative to "now"
```

Nothing opens a network connection. There is no sign-in: every visitor is the same
fictional founder, and their changes persist in `localStorage` of their own browser only.
"Reset demo" discards them.

### Why the demo runs in the browser

A portfolio link has one requirement: it opens and works, whenever someone clicks it. A
free hosted database pauses after a week without traffic. Keeping one alive means paying
for it, plus anonymous sign-in, per-visitor data isolation, scheduled clean-up and rate
limiting, which is half a security review for a page that only needs to render. In the
browser, isolation is the visitor's tab, reset is a reload, the cost is zero and the attack
surface is zero.

### Why the client, not a rewrite of the data layer

The screens call the database the way production does. Replacing `supabase-js` with a
client that speaks the same query API kept the hooks unchanged apart from the import, so
the demo exercises the real query code rather than a parallel implementation written for
the portfolio. The price is an emulator that only implements the slice of PostgREST the app
uses. It is not a validating server: unknown operators and tables return an error, but it
does not check column names, so a query outside that slice can quietly return empty or
null values where PostgREST would refuse it. The queries the app makes are covered by its
tests.

### What differs from production

| Area | Production | Demo |
|---|---|---|
| Data | Postgres with row-level security | In-memory tables, one visitor, one tab |
| Stage gates | SQL function, mirrored in the client | A TypeScript port of the function, which reads the checklist from the client mirror |
| Customer classifier | Nightly SQL job over the system's own commercial signals | Same ladder in `src/lib/customerSignals.ts`, over generic weekly usage |
| Meeting agent | Transcripts pulled and extracted by an LLM | Suggestions shipped pre-extracted in the seed; no model is called |
| Integrations, notifications, billing, revenue reporting | Present | Removed |

The customer classifier in this edition reads generic product-usage signals (usage over the
last four weeks against the four before, weeks since last use, days since last touch,
health score). The production version reads the internal system's own commercial signals,
which are not part of this repository.
