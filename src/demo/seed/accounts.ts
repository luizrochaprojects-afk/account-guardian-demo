/**
 * The twenty fictional accounts, written as specs: who they are, the path each
 * one took through the pipeline (stage + how many days ago it was entered),
 * and the few facts that make its card say something.
 *
 * Customer-phase accounts are specified so that the classifier agrees with the
 * seeded stage: pressing "Reclassify" on a fresh demo moves nothing. Their
 * weekly usage lives in `usage` and is expanded by ./activity.ts.
 */
import type { PipelineStage } from '@/lib/pipelineStages';
import type { QualificationItemKey } from '@/lib/stageReadiness';

export type OwnerKey = 'alex' | 'priya' | 'diego';

export interface ContactSpec {
  name: string;
  title: string;
  department: string;
  role_in_deal: string;
  deal_engagement: string;
}

export interface UsageSpec {
  /** Weeks ago the first week of usage falls in (1 = last complete week). */
  startWeeksAgo: number;
  /** Weeks ago usage stopped; omit if still using. */
  stopWeeksAgo?: number;
  /** Units per week at the start of the window. */
  base: number;
  /** Multiplier applied across the last 4 complete weeks vs. the 4 before. */
  recentFactor?: number;
}

export interface AccountSpec {
  key: string;
  name: string;
  industry: string;
  segment: 'SMB' | 'Mid-Market' | 'Enterprise';
  region: string;
  plan?: string;
  source: string;
  tags?: string[];
  mrr: number;
  confidence?: 'low' | 'medium' | 'high';
  revenueOwner: OwnerKey | null;
  deliveryOwner?: OwnerKey | null;
  /** Stage path, oldest first: [stage, daysAgo]. The last entry is current. */
  path: [PipelineStage, number][];
  createdDaysAgo: number;
  qualification?: Partial<Record<QualificationItemKey, { answer: boolean | null; evidence?: string; agent?: number }>>;
  contacts: ContactSpec[];
  forecastCloseInDays?: number;
  customerSinceDaysAgo?: number;
  firstUsageDaysAgo?: number;
  goliveDaysAgo?: number;
  usage?: UsageSpec;
  /** Health scores for the last logs, oldest first, one every 14 days. */
  health?: number[];
  riskReason?: string;
  loss?: { category: string; detail: string };
  disqualify?: { reason: string; detail: string };
  churn?: { reason: string; detail: string };
  incumbent?: { vendor: string; renewalMonthsAgo: number; cycle: 'annual' | 'biennial' | 'monthly' | 'unknown'; evidence: string; source?: 'human' | 'agent' };
  successPromise?: string;
  riskNotes?: string;
  mainIssue?: string;
}

const yes = (evidence?: string, agent?: number) => ({ answer: true, evidence, agent });
const no = (evidence?: string) => ({ answer: false, evidence });

