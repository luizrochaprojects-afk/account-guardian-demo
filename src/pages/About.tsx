import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const REPO_URL = 'https://github.com/luizrochaprojects-afk/account-guardian-demo';

const FEATURES: { title: string; body: string; to: string }[] = [
  {
    title: 'Lifecycle board',
    body: 'One board from first contact to churn, in four phases. The first three are funnels people move; the fourth is a priority ladder the system files.',
    to: '/accounts?view=pipeline',
  },
  {
    title: 'Account workspace',
    body: 'The account as the unit of work: next action, what blocks it, the qualification checklist, contacts, timeline and health on one page.',
    to: '/accounts',
  },
  {
    title: 'Agent inbox',
    body: 'Tasks, notes and activities extracted from meetings, waiting for a person to approve, edit or reject them, with a full audit trail.',
    to: '/accounts?view=inbox',
  },
  {
    title: 'Configurable health scoring',
    body: 'Profiles per stage, metrics with thresholds and weights, and a config snapshot on every log so history keeps its meaning.',
    to: '/health-config',
  },
  {
    title: 'Operations dashboard',
    body: 'Hygiene counters that target zero, a flow funnel where "won" means first real usage, and why deals are lost.',
    to: '/dashboard',
  },
];

const DECISIONS: { title: string; body: string; tradeoff: string }[] = [
  {
    title: 'A funnel until the close, a ladder after it',
    body: 'After the close there is no sequence left: a customer moves between Steady, Expanding and At Risk for as long as they are a customer. So the Customer columns are ordered by attention, and the system files each account from usage, activity and health, with the reason written on the card. Contraction and dormancy became badges instead of columns, because five columns is the limit of a readable board. A person can still pin an account, and the pin expires.',
    tradeoff: 'Gives up manual dragging after the close. Gets a board that does not lie.',
  },
  {
    title: 'The database enforces the rules; the interface warns while you type',
    body: 'Stage exit criteria live in one database function, transition_stage, which refuses skipped stages, unqualified deals and closes without an engaged decision maker. A pure module in the client mirrors the same rules to show the blocker on every keystroke. A rule you only see after a round trip is a rule nobody sees. In this demo there is no database, so the function itself is ported to TypeScript and reads the same checklist the interface uses.',
    tradeoff: 'Two places to change a rule, protected by tests. In exchange, a rule that is both enforced and visible.',
  },
  {
    title: 'The agent proposes, a person approves',
    body: 'Nothing the meeting agent extracts reaches an account without passing through the inbox. Every proposal, edit, approval, rejection and expiry is written to an audit log, and monthly model spend has a cap. Suggestions are grouped by meeting and editable in one click, so reviewing stays cheap.',
    tradeoff: 'Less magic, more trust. The cost of review is paid down with grouping and one-click edits.',
  },
];

const STACK = [
  'React 18 + TypeScript + Vite',
  'TanStack Query, React Router',
  'Tailwind CSS + shadcn/ui (Radix)',
  'Vitest + Testing Library',
  'Production: Supabase (Postgres, row-level security, SQL functions, triggers, edge functions)',
  'Built with AI-assisted development (Claude Code)',
];

function ArchitectureDiagram() {
  const box = 'rounded-md border bg-background px-3 py-2 text-xs leading-snug';
  const arrow = <span aria-hidden className="text-muted-foreground">→</span>;
  return (
    <div className="grid gap-5 text-sm">
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Production</div>
        <div className="flex flex-wrap items-center gap-2">
          <div className={box}>React SPA</div>
          {arrow}
          <div className={box}>Supabase Postgres<br /><span className="text-muted-foreground">row-level security per organization, SQL functions, triggers</span></div>
          {arrow}
          <div className={box}>Edge functions + scheduled jobs<br /><span className="text-muted-foreground">meeting agent, integrations, usage sync</span></div>
        </div>
      </div>
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">This demo</div>
        <div className="flex flex-wrap items-center gap-2">
          <div className={box}>The same React SPA<br /><span className="text-muted-foreground">same hooks, same queries</span></div>
          {arrow}
          <div className={box}>In-memory client<br /><span className="text-muted-foreground">speaks the same query API</span></div>
          {arrow}
          <div className={box}>SQL functions, triggers and views<br /><span className="text-muted-foreground">ported to TypeScript, over seeded data</span></div>
        </div>
      </div>
    </div>
  );
}

export default function About() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader title="About this demo" description="Customer Operations Workspace" />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[860px] flex-col gap-6 px-6 pb-12 pt-6">
          <section className="space-y-3">
            <p className="text-base leading-relaxed">
              Account Guardian is the customer operations workspace I designed and built for a B2B
              startup: one place where a deal is worked from first contact, through onboarding, to
              renewal. I took it from the operating model (how the team sells, onboards and retains)
              to product rules (stage gates, the customer ladder, human approval of agent work) to
              software running in production.
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              A public, reduced version of an internal system I designed and built. All data is
              fictional: every company, person, meeting and number on these screens was invented for
              this demo.
            </p>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Source on GitHub <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </section>

          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base font-semibold">What is in the demo</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 p-4 pt-2 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <Link key={f.title} to={f.to} className="rounded-md border p-3 transition-colors hover:bg-muted/50">
                  <div className="text-sm font-medium">{f.title}</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{f.body}</p>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base font-semibold">Three product decisions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 p-4 pt-2">
              {DECISIONS.map((d, i) => (
                <div key={d.title}>
                  <div className="text-sm font-medium">
                    <span className="mr-2 tabular-nums text-muted-foreground">{i + 1}.</span>
                    {d.title}
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{d.body}</p>
                  <p className="mt-1.5 text-xs leading-relaxed">
                    <span className="font-medium">Trade-off:</span> {d.tradeoff}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base font-semibold">How it is built</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4 pt-2">
              <ArchitectureDiagram />
              <p className="text-sm leading-relaxed text-muted-foreground">
                Why the demo runs in the browser: a free hosted database pauses after a week without
                traffic, which is exactly when someone opens a portfolio link. Keeping one alive means
                paying for it, plus anonymous sign-in, per-visitor data, scheduled clean-up and rate
                limits. None of that serves a page whose only job is to open and work. Here each
                visitor gets their own copy in their own tab, a reset is a reload, and nothing leaves
                the browser.
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                The screens still call the database the way production does. The client underneath
                was swapped for an in-memory one that speaks the same query API, and the SQL functions,
                triggers and views the screens depend on were ported to TypeScript. The production
                schema is documented in the repository.
              </p>
              <ul className="grid gap-1 text-sm sm:grid-cols-2">
                {STACK.map((s) => (
                  <li key={s} className="flex gap-2">
                    <span aria-hidden className="text-muted-foreground">·</span>
                    {s}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
