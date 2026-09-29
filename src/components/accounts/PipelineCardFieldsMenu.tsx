import { SlidersHorizontal } from 'lucide-react';
import { ColumnsMenu } from '@/components/listing';
import { usePipelineCardFieldControls } from './PipelineCardFieldsContext';

/**
 * Toolbar control for "what shows up on a card". Deliberately the same popover
 * the table pages use for their columns — one mental model for both views —
 * with the wording and icon changed, because a board is made of cards, not
 * columns.
 *
 * Renders nothing outside a `PipelineCardFieldsProvider`.
 */
export function PipelineCardFieldsMenu() {
  const controls = usePipelineCardFieldControls();
  if (!controls) return null;

  return (
    <ColumnsMenu
      columns={controls.fields}
      visible={controls.visible}
      onToggle={controls.toggle}
      onReset={controls.reset}
      icon={SlidersHorizontal}
      title="Card fields"
      heading="Card fields"
    />
  );
}
