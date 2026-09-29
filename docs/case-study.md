# Case study: Account Guardian

**Role:** product, design and engineering, end to end. **Context:** customer operations
for a B2B startup. **Built with:** React, TypeScript, Supabase, AI-assisted development.

## The questions it had to answer

A customer operations team keeps asking three things: what is stuck, what is at risk, and
what did we promise in the last meeting. A workspace earns its place only if it answers
them faster than the team's memory does, and only if everyone reads a stage the same way,
so that a pipeline number is a fact rather than an argument.

## What I designed

I started from the operating model (how the team sells, onboards and retains), turned it
into product rules, and built the software that enforces them:

- **One lifecycle board** from first contact to churn, in four phases.
- **Stage exit criteria** enforced by the database, with the blocker shown while you type.
- **A customer ladder** filed by the system from usage, activity and health, with the
  reason on every card and a human override that expires.
- **Configurable health scoring**, with a snapshot of the rules on every log.
- **A meeting agent** that proposes tasks and notes, and an inbox where a person approves.
- **Hygiene counters** that target zero, one per action someone owes today.

## Three decisions

1. **A funnel until the close, a ladder after it.** A customer moves between Steady,
   Expanding and At Risk for as long as they are a customer, so those columns are ordered
   by attention and filed by the system. Contraction and dormancy became badges, because
   five columns is the limit of a readable board. Trade-off: no manual dragging after the
   close, in exchange for a board that does not lie.
2. **The database enforces, the interface warns.** Stage rules live in one SQL function;
   a pure client module mirrors them to show the blocker on every keystroke. Trade-off:
   two places to change a rule, protected by tests, for a rule that is both enforced and
   visible.
3. **The agent proposes, a person approves.** Nothing extracted from a meeting reaches an
   account without review, every decision is audited, and model spend has a monthly cap.
   Trade-off: less magic, more trust, with grouping and one-click edits to keep review
   cheap.

## What the system guarantees

- A deal can only be in a stage its evidence supports: the database refuses skipped
  stages, unqualified deals and closes without an engaged decision maker and budget owner.
- Every dashboard number traces back to recorded stage moves, never to where accounts
  happen to sit today.
- Every agent-created record has a person's approval and an audit entry behind it.
- The daily routine is a board of counters to clear to zero, each one an action owed.

## This repository

A public, reduced version of an internal system I designed and built. All data is
fictional. It runs entirely in the browser: the screens and their queries are the
production ones, the database client underneath is an in-memory stand-in, and the SQL
functions and triggers the screens depend on are ported to TypeScript. See
[architecture.md](architecture.md).
