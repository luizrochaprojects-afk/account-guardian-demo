/**
 * Expands the account specs into rows: the account itself, its contacts, the
 * stage history (with the lifecycle events that go with it), interactions,
 * issues, notes, health logs and weekly usage.
 *
 * The seed is written straight into the tables, so nothing here goes through
 * the triggers — which means every value a trigger would have derived
 * (history rows, lifecycle events, code prefixes, next-step mirrors,
 * health_score, last_activity_at) is derived here, the same way.
 */
import type { Row } from '../store';
import { phaseForStage } from '@/lib/pipelineStages';
import { evaluateGrade, computeScoreFromSnapshot, buildMetricsSnapshot } from '@/lib/healthScoring';
import type { HealthMetric } from '@/lib/healthTypes';
import { ACCOUNTS, type AccountSpec } from './accounts';
import { ORG_ID, USERS } from './org';
import { rng, sid, type Clock } from './util';
import { HEALTH_PROFILES } from './health';
import { weekStartUtc } from '../views';

const owner = (k: string | null | undefined) => (k ? USERS[k as keyof typeof USERS].id : null);
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '');
const codePrefix = (name: string) => name.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4);

interface Out {
  accounts: Row[];
  contacts: Row[];
  account_stage_history: Row[];
  events: Row[];
  event_contacts: Row[];
  activities: Row[];
  tasks: Row[];
  notes: Row[];
  health_score_logs: Row[];
  usage_weekly: Row[];
  discovery_notes: Row[];
}

/** Interactions worth seeding, by where the account is. */
const TOUCHES: Record<string, { title: string; type: string; direction: string; sentiment: string }[]> = {
  sdr: [
    { title: 'Intro email', type: 'email', direction: 'outbound', sentiment: 'neutral' },
    { title: 'Follow-up call, left voicemail', type: 'call', direction: 'outbound', sentiment: 'neutral' },
    { title: 'Replied — asked for a short overview', type: 'email', direction: 'inbound', sentiment: 'positive' },
  ],
  sales: [
    { title: 'Discovery call', type: 'meeting', direction: 'outbound', sentiment: 'positive' },
    { title: 'Sent recap and next steps', type: 'email', direction: 'outbound', sentiment: 'neutral' },
    { title: 'Workflow walkthrough with the ops team', type: 'meeting', direction: 'outbound', sentiment: 'very_positive' },
    { title: 'Pricing questions from finance', type: 'email', direction: 'inbound', sentiment: 'neutral' },
  ],
  onboarding: [
    { title: 'Kickoff meeting', type: 'meeting', direction: 'outbound', sentiment: 'very_positive' },
    { title: 'Integration check-in', type: 'call', direction: 'outbound', sentiment: 'positive' },
    { title: 'Admin training session', type: 'meeting', direction: 'outbound', sentiment: 'positive' },
  ],
  customer: [
    { title: 'Monthly check-in', type: 'meeting', direction: 'outbound', sentiment: 'positive' },
    { title: 'Feature request: bulk export', type: 'email', direction: 'inbound', sentiment: 'neutral' },
    { title: 'Quarterly business review', type: 'meeting', direction: 'outbound', sentiment: 'positive' },
    { title: 'Support escalation follow-up', type: 'call', direction: 'outbound', sentiment: 'negative' },
  ],
};

/** Open issues per account: [name, dueInDays (negative = overdue), category?]. */
const ISSUES: Record<string, [string, number | null, string?][]> = {
  redwood: [['Research firm structure and practice areas', 4]],
  juniper: [['Find the budget owner for digital programs', 6]],
  tidewater: [['Send case study on order-status follow-ups', 2, 'next_step'], ['Map the CX team org chart', null]],
  maple: [['Confirm who else sits on the buying committee', null]],
  vantage: [['Reconnect after fiscal-year planning', 40, 'next_step']],
  meridian: [
    ['Send security questionnaire answers', 2, 'next_step'],
    ['Confirm budget path with Marcus (CFO)', 5],
    ['Book a technical review with IT', null],
  ],
  halden: [['Run the business-case workshop', 3, 'next_step'], ['Get SSO roadmap date from product', 9]],
  cobalt: [['Chase usage numbers from their data team', -4, 'next_step'], ['Draft ROI model', 6]],
  larkspur: [['Get the controller to approve the order form', 1, 'next_step'], ['Prepare onboarding plan draft', 8]],
  orbit: [['Escalate SSO provisioning with their IT', -2, 'next_step'], ['Schedule admin training', 5]],
  pinecone: [['Review first-week usage with Luca', 2, 'next_step'], ['Turn on the second storefront', 12]],
  kestrel: [['Ramp review: 30-day usage targets', 6, 'next_step'], ['Invite claims team leads', 10]],
  northstar: [['Prepare the quarterly business review deck', 9, 'next_step']],
  acme: [['Scope the third-region rollout', 4, 'next_step'], ['Loop in procurement for the expansion order', 11]],
  brightline: [['Find the new owner after the champion moved', -3, 'next_step'], ['Offer a re-onboarding session', 2]],
  quarry: [['Usage review with Henrik', 1, 'next_step'], ['Check whether paused workflows can move to one team', -1]],
};

