import { createContext, useContext, type ReactNode } from 'react';
import {
  usePipelineCardFields,
  type PipelineCardFieldsController,
} from './usePipelineCardFields';
import type { PipelinePhase } from '@/lib/transitionStage';

/**
 * The card-field selection for the phase currently on screen.
 *
 * `null` means "nobody configured this" — the card then falls back to the
 * registry defaults (see `isFieldVisible`), which reproduce the card exactly as
 * it looked before it became configurable. That fallback is also what lets
 * `PipelineCard` render standalone, as its component tests do.
 *
 * A context rather than a prop because the only path from the board to the card
 * runs through `PipelineColumn`, a documented pure presenter with no business
 * forwarding a display preference it never reads.
 */
const Ctx = createContext<PipelineCardFieldsController | null>(null);

/**
 * ⚠️ Mount with `key={phase}`. `usePipelineCardFields` hydrates from
 * localStorage once, so a phase switch must remount this provider or the new
 * phase silently inherits the previous phase's selection.
 */
export function PipelineCardFieldsProvider({
  phase,
  orgId,
  children,
}: {
  phase: PipelinePhase;
  orgId: string | null | undefined;
  children: ReactNode;
}) {
  const controller = usePipelineCardFields(phase, orgId);
  return <Ctx.Provider value={controller}>{children}</Ctx.Provider>;
}

/** For the card: just the visible set, or `null` when there is no provider. */
export function usePipelineCardFieldSet(): ReadonlySet<string> | null {
  return useContext(Ctx)?.visible ?? null;
}

/** For the menu: the whole controller. `null` outside a provider. */
export function usePipelineCardFieldControls(): PipelineCardFieldsController | null {
  return useContext(Ctx);
}
