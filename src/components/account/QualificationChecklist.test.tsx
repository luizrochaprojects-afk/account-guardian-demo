import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  QualificationChecklist,
  getAnsweredCount,
  cycleChecklistAnswer,
  QUALIFICATION_ITEM_COUNT,
} from './QualificationChecklist';
import { QUALIFICATION_REQUIRED_ITEMS } from '@/lib/stageReadiness';

const yesToTimeline = { timeline: { answer: true } } as unknown as Record<string, unknown>;

describe('getAnsweredCount', () => {
  it('counts only definite answers', () => {
    expect(getAnsweredCount(yesToTimeline as never)).toBe(1);
    expect(getAnsweredCount({ timeline: {} } as never)).toBe(0);
  });

  it('counts a "no" as an answer, and ignores keys the checklist does not know', () => {
    expect(getAnsweredCount({
      champion: { answer: false },
      technical_fit: { answer: null },
      some_retired_item: { answer: true },
    } as never)).toBe(1);
  });

  it('treats a missing or malformed checklist as nothing answered', () => {
    expect(getAnsweredCount(null)).toBe(0);
    expect(getAnsweredCount([] as never)).toBe(0);
  });
});

describe('QUALIFICATION_ITEM_COUNT', () => {
  it('matches the items the stage gate requires', () => {
    expect(QUALIFICATION_ITEM_COUNT).toBe(6);
    expect(QUALIFICATION_ITEM_COUNT).toBe(QUALIFICATION_REQUIRED_ITEMS.length);
  });
});

describe('cycleChecklistAnswer', () => {
  it('cycles unanswered → yes → no → unanswered', () => {
    const a = cycleChecklistAnswer(null, 'champion') as Record<string, { answer: unknown }>;
    expect(a.champion.answer).toBe(true);
    const b = cycleChecklistAnswer(a as never, 'champion') as Record<string, { answer: unknown }>;
    expect(b.champion.answer).toBe(false);
    const c = cycleChecklistAnswer(b as never, 'champion') as Record<string, { answer: unknown }>;
    expect(c.champion.answer).toBeNull();
  });

  it('stamps the answer as human and drops the agent confidence, keeping the evidence', () => {
    const agent = {
      budget_path: { answer: true, source: 'agent', confidence: 0.7, evidence: 'Budget approved for Q3' },
      timeline: { answer: false },
    };
    const next = cycleChecklistAnswer(agent as never, 'budget_path') as Record<string, Record<string, unknown>>;
    expect(next.budget_path).toEqual({ answer: false, source: 'human', evidence: 'Budget approved for Q3' });
    // other items untouched
    expect(next.timeline).toEqual({ answer: false });
  });
});

describe('QualificationChecklist', () => {
  it('renders every item, answered or not', () => {
    render(<QualificationChecklist checklist={yesToTimeline as never} />);
    expect(screen.getByText('Decision maker present (or accessible)')).toBeInTheDocument();
    expect(screen.getByText('Pain is genuine (not induced)')).toBeInTheDocument();
    expect(screen.getByText('Budget, or a path to budget')).toBeInTheDocument();
    expect(screen.getByText('Timeline or triggering event')).toBeInTheDocument();
    expect(screen.getByText('Internal champion identified')).toBeInTheDocument();
    expect(screen.getByText('Technical fit confirmed')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
  });

  it('marks exactly decision maker, pain and budget path as must-be-yes', () => {
    render(<QualificationChecklist checklist={null} />);
    expect(screen.getAllByText('must be yes')).toHaveLength(3);
    for (const label of [
      'Decision maker present (or accessible)',
      'Pain is genuine (not induced)',
      'Budget, or a path to budget',
    ]) {
      expect(screen.getByText(label)).toHaveTextContent('must be yes');
    }
    expect(screen.getByText('Timeline or triggering event')).not.toHaveTextContent('must be yes');
  });

  it('survives a null checklist', () => {
    render(<QualificationChecklist checklist={null} />);
    expect(screen.getByText('Timeline or triggering event')).toBeInTheDocument();
  });

  it('shows the agent confidence so an extraction is not mistaken for a confirmation', () => {
    render(
      <QualificationChecklist
        checklist={{ champion: { answer: true, source: 'agent', confidence: 0.82, evidence: 'Priya offered to intro us' } } as never}
      />,
    );
    expect(screen.getByText('agent · confidence 82%')).toBeInTheDocument();
    expect(screen.getByText('"Priya offered to intro us"')).toBeInTheDocument();
  });

  it('is read-only without onAnswer', () => {
    render(<QualificationChecklist checklist={null} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('makes each item a button when onAnswer is set, reporting the item key', () => {
    const onAnswer = vi.fn();
    render(<QualificationChecklist checklist={yesToTimeline as never} onAnswer={onAnswer} />);
    expect(screen.getAllByRole('button')).toHaveLength(6);

    fireEvent.click(screen.getByRole('button', { name: /^Timeline or triggering event: yes\./ }));
    expect(onAnswer).toHaveBeenCalledWith('timeline');

    fireEvent.click(screen.getByRole('button', { name: /^Internal champion identified: unanswered\./ }));
    expect(onAnswer).toHaveBeenLastCalledWith('champion');
  });

  it('disables the buttons when asked', () => {
    render(<QualificationChecklist checklist={null} onAnswer={vi.fn()} disabled />);
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled();
  });
});