const DONE_ISSUES: Record<string, string[]> = {
  meridian: ['Send discovery recap'],
  halden: ['Collect plant ticket volumes', 'Share reference customer'],
  larkspur: ['Security review sign-off', 'Legal redlines'],
  orbit: ['Countersign contract', 'Create admin accounts'],
  pinecone: ['Connect storefront data', 'Train support team'],
  kestrel: ['Go-live checklist', 'Launch comms to agents'],
  acme: ['Second-region training'],
};

const NOTES: Record<string, [string, string][]> = {
  meridian: [['Discovery call notes', 'Coordinators rebuild the weekly follow-up list by hand from three exports. Hannah wants the list generated automatically, with a clear owner per patient. IT will need to review data residency before a pilot.']],
  halden: [['Plant visit takeaways', 'Three plants, three ticketing tools. Service leads want one queue and a weekly trend by plant. SSO is a hard requirement from IT.']],
  cobalt: [['Business case inputs', 'Waiting on 90 days of case volume from their data team to size the ROI model.']],
  larkspur: [['Sign-off plan', 'COO approved. Controller needs the order form and the security summary before signing.']],
  orbit: [['Onboarding plan', 'Go-live blocked on SSO provisioning. Admin training booked once SSO is live.']],
  kestrel: [['Launch retro', 'Agents adopted the queue in week one. Claims team next.']],
  acme: [['Expansion notes', 'Second region live and busier than the first. Third region wants a demo next month.']],
  brightline: [['Risk review', 'Champion moved to another team in the reorg. No logins for six weeks. Need a new owner before renewal.']],
  quarry: [['Usage drop analysis', 'Two claims teams paused their workflows after the seasonal dip. Core team still active.']],
};

function usageRows(spec: AccountSpec, clock: Clock): Row[] {
  if (!spec.usage) return [];
  const r = rng(`usage:${spec.key}`);
  const thisWeek = weekStartUtc(clock.now);
  const out: Row[] = [];
  const { startWeeksAgo, stopWeeksAgo, base, recentFactor = 1 } = spec.usage;
  for (let w = startWeeksAgo; w >= 1; w--) {
    let units = 0;
    if (!stopWeeksAgo || w > stopWeeksAgo) {
      // New accounts ramp; established ones hold a level, then move by recentFactor.
      const ramp = startWeeksAgo <= 4 ? 0.45 + 0.55 * ((startWeeksAgo - w + 1) / startWeeksAgo) : 1;
      const factor = w <= 4 ? recentFactor : 1;
      units = Math.round(base * ramp * factor * (0.94 + r.next() * 0.12));
    }
    out.push({
      id: sid('usage', spec.key, String(w)),
      organization_id: ORG_ID,
      account_id: sid('account', spec.key),
      week_start: new Date(thisWeek - w * 7 * 86_400_000).toISOString().slice(0, 10),
      units,
      created_at: new Date(thisWeek - (w - 1) * 7 * 86_400_000).toISOString(),
    });
  }
  return out;
}

