import { describe, it, expect } from 'vitest';
import {
  KIND_OPTIONS, OUTCOME_OPTIONS, OUTCOME_NONE, kindByType, outcomeValue,
  outcomeLabel, channelLabel,
} from './activityOptions';

describe('activityOptions', () => {
  it('every kind maps to a valid direction and a known default outcome', () => {
    const outcomes = new Set(OUTCOME_OPTIONS.map((o) => o.value));
    for (const k of KIND_OPTIONS) {
      expect(['outbound', 'inbound', 'internal']).toContain(k.direction);
      expect(outcomes.has(k.defaultOutcome)).toBe(true);
    }
  });

  it('kindByType returns the matching kind, or falls back to the first', () => {
    expect(kindByType('meeting_held').value).toBe('meeting_held');
    expect(kindByType('meeting_held').direction).toBe('inbound');
    expect(kindByType('nonsense' as never).value).toBe(KIND_OPTIONS[0].value);
  });

  it('outcomeValue resolves the none-sentinel to null and passes through enum values', () => {
    expect(outcomeValue(OUTCOME_NONE)).toBeNull();
    expect(outcomeValue('positive')).toBe('positive');
    expect(outcomeValue('no_response')).toBe('no_response');
  });

  it('labels fall back to the raw value when unknown', () => {
    expect(outcomeLabel('positive')).toBe('Positive');
    expect(channelLabel('whatsapp')).toBe('WhatsApp');
    expect(outcomeLabel('made_up')).toBe('made_up');
  });
});
