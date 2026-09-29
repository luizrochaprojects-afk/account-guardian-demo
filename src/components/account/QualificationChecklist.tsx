import { Check, X, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Json } from '@/types/database';
import {
  QUALIFICATION_AFFIRMATIVE_ITEMS,
  type QualificationItemKey,
} from '@/lib/stageReadiness';

export interface ChecklistItemValue {
  answer?: boolean | null;
  evidence?: string;
  source?: 'human' | 'agent';
  confidence?: number;
}

/**
 * Keys and order come from stageReadiness (the gate), labels live here (the
 * presentation). A key added to the gate without a label here is a type error.
 */
const LABELS: Record<QualificationItemKey, string> = {
  is_decision_maker: 'Decision maker present (or accessible)',
  pain_exists_genuinely: 'Pain is genuine (not induced)',
  budget_path: 'Budget, or a path to budget',
  timeline: 'Timeline or triggering event',
  champion: 'Internal champion identified',
  technical_fit: 'Technical fit confirmed',
};

const ITEMS = (Object.keys(LABELS) as QualificationItemKey[]).map((key) => ({
  key,
  label: LABELS[key],
  mustBeYes: (QUALIFICATION_AFFIRMATIVE_ITEMS as readonly string[]).includes(key),
}));

export const QUALIFICATION_ITEM_COUNT = ITEMS.length;

function getItem(checklist: Json | null | undefined, key: QualificationItemKey): ChecklistItemValue {
  if (!checklist || typeof checklist !== 'object' || Array.isArray(checklist)) return {};
  return (checklist as Record<string, ChecklistItemValue>)[key] ?? {};
}

/** Number of checklist items with a definite (true/false) answer — drives the call site's Badge. */
export function getAnsweredCount(checklist: Json | null | undefined): number {
  return ITEMS.filter((i) => {
    const v = getItem(checklist, i.key);
    return v.answer === true || v.answer === false;
  }).length;
}

/** unanswered → yes → no → unanswered. */
function nextAnswer(current: boolean | null | undefined): boolean | null {
  if (current === true) return false;
  if (current === false) return null;
  return true;
}

/** Returns the checklist with one item's answer cycled, stamped as a human answer. */
export function cycleChecklistAnswer(
  checklist: Json | null | undefined,
  key: QualificationItemKey,
): Json {
  const base =
    checklist && typeof checklist === 'object' && !Array.isArray(checklist)
      ? (checklist as Record<string, ChecklistItemValue>)
      : {};
  const current = base[key] ?? {};
  const answer = nextAnswer(current.answer);
  const next: ChecklistItemValue = { ...current, answer, source: 'human' };
  delete next.confidence;
  return { ...base, [key]: next } as unknown as Json;
}

interface Props {
  checklist: Json | null | undefined;
  /** When set, each item is a button that cycles unanswered → yes → no. */
  onAnswer?: (key: QualificationItemKey) => void;
  disabled?: boolean;
}

/**
 * Item list only — no card chrome. Call site wraps this in a `SectionCard`.
 *
 * Answers can come from a person or from the meeting agent; an agent answer
 * shows its confidence, so nobody mistakes an extraction for a confirmation.
 */
export function QualificationChecklist({ checklist, onAnswer, disabled }: Props) {
  return (
    <ul className="space-y-2">
      {ITEMS.map((item) => {
        const v = getItem(checklist, item.key);
        const Icon = v.answer === true ? Check : v.answer === false ? X : HelpCircle;
        const colour =
          v.answer === true ? 'text-green-600'
          : v.answer === false ? 'text-red-600'
          : 'text-muted-foreground';
        const answerLabel = v.answer === true ? 'yes' : v.answer === false ? 'no' : 'unanswered';
        const body = (
          <>
            <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', colour)} aria-hidden />
            <div className="flex-1 min-w-0 text-left">
              <div className="text-sm">
                {item.label}
                {item.mustBeYes && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground">must be yes</span>
                )}
              </div>
              {v.evidence && (
                <div className="text-xs text-muted-foreground italic line-clamp-2 mt-0.5">
                  "{v.evidence}"
                </div>
              )}
              {v.source === 'agent' && v.confidence !== undefined && (
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  agent · confidence {(v.confidence * 100).toFixed(0)}%
                </div>
              )}
            </div>
          </>
        );
        return (
          <li key={item.key}>
            {onAnswer ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAnswer(item.key)}
                aria-label={`${item.label}: ${answerLabel}. Click to change.`}
                className="flex w-full items-start gap-2 rounded-sm px-1 -mx-1 py-0.5 hover:bg-muted/60 disabled:opacity-60"
              >
                {body}
              </button>
            ) : (
              <div className="flex items-start gap-2">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