/** Plausible raw values for a target score, graded by the profile's own thresholds. */
function healthLog(spec: AccountSpec, score: number, daysAgo: number, index: number, clock: Clock): Row | null {
  const stage = spec.path[spec.path.length - 1][0];
  const profile = HEALTH_PROFILES.find((p) => p.stages.includes(stage)) ?? HEALTH_PROFILES.find((p) => p.isDefault)!;
  const metrics: HealthMetric[] = profile.metrics;
  // Pick the per-metric grades whose weighted total lands closest to the
  // target, then a raw value inside each grade's band.
  const grades = bestGrades(metrics, score);
  const scores: Record<string, { value: number | boolean; grade: string }> = {};
  metrics.forEach((m, i) => {
    const value = valueFor(m, grades[i]);
    scores[m.id] = { value, grade: evaluateGrade(value, m) };
  });
  const snapshot = buildMetricsSnapshot(metrics);
  const total = computeScoreFromSnapshot(scores, snapshot);
  return {
    id: sid('health', spec.key, String(index)),
    organization_id: ORG_ID,
    account_id: sid('account', spec.key),
    user_id: USERS.diego.id,
    logged_at: clock.at(daysAgo, 17),
    created_at: clock.at(daysAgo, 17),
    scores,
    total_score: total,
    metrics_snapshot: snapshot,
    profile_id: profile.id,
    profile_name: profile.name,
    observation: index === 0 ? null : score < 50 ? 'Trending down — see risk notes.' : null,
  };
}

type Grade = 'healthy' | 'concerning' | 'poor';
const MULTIPLIER: Record<Grade, number> = { healthy: 1, concerning: 0.5, poor: 0.1 };

/** Exhaustive over 3^n grade combinations — n is at most 3 here. */
function bestGrades(metrics: HealthMetric[], target: number): Grade[] {
  const options: Grade[][] = metrics.map((m) => (m.type === 'boolean' ? ['healthy', 'poor'] : ['healthy', 'concerning', 'poor']));
  let best: Grade[] = options.map((o) => o[0]);
  let bestDiff = Infinity;
  const walk = (i: number, acc: Grade[]) => {
    if (i === metrics.length) {
      const total = acc.reduce((sum, g, k) => sum + Math.round(metrics[k].weight * MULTIPLIER[g]), 0);
      const diff = Math.abs(total - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = [...acc];
      }
      return;
    }
    for (const g of options[i]) walk(i + 1, [...acc, g]);
  };
  walk(0, []);
  return best;
}

/** A raw value that evaluates to `grade` under the metric's own thresholds. */
function valueFor(m: HealthMetric, grade: Grade): number | boolean {
  if (m.type === 'boolean') return grade === 'healthy' ? (m.booleanHealthyValue ?? true) : !(m.booleanHealthyValue ?? true);
  const rule = grade === 'healthy' ? m.healthy : grade === 'poor' ? m.poor : m.concerning;
  const step = m.type === 'percentage' ? 5 : 1;
  switch (rule.operator) {
    case '<': return rule.value - step;
    case '<=': return rule.value;
    case '>': return rule.value + step;
    case '>=': return grade === 'concerning' ? rule.value : rule.value + step;
    default: return rule.value;
  }
}