export const ACCOUNTS: AccountSpec[] = [
  // ── SDR ────────────────────────────────────────────────────────────────
  {
    key: 'redwood', name: 'Redwood Legal', industry: 'Professional Services', segment: 'SMB', region: 'North America',
    source: 'outbound', mrr: 0, revenueOwner: 'priya', createdDaysAgo: 3, path: [['target', 3]],
    contacts: [{ name: 'Nora Castillo', title: 'Managing Partner', department: 'Leadership', role_in_deal: 'decision_maker', deal_engagement: 'identified' }],
  },
  {
    key: 'juniper', name: 'Juniper Learning', industry: 'Education', segment: 'Mid-Market', region: 'Europe',
    source: 'inbound', mrr: 0, revenueOwner: 'priya', createdDaysAgo: 12, path: [['target', 12]], tags: ['webinar'],
    contacts: [{ name: 'Tobias Lindqvist', title: 'Head of Digital', department: 'Product', role_in_deal: 'champion', deal_engagement: 'identified' }],
  },
  {
    key: 'tidewater', name: 'Tidewater Foods', industry: 'E-commerce/Retail', segment: 'Mid-Market', region: 'North America',
    source: 'outbound', mrr: 0, revenueOwner: 'priya', createdDaysAgo: 30, path: [['target', 30], ['working', 10]],
    contacts: [
      { name: 'Grace Okafor', title: 'VP Customer Experience', department: 'Operations', role_in_deal: 'champion', deal_engagement: 'approached' },
      { name: 'Sam Whitaker', title: 'Operations Analyst', department: 'Operations', role_in_deal: 'user', deal_engagement: 'identified' },
    ],
  },
  {
    key: 'maple', name: 'Maple Street Clinics', industry: 'Healthcare', segment: 'SMB', region: 'North America',
    source: 'referral', mrr: 0, revenueOwner: 'alex', createdDaysAgo: 20, path: [['target', 20], ['working', 5]],
    contacts: [{ name: 'Dana Reyes', title: 'Practice Director', department: 'Operations', role_in_deal: 'decision_maker', deal_engagement: 'approached' }],
  },
  {
    key: 'vantage', name: 'Vantage Mobility', industry: 'Logistics', segment: 'Enterprise', region: 'Europe',
    source: 'event', mrr: 0, revenueOwner: 'priya', createdDaysAgo: 75, path: [['target', 75], ['working', 50], ['paused', 22]],
    contacts: [{ name: 'Elise Moreau', title: 'Director of Fleet Ops', department: 'Operations', role_in_deal: 'champion', deal_engagement: 'approached' }],
    riskNotes: 'Asked to reconnect after their fiscal-year planning closes.',
  },
  {
    key: 'granite', name: 'Granite Dental Group', industry: 'Healthcare', segment: 'SMB', region: 'North America',
    source: 'outbound', mrr: 0, revenueOwner: 'priya', createdDaysAgo: 40, path: [['target', 40], ['working', 30], ['disqualified', 15]],
    disqualify: { reason: 'no_budget', detail: 'Budget frozen until next year; revisit in Q2.' },
    contacts: [{ name: 'Owen Price', title: 'Operations Manager', department: 'Operations', role_in_deal: 'user', deal_engagement: 'not_interested' }],
  },

  // ── Sales ──────────────────────────────────────────────────────────────
  {
    key: 'meridian', name: 'Meridian Health', industry: 'Healthcare', segment: 'Mid-Market', region: 'North America',
    plan: 'Growth', source: 'inbound', tags: ['priority'], mrr: 4500, confidence: 'medium', revenueOwner: 'alex', deliveryOwner: 'diego',
    createdDaysAgo: 45, path: [['target', 45], ['working', 25], ['discovery_call', 12]], forecastCloseInDays: 40,
    qualification: {
      is_decision_maker: yes('Hannah reports to the COO and owns the patient-experience budget line.'),
      pain_exists_genuinely: yes('Care coordinators rebuild the follow-up list by hand every Monday.', 0.86),
      timeline: yes('Wants the new workflow live before open enrollment.'),
      champion: yes('Hannah offered to run the internal pilot.'),
    },
    contacts: [
      { name: 'Hannah Brooks', title: 'VP Operations', department: 'Operations', role_in_deal: 'champion', deal_engagement: 'engaged' },
      { name: 'Marcus Webb', title: 'CFO', department: 'Finance', role_in_deal: 'budget_owner', deal_engagement: 'identified' },
      { name: 'Leila Haddad', title: 'IT Director', department: 'IT', role_in_deal: 'technical_evaluator', deal_engagement: 'approached' },
    ],
    incumbent: { vendor: 'Spreadsheets + shared inbox', renewalMonthsAgo: 0, cycle: 'unknown', evidence: 'No tool today — the process lives in a shared workbook.' },
    successPromise: 'Coordinators spend Monday mornings on patients, not on building the list.',
  },
  {
    key: 'halden', name: 'Halden Robotics', industry: 'Manufacturing', segment: 'Enterprise', region: 'Europe',
    source: 'referral', mrr: 0, confidence: 'high', revenueOwner: 'alex', deliveryOwner: 'diego',
    createdDaysAgo: 70, path: [['target', 70], ['working', 55], ['discovery_call', 30], ['qualified_opportunity', 18]], forecastCloseInDays: 55,
    qualification: {
      is_decision_maker: yes('Klaus signs off on plant-software spend.'),
      pain_exists_genuinely: yes('Service tickets from three plants land in three different tools.'),
      budget_path: yes('Reallocating the legacy ticketing contract at renewal.'),
      timeline: yes('Legacy contract renews in the spring.'),
      champion: yes(),
      technical_fit: no('SSO provider is on the roadmap, not live yet.'),
    },
    contacts: [
      { name: 'Klaus Brandt', title: 'Head of Plant Operations', department: 'Operations', role_in_deal: 'decision_maker', deal_engagement: 'engaged' },
      { name: 'Ingrid Solberg', title: 'Service Excellence Lead', department: 'Operations', role_in_deal: 'champion', deal_engagement: 'engaged' },
    ],
    incumbent: { vendor: 'Legacy on-prem ticketing', renewalMonthsAgo: 8, cycle: 'annual', evidence: 'Mentioned the renewal date on the discovery call.', source: 'agent' },
  },
  {
    key: 'cobalt', name: 'Cobalt Energy', industry: 'Other', segment: 'Enterprise', region: 'North America',
    source: 'outbound', mrr: 9000, confidence: 'medium', revenueOwner: 'priya', deliveryOwner: 'diego',
    createdDaysAgo: 90, path: [['target', 90], ['working', 70], ['discovery_call', 50], ['qualified_opportunity', 35], ['business_case', 20]], forecastCloseInDays: 25,
    qualification: {
      is_decision_maker: yes(), pain_exists_genuinely: yes(), budget_path: yes(), timeline: no('No hard deadline.'), champion: yes(), technical_fit: yes(),
    },
    contacts: [
      { name: 'Ruth Adeyemi', title: 'Director of Customer Programs', department: 'Customer Success', role_in_deal: 'champion', deal_engagement: 'engaged' },
      { name: 'Paul Harrington', title: 'VP Finance', department: 'Finance', role_in_deal: 'budget_owner', deal_engagement: 'approached' },
    ],
    riskNotes: 'Business case is waiting on usage numbers from their data team.',
  },
  {
    key: 'larkspur', name: 'Larkspur Financial', industry: 'Fintech', segment: 'Mid-Market', region: 'North America',
    plan: 'Growth', source: 'inbound', mrr: 6500, confidence: 'high', revenueOwner: 'alex', deliveryOwner: 'diego',
    createdDaysAgo: 80, path: [['target', 80], ['working', 66], ['discovery_call', 48], ['qualified_opportunity', 36], ['business_case', 24], ['sign_off', 9]], forecastCloseInDays: 10,
    qualification: {
      is_decision_maker: yes(), pain_exists_genuinely: yes(), budget_path: yes(), timeline: yes('Board review next month.'), champion: yes(), technical_fit: yes(),
    },
    contacts: [
      { name: 'Irene Novak', title: 'COO', department: 'Leadership', role_in_deal: 'decision_maker', deal_engagement: 'engaged' },
      { name: 'Jonah Pierce', title: 'Head of Client Success', department: 'Customer Success', role_in_deal: 'champion', deal_engagement: 'engaged' },
      { name: 'Wei Zhang', title: 'Controller', department: 'Finance', role_in_deal: 'budget_owner', deal_engagement: 'approached' },
    ],
    successPromise: 'Every client review starts from one account view instead of four tabs.',
  },
  {
    key: 'harbor', name: 'Harbor Analytics', industry: 'SaaS', segment: 'SMB', region: 'Europe',
    source: 'inbound', mrr: 1800, revenueOwner: 'priya', createdDaysAgo: 60,
    path: [['target', 60], ['working', 50], ['discovery_call', 40], ['qualified_opportunity', 30], ['closed_lost', 21]],
    loss: { category: 'current_stack_sufficient', detail: 'Decided their CRM add-on covers enough for this year.' },
    contacts: [{ name: 'Mateo Rossi', title: 'Head of Customer Success', department: 'Customer Success', role_in_deal: 'champion', deal_engagement: 'engaged' }],
  },
  {
    key: 'ember', name: 'Ember Studio', industry: 'Media & Entertainment', segment: 'SMB', region: 'Latin America',
    source: 'referral', mrr: 2200, revenueOwner: 'alex', createdDaysAgo: 55,
    path: [['target', 55], ['working', 44], ['discovery_call', 34], ['qualified_opportunity', 26], ['business_case', 16], ['closed_lost', 6]],
    loss: { category: 'no_budget', detail: 'Lost their anchor client; all new spend paused.' },
    contacts: [{ name: 'Lucía Ferreyra', title: 'Managing Director', department: 'Leadership', role_in_deal: 'decision_maker', deal_engagement: 'engaged' }],
  },

  // ── Onboarding ─────────────────────────────────────────────────────────
  {
    key: 'orbit', name: 'Orbit Logistics', industry: 'Logistics', segment: 'Mid-Market', region: 'North America',
    plan: 'Growth', source: 'outbound', mrr: 5200, revenueOwner: 'priya', deliveryOwner: 'diego',
    createdDaysAgo: 110, customerSinceDaysAgo: 15,
    path: [['target', 110], ['working', 95], ['discovery_call', 80], ['qualified_opportunity', 62], ['business_case', 48], ['sign_off', 33], ['closed_won', 15], ['setup', 13]],
    qualification: { is_decision_maker: yes(), pain_exists_genuinely: yes(), budget_path: yes(), timeline: yes(), champion: yes(), technical_fit: yes() },
    contacts: [
      { name: 'Carmen Ortiz', title: 'VP Operations', department: 'Operations', role_in_deal: 'decision_maker', deal_engagement: 'engaged' },
      { name: 'Ben Carver', title: 'Finance Manager', department: 'Finance', role_in_deal: 'budget_owner', deal_engagement: 'engaged' },
      { name: 'Aisha Rahman', title: 'Systems Administrator', department: 'IT', role_in_deal: 'technical_evaluator', deal_engagement: 'engaged' },
    ],
    health: [66, 64],
    mainIssue: 'Waiting on their IT team to provision SSO before go-live.',
  },
  {
    key: 'pinecone', name: 'Pinecone Retail', industry: 'E-commerce/Retail', segment: 'Mid-Market', region: 'Europe',
    plan: 'Starter', source: 'inbound', mrr: 3800, revenueOwner: 'alex', deliveryOwner: 'diego',
    createdDaysAgo: 120, customerSinceDaysAgo: 40, goliveDaysAgo: 8, firstUsageDaysAgo: 8,
    path: [['target', 120], ['working', 105], ['discovery_call', 92], ['qualified_opportunity', 78], ['business_case', 64], ['sign_off', 52], ['closed_won', 40], ['setup', 30], ['pilot_running', 8]],
    qualification: { is_decision_maker: yes(), pain_exists_genuinely: yes(), budget_path: yes(), timeline: yes(), champion: yes(), technical_fit: yes() },
    contacts: [
      { name: 'Freya Johansson', title: 'Head of E-commerce', department: 'Digital', role_in_deal: 'decision_maker', deal_engagement: 'engaged' },
      { name: 'Luca Bianchi', title: 'CRM Specialist', department: 'Marketing', role_in_deal: 'champion', deal_engagement: 'engaged' },
    ],
    usage: { startWeeksAgo: 1, base: 160 },
    health: [70, 74],
  },

  // ── Customer ───────────────────────────────────────────────────────────
  {
    key: 'kestrel', name: 'Kestrel Insurance', industry: 'Insurance', segment: 'Enterprise', region: 'North America',
    plan: 'Enterprise', source: 'referral', mrr: 15000, revenueOwner: 'alex', deliveryOwner: 'diego',
    createdDaysAgo: 150, customerSinceDaysAgo: 70, goliveDaysAgo: 24, firstUsageDaysAgo: 22,
    path: [['target', 150], ['working', 138], ['discovery_call', 124], ['qualified_opportunity', 110], ['business_case', 96], ['sign_off', 84], ['closed_won', 70], ['setup', 60], ['pilot_running', 24], ['pilot_review', 16], ['adoption', 11], ['ramping', 10]],
    contacts: [
      { name: 'Victoria Hale', title: 'Chief Customer Officer', department: 'Customer Success', role_in_deal: 'decision_maker', deal_engagement: 'engaged' },
      { name: 'Ravi Menon', title: 'Director of Service Operations', department: 'Operations', role_in_deal: 'champion', deal_engagement: 'engaged' },
      { name: 'Olga Petrov', title: 'Procurement Lead', department: 'Finance', role_in_deal: 'procurement', deal_engagement: 'engaged' },
    ],
    usage: { startWeeksAgo: 3, base: 420, recentFactor: 1 },
    health: [68, 72, 76],
  },
  {
    key: 'northstar', name: 'Northstar Labs', industry: 'SaaS', segment: 'Mid-Market', region: 'North America',
    plan: 'Growth', source: 'inbound', mrr: 7000, revenueOwner: 'priya', deliveryOwner: 'diego',
    createdDaysAgo: 260, customerSinceDaysAgo: 200, goliveDaysAgo: 186, firstUsageDaysAgo: 185,
    path: [['target', 260], ['working', 250], ['discovery_call', 240], ['qualified_opportunity', 230], ['business_case', 220], ['sign_off', 210], ['closed_won', 200], ['setup', 195], ['pilot_running', 186], ['pilot_review', 160], ['adoption', 130], ['ramping', 128], ['steady', 95]],
    contacts: [
      { name: 'Ethan Cole', title: 'VP Customer Success', department: 'Customer Success', role_in_deal: 'decision_maker', deal_engagement: 'engaged' },
      { name: 'Mia Tanaka', title: 'CS Operations Manager', department: 'Customer Success', role_in_deal: 'champion', deal_engagement: 'engaged' },
    ],
    usage: { startWeeksAgo: 12, base: 1200, recentFactor: 1.04 },
    health: [80, 78, 82, 81, 83, 82],
  },
  {
    key: 'acme', name: 'Acme Commerce', industry: 'E-commerce/Retail', segment: 'Enterprise', region: 'Europe',
    plan: 'Enterprise', source: 'outbound', tags: ['expansion'], mrr: 11000, revenueOwner: 'alex', deliveryOwner: 'diego',
    createdDaysAgo: 300, customerSinceDaysAgo: 240, goliveDaysAgo: 228, firstUsageDaysAgo: 226,
    path: [['target', 300], ['working', 290], ['discovery_call', 280], ['qualified_opportunity', 270], ['business_case', 262], ['sign_off', 250], ['closed_won', 240], ['setup', 235], ['pilot_running', 228], ['pilot_review', 200], ['adoption', 170], ['ramping', 168], ['steady', 140], ['expanding', 12]],
    contacts: [
      { name: 'Sophie Laurent', title: 'Director of Customer Care', department: 'Customer Success', role_in_deal: 'decision_maker', deal_engagement: 'engaged' },
      { name: 'Jakub Nowak', title: 'Support Tooling Lead', department: 'IT', role_in_deal: 'champion', deal_engagement: 'engaged' },
    ],
    usage: { startWeeksAgo: 12, base: 1000, recentFactor: 1.4 },
    health: [84, 85, 86, 88, 90, 91],
    successPromise: 'Rolled out to the second region; third region evaluating.',
  },
  {
    key: 'brightline', name: 'Brightline Media', industry: 'Media & Entertainment', segment: 'SMB', region: 'North America',
    plan: 'Starter', source: 'inbound', mrr: 2400, revenueOwner: 'priya', deliveryOwner: 'diego',
    createdDaysAgo: 220, customerSinceDaysAgo: 170, goliveDaysAgo: 160, firstUsageDaysAgo: 158,
    path: [['target', 220], ['working', 212], ['discovery_call', 204], ['qualified_opportunity', 196], ['business_case', 188], ['sign_off', 180], ['closed_won', 170], ['setup', 166], ['pilot_running', 160], ['pilot_review', 130], ['adoption', 100], ['ramping', 98], ['steady', 70], ['at_risk', 16]],
    riskReason: 'no_usage',
    contacts: [{ name: 'Chloe Barnes', title: 'Operations Lead', department: 'Operations', role_in_deal: 'champion', deal_engagement: 'engaged' }],
    usage: { startWeeksAgo: 12, stopWeeksAgo: 6, base: 300 },
    health: [72, 70, 66, 60, 55, 48],
    mainIssue: 'Their champion moved teams; nobody has logged in for six weeks.',
  },
  {
    key: 'quarry', name: 'Quarry Freight', industry: 'Logistics', segment: 'Mid-Market', region: 'Europe',
    plan: 'Growth', source: 'event', mrr: 6800, revenueOwner: 'priya', deliveryOwner: 'diego',
    createdDaysAgo: 240, customerSinceDaysAgo: 180, goliveDaysAgo: 172, firstUsageDaysAgo: 170,
    path: [['target', 240], ['working', 230], ['discovery_call', 221], ['qualified_opportunity', 212], ['business_case', 203], ['sign_off', 192], ['closed_won', 180], ['setup', 176], ['pilot_running', 172], ['pilot_review', 140], ['adoption', 110], ['ramping', 108], ['steady', 80], ['at_risk', 9]],
    riskReason: 'contracting',
    contacts: [
      { name: 'Henrik Dahl', title: 'Customer Service Director', department: 'Customer Success', role_in_deal: 'decision_maker', deal_engagement: 'engaged' },
      { name: 'Ana Silva', title: 'Team Lead, Claims', department: 'Operations', role_in_deal: 'user', deal_engagement: 'engaged' },
    ],
    usage: { startWeeksAgo: 12, base: 900, recentFactor: 0.62 },
    health: [74, 70, 68, 63, 58, 56],
    mainIssue: 'Seasonal volume dropped and two teams paused their workflows.',
  },
  {
    key: 'solstice', name: 'Solstice Travel', industry: 'Travel & Hospitality', segment: 'SMB', region: 'Latin America',
    plan: 'Starter', source: 'inbound', mrr: 1900, revenueOwner: 'priya', deliveryOwner: 'diego',
    createdDaysAgo: 280, customerSinceDaysAgo: 230, goliveDaysAgo: 222, firstUsageDaysAgo: 220,
    path: [['target', 280], ['working', 272], ['discovery_call', 264], ['qualified_opportunity', 256], ['business_case', 248], ['sign_off', 238], ['closed_won', 230], ['setup', 226], ['pilot_running', 222], ['pilot_review', 190], ['adoption', 160], ['ramping', 158], ['steady', 120], ['at_risk', 60], ['churned', 30]],
    churn: { reason: 'low_usage', detail: 'Never got past one team; did not renew.' },
    contacts: [{ name: 'Tomás Mendes', title: 'Operations Manager', department: 'Operations', role_in_deal: 'decision_maker', deal_engagement: 'left_company' }],
    usage: { startWeeksAgo: 12, stopWeeksAgo: 7, base: 140 },
    health: [55, 46, 38, 31],
  },
];
