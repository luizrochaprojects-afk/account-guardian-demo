import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transitionStage, TransitionStageError, coercePipelineStage } from './transitionStage';
import { db } from '@/demo/db';

vi.mock('@/demo/db', () => ({
  db: { rpc: vi.fn() },
}));

/** The mocked RPC, typed once so the tests don't each reach for `as any`. */
const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>;

describe('coercePipelineStage', () => {
  it('passes through valid enum values', () => {
    expect(coercePipelineStage('target')).toBe('target');
    expect(coercePipelineStage('closed_won')).toBe('closed_won');
  });

  it('normalizes case and whitespace for valid values', () => {
    expect(coercePipelineStage('Working')).toBe('working');
    expect(coercePipelineStage('  DISCOVERY_CALL ')).toBe('discovery_call');
  });

  it('returns null for unmappable / non-string values', () => {
    // Legacy labels like 'Onboarding' and removed stages like 'sal' are no
    // longer valid enum values and must coerce to null, not fail the insert.
    expect(coercePipelineStage('Onboarding')).toBeNull();
    expect(coercePipelineStage('sal')).toBeNull();
    expect(coercePipelineStage('')).toBeNull();
    expect(coercePipelineStage(undefined)).toBeNull();
    expect(coercePipelineStage(null)).toBeNull();
  });
});

describe('transitionStage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls the rpc with the right shape', async () => {
    rpc.mockResolvedValue({ data: { id: 'abc', pipeline_stage: 'qualified_opportunity' }, error: null });
    const result = await transitionStage('abc', 'qualified_opportunity');
    expect(db.rpc).toHaveBeenCalledWith('transition_stage', {
      p_account_id: 'abc',
      p_new_stage: 'qualified_opportunity',
      p_metadata: {},
    });
    expect(result.pipeline_stage).toBe('qualified_opportunity');
  });

  it('passes metadata for closed_lost', async () => {
    rpc.mockResolvedValue({ data: { id: 'abc', pipeline_stage: 'closed_lost' }, error: null });
    await transitionStage('abc', 'closed_lost', {
      loss_reason_category: 'bad_timing',
      loss_reason_detail: 'EOY freeze',
    });
    expect(db.rpc).toHaveBeenCalledWith('transition_stage', {
      p_account_id: 'abc',
      p_new_stage: 'closed_lost',
      p_metadata: { loss_reason_category: 'bad_timing', loss_reason_detail: 'EOY freeze' },
    });
  });

  it('passes churn_reason metadata for churned', async () => {
    rpc.mockResolvedValue({ data: { id: 'abc', pipeline_stage: 'churned' }, error: null });
    await transitionStage('abc', 'churned', { churn_reason: 'low_usage' });
    expect(db.rpc).toHaveBeenCalledWith('transition_stage', {
      p_account_id: 'abc',
      p_new_stage: 'churned',
      p_metadata: { churn_reason: 'low_usage' },
    });
  });

  it('carries pin_reason for a Customer-phase override', async () => {
    // The RPC rejects a move into ramping/steady/expanding/at_risk without it,
    // so the type has to allow it and the call has to pass it through.
    rpc.mockResolvedValue({ data: { id: 'abc', pipeline_stage: 'steady' }, error: null });
    await transitionStage('abc', 'steady', { pin_reason: 'customer paused until Sept' });
    expect(db.rpc).toHaveBeenCalledWith('transition_stage', {
      p_account_id: 'abc',
      p_new_stage: 'steady',
      p_metadata: { pin_reason: 'customer paused until Sept' },
    });
  });

  it('throws TransitionStageError on db error', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'requires founder role', code: '42501' },
    });
    await expect(transitionStage('abc', 'qualified_opportunity')).rejects.toBeInstanceOf(TransitionStageError);
  });
});
