/**
 * The fictional workspace: one organization, three people, and the settings
 * and system properties a new organization starts with.
 *
 * Every name and address in the seed is invented. Email domains use the
 * reserved `.example` TLD so none of them can belong to anyone.
 */
import type { Row } from '../store';
import { sid, type Clock } from './util';

export const ORG_ID = sid('org', 'fieldstone');
export const ORG_NAME = 'Fieldstone Software';

export interface DemoUser {
  id: string;
  email: string;
}

export const USERS = {
  alex: { id: sid('user', 'alex'), name: 'Alex Morgan', email: 'alex.morgan@fieldstone.example', role: 'founder' },
  priya: { id: sid('user', 'priya'), name: 'Priya Shah', email: 'priya.shah@fieldstone.example', role: 'member' },
  diego: { id: sid('user', 'diego'), name: 'Diego Alvarez', email: 'diego.alvarez@fieldstone.example', role: 'member' },
} as const;

/** The visitor. Always signed in, always this person. */
export const DEMO_USER: DemoUser = { id: USERS.alex.id, email: USERS.alex.email };

export function orgTables(clock: Clock): Record<string, Row[]> {
  const created = clock.at(200);
  return {
    organizations: [{ id: ORG_ID, name: ORG_NAME, created_by: USERS.alex.id, created_at: created, updated_at: created }],
    profiles: Object.values(USERS).map((u) => ({
      id: sid('profile', u.id),
      user_id: u.id,
      organization_id: ORG_ID,
      display_name: u.name,
      avatar_url: null,
      role: u.role,
      onboarding_completed: true,
      created_at: created,
      updated_at: created,
    })),
    org_settings: [
      {
        organization_id: ORG_ID,
        currency_code: 'USD',
        currency_symbol: '$',
        hygiene_stale_days: 14,
        weekly_discovery_target: 5,
        incumbent_lead_days: 120,
        customer_expansion_threshold_pct: 25,
        customer_contraction_threshold_pct: 25,
        customer_dormant_weeks: 4,
        customer_gone_dark_days: 21,
        customer_ramp_days: 30,
        created_at: created,
        updated_at: created,
      },
    ],
    custom_properties: systemProperties(created),
    custom_property_values: [],
    custom_views: [
      {
        id: sid('view', 'my-accounts'),
        organization_id: ORG_ID,
        entity_type: 'account',
        name: 'My accounts, biggest first',
        description: 'Everything I own on either side, by potential ARR',
        filters: { myAccounts: true, sortBy: 'arr', sortDir: 'desc' },
        is_favorite: true,
        position: 0,
        created_by: USERS.alex.id,
        created_at: created,
        updated_at: created,
      },
    ],
  };
}

/** What seed_system_account_properties / seed_system_contact_properties create. */
function systemProperties(created: string): Row[] {
  const account = (key: string, label: string, type: string, options: string[], showInCreate: boolean, position: number, isSystem = true) => ({
    id: sid('prop', 'account', key),
    organization_id: ORG_ID,
    entity_type: 'account',
    key,
    label,
    type,
    options,
    option_labels: null,
    default_value: null,
    description: null,
    is_system: isSystem,
    is_required: false,
    show_in_create: showInCreate,
    position,
    created_at: created,
    updated_at: created,
  });
  const contact = (key: string, label: string, type: string, options: string[], position: number) => ({
    ...account(key, label, type, options, false, position),
    id: sid('prop', 'contact', key),
    entity_type: 'contact',
  });
  return [
    account('industry', 'Industry', 'select', [
      'SaaS', 'Fintech', 'Healthcare', 'E-commerce/Retail', 'Education', 'Marketing & Agency', 'Real Estate',
      'Manufacturing', 'Media & Entertainment', 'Travel & Hospitality', 'Insurance', 'Telecom',
      'Professional Services', 'Logistics', 'Nonprofit', 'Other',
    ], true, 0),
    account('segment', 'Segment', 'select', ['SMB', 'Mid-Market', 'Enterprise'], true, 1),
    account('customer_since', 'Customer since', 'date', [], false, 2),
    account('pipeline_stage', 'Stage', 'select', [
      'target', 'working', 'paused', 'disqualified', 'discovery_call', 'qualified_opportunity', 'business_case',
      'sign_off', 'closed_lost', 'closed_won', 'setup', 'pilot_running', 'pilot_review', 'adoption', 'ramping',
      'steady', 'expanding', 'at_risk', 'churned',
    ], true, 3),
    account('code_prefix', 'Code prefix', 'text', [], false, 4),
    account('mrr', 'Potential MRR', 'currency', [], true, 5),
    account('arr', 'Potential ARR', 'currency', [], false, 6),
    account('website', 'Website', 'url', [], false, 9, false),
    contact('name', 'Name', 'text', [], 0),
    contact('role', 'Role', 'text', [], 1),
    contact('email', 'Email', 'email', [], 2),
    contact('phone', 'Phone', 'phone', [], 3),
    contact('department', 'Department', 'text', [], 4),
    contact('contact_type', 'Contact type', 'select', ['decision_maker', 'champion', 'end_user', 'influencer', 'detractor'], 5),
    contact('engagement_level', 'Engagement level', 'select', ['active', 'moderate', 'inactive'], 6),
    contact('last_interaction', 'Last interaction', 'date', [], 7),
  ];
}
