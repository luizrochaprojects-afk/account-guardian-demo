// Shared option lists + labels for prospecting activities.
// Values are the Postgres enums, derived straight from the generated types so
// they can never drift from the DB.

import type { Database } from '@/types/database';

export type ActivityChannel = Database['public']['Enums']['activity_channel'];
export type ActivityType = Database['public']['Enums']['activity_type'];
export type ActivityDirection = Database['public']['Enums']['activity_direction'];
export type ActivityOutcome = Database['public']['Enums']['activity_outcome'];
export type ActivitySource = Database['public']['Enums']['activity_source'];

export const CHANNEL_OPTIONS: { value: ActivityChannel; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'email', label: 'Email' },
  { value: 'call', label: 'Call' },
  { value: 'sms', label: 'SMS' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'other', label: 'Other' },
];

// Sentinel for "no outcome recorded" — the DB column is nullable and Radix
// Select can't use an empty-string value.
export const OUTCOME_NONE = '__none__';

export const OUTCOME_OPTIONS: { value: string; label: string }[] = [
  { value: OUTCOME_NONE, label: '—' },
  { value: 'positive', label: 'Positive' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'negative', label: 'Negative' },
  { value: 'no_response', label: 'No response' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'unsubscribed', label: 'Unsubscribed' },
];

/** Resolve the outcome select value to a DB enum value or null. */
export function outcomeValue(v: string): ActivityOutcome | null {
  return v === OUTCOME_NONE ? null : (v as ActivityOutcome);
}

// A "kind" is the fast, human-friendly choice in the quick-add. Each maps to an
// activity_type plus a sensible default direction and outcome, so the user picks
// one thing and the rest is inferred (keeps logging under ~10s).
export interface ActivityKind {
  value: ActivityType;
  label: string;
  direction: ActivityDirection;
  defaultOutcome: string; // OUTCOME_NONE or an ActivityOutcome value
}

export const KIND_OPTIONS: ActivityKind[] = [
  { value: 'outreach',       label: 'Outreach',       direction: 'outbound', defaultOutcome: 'no_response' },
  { value: 'follow_up',      label: 'Follow-up',      direction: 'outbound', defaultOutcome: 'no_response' },
  { value: 'reply',          label: 'Reply received', direction: 'inbound',  defaultOutcome: 'positive' },
  { value: 'meeting_booked', label: 'Meeting booked', direction: 'outbound', defaultOutcome: OUTCOME_NONE },
  { value: 'meeting_held',   label: 'Meeting held',   direction: 'inbound',  defaultOutcome: OUTCOME_NONE },
  { value: 'demo',           label: 'Demo',           direction: 'inbound',  defaultOutcome: OUTCOME_NONE },
  { value: 'no_show',        label: 'No-show',        direction: 'outbound', defaultOutcome: 'negative' },
  { value: 'other',          label: 'Other',          direction: 'outbound', defaultOutcome: OUTCOME_NONE },
];

const TYPE_LABEL: Record<string, string> = {
  outreach: 'Outreach', reply: 'Reply', meeting_booked: 'Meeting booked',
  meeting_held: 'Meeting held', no_show: 'No-show', demo: 'Demo',
  follow_up: 'Follow-up', note: 'Note', task: 'Task', other: 'Other',
};
const CHANNEL_LABEL = Object.fromEntries(CHANNEL_OPTIONS.map(o => [o.value, o.label]));
const OUTCOME_LABEL = Object.fromEntries(OUTCOME_OPTIONS.map(o => [o.value, o.label]));

export const channelLabel = (v: string) => CHANNEL_LABEL[v] ?? v;
export const outcomeLabel = (v: string) => OUTCOME_LABEL[v] ?? v;
export const kindLabel = (v: string) => TYPE_LABEL[v] ?? v;

export const kindByType = (t: ActivityType): ActivityKind =>
  KIND_OPTIONS.find(k => k.value === t) ?? KIND_OPTIONS[0];