export function buildAccounts(clock: Clock): Out {
  const out: Out = {
    accounts: [], contacts: [], account_stage_history: [], events: [], event_contacts: [],
    activities: [], tasks: [], notes: [], health_score_logs: [], usage_weekly: [], discovery_notes: [],
  };

  for (const spec of ACCOUNTS) {
    const r = rng(`account:${spec.key}`);
    const accountId = sid('account', spec.key);
    const [stage, stageDays] = spec.path[spec.path.length - 1];
    const phase = phaseForStage(stage);
    const prefix = codePrefix(spec.name);
    let lastActivity = clock.at(spec.createdDaysAgo, 9);
    const touch = (iso: string) => {
      if (iso > lastActivity && Date.parse(iso) <= clock.now) lastActivity = iso;
    };

    // Contacts
    const contactIds: string[] = [];
    spec.contacts.forEach((c, i) => {
      const id = sid('contact', spec.key, String(i));
      contactIds.push(id);
      const first = c.name.split(' ')[0].toLowerCase();
      out.contacts.push({
        id,
        organization_id: ORG_ID,
        account_id: accountId,
        name: c.name,
        role: c.title,
        department: c.department,
        email: `${first}.${c.name.split(' ').slice(-1)[0].toLowerCase()}@${slug(spec.name)}.example`,
        phone: null,
        linkedin_url: null,
        contact_type: c.role_in_deal === 'decision_maker' ? 'decision_maker' : c.role_in_deal === 'champion' ? 'champion' : 'end_user',
        engagement_level: c.deal_engagement === 'engaged' ? 'active' : c.deal_engagement === 'left_company' ? 'inactive' : 'moderate',
        role_in_deal: c.role_in_deal,
        deal_engagement: c.deal_engagement,
        last_interaction: null,
        created_at: clock.at(spec.createdDaysAgo - 1),
        updated_at: clock.at(spec.createdDaysAgo - 1),
      });
    });

    // Stage history + lifecycle events
    spec.path.forEach(([s, days], i) => {
      const entered = clock.at(days, 11, 30);
      const next = spec.path[i + 1];
      const exited = next ? clock.at(next[1], 11, 30) : null;
      const prev = i > 0 ? spec.path[i - 1][0] : null;
      const metadata: Row = {};
      if (s === 'closed_lost' && spec.loss) Object.assign(metadata, { loss_reason_category: spec.loss.category, loss_reason_detail: spec.loss.detail, lost_from_stage: prev });
      if (s === 'disqualified' && spec.disqualify) Object.assign(metadata, { disqualify_reason: spec.disqualify.reason, loss_reason_detail: spec.disqualify.detail, lost_from_stage: prev });
      if (s === 'churned' && spec.churn) Object.assign(metadata, { churn_reason: spec.churn.reason, loss_reason_detail: spec.churn.detail, lost_from_stage: prev });
      if (s === 'at_risk' && spec.riskReason) metadata.customer_risk_reason = spec.riskReason;
      const source = ['ramping', 'steady', 'expanding', 'at_risk'].includes(s) ? 'classifier' : i === 0 ? 'system' : 'transition_stage';
      out.account_stage_history.push({
        id: sid('history', spec.key, String(i)),
        organization_id: ORG_ID,
        account_id: accountId,
        from_stage: prev,
        to_stage: s,
        from_phase: prev ? phaseForStage(prev) : null,
        to_phase: phaseForStage(s),
        entered_at: entered,
        exited_at: exited,
        duration_hours: exited ? Math.round((Date.parse(exited) - Date.parse(entered)) / 3_600_000) : null,
        changed_by: source === 'transition_stage' ? owner(spec.revenueOwner) : null,
        source,
        arr_at_entry: spec.mrr * 12,
        metadata,
        source_event_id: null,
        created_at: entered,
      });
      out.events.push({
        id: sid('lifecycle', spec.key, String(i)),
        organization_id: ORG_ID,
        account_id: accountId,
        user_id: owner(spec.revenueOwner) ?? USERS.alex.id,
        type: 'system',
        channel: 'system',
        direction: 'internal',
        title: `Stage: ${s}`,
        summary: prev ? `Moved from ${prev} to ${s}` : `Stage set to ${s}`,
        group_label: 'lifecycle',
        date: clock.day(days),
        time: null,
        sentiment: null,
        scheduled_at: null,
        completed_at: null,
        created_at: entered,
      });
      touch(entered);
    });

    // Interactions: a few per phase the account has been through, oldest first.
    const phasesSeen = [...new Set(spec.path.map(([s]) => phaseForStage(s)))];
    let n = 0;
    for (const p of phasesSeen) {
      const window = spec.path.filter(([s]) => phaseForStage(s) === p);
      const from = window[0][1];
      const to = spec.path[spec.path.indexOf(window[window.length - 1]) + 1]?.[1] ?? 0;
      const touches = TOUCHES[p];
      const count = p === phase ? touches.length : 2;
      for (let i = 0; i < count; i++) {
        const t = touches[i % touches.length];
        const days = Math.max(to + 1, Math.round(from - ((from - to) * (i + 1)) / (count + 1)));
        // Accounts that went quiet stay quiet: no touches in the last month.
        if (spec.key === 'brightline' && days < 30 && p === 'customer') continue;
        const id = sid('event', spec.key, String(n++));
        const contactId = contactIds[i % Math.max(1, contactIds.length)];
        out.events.push({
          id,
          organization_id: ORG_ID,
          account_id: accountId,
          user_id: (p === 'onboarding' || p === 'customer' ? owner(spec.deliveryOwner) : owner(spec.revenueOwner)) ?? USERS.alex.id,
          type: t.type,
          channel: t.type,
          direction: t.direction,
          sentiment: t.sentiment,
          title: t.title,
          summary: null,
          group_label: null,
          date: clock.day(days),
          time: `${String(9 + r.int(0, 7)).padStart(2, '0')}:${r.pick(['00', '30'])}`,
          scheduled_at: t.type === 'meeting' ? clock.at(days, 14) : null,
          completed_at: t.type === 'meeting' ? clock.at(days, 15) : null,
          created_at: clock.at(days, 15),
        });
        if (contactId) {
          out.event_contacts.push({ id: sid('ec', id), organization_id: ORG_ID, event_id: id, contact_id: contactId, created_at: clock.at(days, 15) });
        }
        touch(clock.at(days, 15));
      }
    }

    // Upcoming meetings keep deals covered (see the no_future_meeting counter).
    const upcoming: Record<string, [string, number]> = {
      meridian: ['Technical review with IT', 6],
      halden: ['Business-case workshop', 3],
      larkspur: ['Signing call', 2],
      pinecone: ['First-week usage review', 2],
      kestrel: ['30-day ramp review', 6],
      northstar: ['Quarterly business review', 9],
      acme: ['Third-region demo', 13],
      quarry: ['Usage review', 1],
    };
    if (upcoming[spec.key]) {
      const [title, inDays] = upcoming[spec.key];
      const id = sid('event', spec.key, 'upcoming');
      out.events.push({
        id, organization_id: ORG_ID, account_id: accountId,
        user_id: owner(spec.deliveryOwner ?? spec.revenueOwner) ?? USERS.alex.id,
        type: 'meeting', channel: 'meeting', direction: 'outbound', sentiment: null, title, summary: null, group_label: null,
        date: clock.day(-inDays), time: '14:00', scheduled_at: clock.at(-inDays, 14), completed_at: null,
        created_at: clock.at(Math.min(3, stageDays)),
      });
      if (contactIds[0]) out.event_contacts.push({ id: sid('ec', id), organization_id: ORG_ID, event_id: id, contact_id: contactIds[0], created_at: clock.at(1) });
    }

    // SDR outreach lives in activities too — it is what the pipeline card's
    // "+ Log" writes, and what stamps first_worked_at.
    // Nothing is logged against an account nobody has started working.
    if ((phase === 'sdr' || phase === 'sales') && stage !== 'target') {
      const outreach = Math.min(4, spec.path.length + 1);
      for (let i = 0; i < outreach; i++) {
        const days = Math.max(1, Math.round(spec.createdDaysAgo - ((spec.createdDaysAgo - stageDays / 2) * (i + 1)) / (outreach + 1)));
        out.activities.push({
          id: sid('activity', spec.key, String(i)),
          organization_id: ORG_ID,
          account_id: accountId,
          contact_id: contactIds[0] ?? null,
          owner_id: owner(spec.revenueOwner),
          activity_type: i === outreach - 1 && phase === 'sales' ? 'meeting_held' : i === 0 ? 'outreach' : 'follow_up',
          channel: r.pick(['email', 'linkedin', 'call'] as const),
          direction: 'outbound',
          outcome: i === outreach - 1 ? 'positive' : r.pick(['neutral', 'no_response'] as const),
          meaningful_engagement: i === outreach - 1,
          source: 'manual',
          external_id: null,
          notes: null,
          occurred_at: clock.at(days, 16),
          created_at: clock.at(days, 16),
          updated_at: clock.at(days, 16),
        });
        touch(clock.at(days, 16));
      }
    }

    // Issues
    let code = 0;
    let nextStepTask: Row | null = null;
    for (const [name, due, category] of ISSUES[spec.key] ?? []) {
      code++;
      const created = clock.at(Math.min(Math.min(stageDays, 6) + 1, spec.createdDaysAgo), 12);
      const task: Row = {
        id: sid('task', spec.key, String(code)),
        organization_id: ORG_ID,
        account_id: accountId,
        milestone_id: null,
        parent_id: null,
        name,
        objective: null,
        status: due !== null && due < 0 ? 'in_progress' : 'todo',
        is_done: false,
        priority: category === 'next_step' ? 'high' : r.pick(['medium', 'low']),
        due_date: due === null ? null : clock.day(-due),
        due_label: null,
        assign_to: owner(phase === 'sdr' || phase === 'sales' ? spec.revenueOwner : spec.deliveryOwner ?? spec.revenueOwner),
        assigned_role: phase === 'sdr' || phase === 'sales' ? 'AE' : 'CSM',
        category: category ?? null,
        code: `${prefix}-${code}`,
        code_number: code,
        position: code,
        tags: [],
        success_criteria: [],
        blocked_by: null,
        blocking: null,
        created_by_agent: false,
        source_suggestion_id: null,
        template_id: null,
        sla_deadline: null,
        sla_duration_hours: null,
        sla_started_at: null,
        created_at: created,
        updated_at: created,
      };
      out.tasks.push(task);
      if (category === 'next_step') nextStepTask = task;
      touch(created);
    }
    for (const name of DONE_ISSUES[spec.key] ?? []) {
      code++;
      const doneDays = Math.max(1, stageDays + r.int(1, 6));
      out.tasks.push({
        id: sid('task', spec.key, String(code)),
        organization_id: ORG_ID, account_id: accountId, milestone_id: null, parent_id: null,
        name, objective: null, status: 'done', is_done: true, priority: 'medium',
        due_date: clock.day(doneDays), due_label: null,
        assign_to: owner(spec.deliveryOwner ?? spec.revenueOwner), assigned_role: 'CSM', category: null,
        code: `${prefix}-${code}`, code_number: code, position: code, tags: [], success_criteria: [],
        blocked_by: null, blocking: null, created_by_agent: false, source_suggestion_id: null, template_id: null,
        sla_deadline: null, sla_duration_hours: null, sla_started_at: null,
        created_at: clock.at(doneDays + 4), updated_at: clock.at(doneDays, 18),
      });
    }

    // Notes
    (NOTES[spec.key] ?? []).forEach(([title, body], i) => {
      const at = clock.at(Math.max(1, stageDays - 1), 18);
      out.notes.push({
        id: sid('note', spec.key, String(i)),
        organization_id: ORG_ID,
        account_id: accountId,
        user_id: owner(spec.revenueOwner) ?? USERS.alex.id,
        author: null,
        title,
        body,
        content: { markdown: body },
        category: 'general',
        tags: [],
        participants: [],
        contact_id: null,
        project_id: null,
        task_id: null,
        created_by_agent: false,
        source_suggestion_id: null,
        created_at: at,
        updated_at: at,
      });
      touch(at);
    });

    // Health logs, every 14 days ending 2 days ago.
    const logs = (spec.health ?? [])
      .map((score, i, all) => healthLog(spec, score, 2 + (all.length - 1 - i) * 14, i, clock))
      .filter((l): l is Row => l !== null);
    out.health_score_logs.push(...logs);
    const healthScore = logs.length ? logs[logs.length - 1].total_score : 0;
    const prevScore = logs.length > 1 ? logs[logs.length - 2].total_score : healthScore;

    // Usage
    out.usage_weekly.push(...usageRows(spec, clock));

    // Discovery notes for every account that had a discovery call.
    const discovery = spec.path.find(([s]) => s === 'discovery_call');
    if (discovery) {
      out.discovery_notes.push({
        id: sid('discovery', spec.key),
        organization_id: ORG_ID,
        account_id: accountId,
        contact_id: contactIds[0] ?? null,
        created_by: owner(spec.revenueOwner),
        generated_by: spec.key === 'meridian' ? 'agent_extracted' : 'human',
        agent_confidence: spec.key === 'meridian' ? 0.82 : null,
        agent_model: null,
        primary_pain: spec.successPromise
          ? `Today: ${spec.successPromise.charAt(0).toLowerCase()}${spec.successPromise.slice(1)} is not happening.`
          : 'Follow-ups and handoffs live in spreadsheets and inboxes.',
        fit_thesis: 'Team-level workflow with a clear owner and weekly cadence.',
        risk_thesis: spec.riskNotes ?? null,
        context: null, budget_signal: null, current_competitor: spec.incumbent?.vendor ?? null, current_stack: null,
        current_workflow: null, decision_maker: null, next_steps: null, objections: [], prospect_language: [],
        what_caught_attention: null, what_confused: null, founder_present: false,
        meeting_event_id: null, meeting_ingest_id: null, source_transcript_excerpt: [],
        created_at: clock.at(discovery[1] - 1, 17),
        updated_at: clock.at(discovery[1] - 1, 17),
      });
    }

    // The account row
    const checklist: Row = {};
    for (const [k, v] of Object.entries(spec.qualification ?? {})) {
      checklist[k] = { answer: v?.answer ?? null, evidence: v?.evidence, source: v?.agent ? 'agent' : 'human', confidence: v?.agent };
    }
    const founderApproved = spec.path.some(([s]) => s === 'qualified_opportunity');
    const qualifiedAt = spec.path.find(([s]) => s === 'qualified_opportunity');
    if (founderApproved) checklist.founder_approved = { answer: true, approver_id: USERS.alex.id, approved_at: clock.at(qualifiedAt![1], 11) };
    const stageAt = (s: string) => spec.path.find(([x]) => x === s)?.[1];
    const lostDays = stageAt('closed_lost') ?? stageAt('disqualified') ?? stageAt('churned');

    out.accounts.push({
      id: accountId,
      organization_id: ORG_ID,
      name: spec.name,
      code_prefix: prefix,
      industry: spec.industry,
      segment: spec.segment,
      region: spec.region,
      plan: spec.plan ?? null,
      source: spec.source,
      tags: spec.tags ?? [],
      channels: [],
      mrr: spec.mrr,
      arr: spec.mrr * 12,
      trend: healthScore > prevScore ? 'up' : healthScore < prevScore ? 'down' : 'flat',
      health_score: healthScore,
      pipeline_stage: stage,
      pipeline_phase: phase,
      founder_confidence: spec.confidence ?? null,
      revenue_owner_id: owner(spec.revenueOwner),
      delivery_owner_id: owner(spec.deliveryOwner ?? null),
      qualification_checklist: checklist,
      founder_approved_at: founderApproved ? clock.at(qualifiedAt![1], 11) : null,
      founder_approved_by: founderApproved ? USERS.alex.id : null,
      forecast_close_date: spec.forecastCloseInDays ? clock.day(-spec.forecastCloseInDays) : null,
      expected_close_date: stageAt('closed_won') !== undefined ? clock.day(stageAt('closed_won')!) : null,
      close_date_slips: spec.key === 'cobalt' ? 2 : 0,
      customer_since: spec.customerSinceDaysAgo !== undefined ? clock.day(spec.customerSinceDaysAgo) : null,
      golive_at: spec.goliveDaysAgo !== undefined ? clock.at(spec.goliveDaysAgo, 11) : null,
      first_usage_at: spec.firstUsageDaysAgo !== undefined ? clock.at(spec.firstUsageDaysAgo, 9) : null,
      first_impact_at: null,
      first_worked_at: clock.at(spec.createdDaysAgo - 1, 16),
      first_engaged_at: stageAt('discovery_call') !== undefined ? clock.at(stageAt('discovery_call')! + 3, 16) : null,
      first_meeting_at: stageAt('discovery_call') !== undefined ? clock.at(stageAt('discovery_call')!, 14) : null,
      last_activity_at: lastActivity,
      last_contact: lastActivity.slice(0, 10),
      next_step: nextStepTask?.name ?? null,
      next_step_due: nextStepTask?.due_date ?? null,
      next_step_task_id: nextStepTask?.id ?? null,
      success_promise: spec.successPromise ?? null,
      risk_notes: spec.riskNotes ?? null,
      main_issue: spec.mainIssue ?? null,
      loss_reason_category: spec.loss?.category ?? null,
      disqualify_reason: spec.disqualify?.reason ?? null,
      churn_reason: spec.churn?.reason ?? null,
      loss_reason_detail: spec.loss?.detail ?? spec.disqualify?.detail ?? spec.churn?.detail ?? null,
      lost_from_stage: lostDays !== undefined ? spec.path[spec.path.length - 2][0] : null,
      revisit_at: spec.disqualify ? clock.day(-120) : null,
      customer_risk_reason: spec.riskReason ?? null,
      customer_stage_pinned_at: null,
      customer_stage_pinned_by: null,
      customer_stage_pin_reason: null,
      reactivated_at: null,
      incumbent_vendor: spec.incumbent?.vendor ?? null,
      incumbent_last_renewal: spec.incumbent && spec.incumbent.renewalMonthsAgo > 0 ? clock.day(spec.incumbent.renewalMonthsAgo * 30) : null,
      incumbent_cycle: spec.incumbent?.cycle ?? 'unknown',
      incumbent_evidence: spec.incumbent?.evidence ?? null,
      incumbent_source: spec.incumbent ? (spec.incumbent.source ?? 'human') : null,
      incumbent_captured_at: spec.incumbent ? clock.at(stageAt('discovery_call') ?? stageDays, 17) : null,
      incumbent_window_snoozed_until: null,
      incumbent_window_disabled_reason: null,
      created_at: clock.at(spec.createdDaysAgo, 9),
      updated_at: lastActivity,
    });
  }

  return out;
}
