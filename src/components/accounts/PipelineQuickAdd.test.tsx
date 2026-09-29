import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PipelineQuickAdd } from './PipelineQuickAdd';

// The composer is controlled by PipelineColumn; this wrapper stands in for it.
function Harness({ onCreate }: { onCreate: (name: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  return (
    <PipelineQuickAdd
      stageLabel="Discovery Call"
      variant="inline"
      open={open}
      onOpenChange={setOpen}
      onCreate={onCreate}
    />
  );
}

const trigger = () => screen.getByRole('button', { name: 'Add account to Discovery Call' });
const field = () => screen.getByRole('textbox', { name: 'New account in Discovery Call' }) as HTMLInputElement;

/** Open the composer and type `value` into it. */
function openAndType(value: string) {
  fireEvent.click(trigger());
  fireEvent.change(field(), { target: { value } });
}

describe('PipelineQuickAdd', () => {
  it('opens a focused input when the trigger is clicked', () => {
    render(<Harness onCreate={vi.fn().mockResolvedValue(true)} />);

    fireEvent.click(trigger());

    expect(field()).toHaveFocus();
  });

  it('creates on Enter with the trimmed name', async () => {
    const onCreate = vi.fn().mockResolvedValue(true);
    render(<Harness onCreate={onCreate} />);

    openAndType('  Northwind Supply  ');
    fireEvent.keyDown(field(), { key: 'Enter' });

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Northwind Supply'));
  });

  it('stays open and clears after a successful create, ready for the next one', async () => {
    render(<Harness onCreate={vi.fn().mockResolvedValue(true)} />);

    openAndType('Bluebird Health');
    fireEvent.keyDown(field(), { key: 'Enter' });

    await waitFor(() => expect(field()).toHaveValue(''));
    expect(field()).toHaveFocus();
  });

  it('keeps what was typed when the create fails', async () => {
    render(<Harness onCreate={vi.fn().mockResolvedValue(false)} />);

    openAndType('Zoë Labs');
    fireEvent.keyDown(field(), { key: 'Enter' });

    await waitFor(() => expect(field()).toBeEnabled());
    expect(field()).toHaveValue('Zoë Labs');
  });

  it('ignores Enter on a whitespace-only name', () => {
    const onCreate = vi.fn().mockResolvedValue(true);
    render(<Harness onCreate={onCreate} />);

    openAndType('   ');
    fireEvent.keyDown(field(), { key: 'Enter' });

    expect(onCreate).not.toHaveBeenCalled();
    expect(field()).toBeInTheDocument();
  });

  it('closes on Escape without creating', () => {
    const onCreate = vi.fn().mockResolvedValue(true);
    render(<Harness onCreate={onCreate} />);

    openAndType('Draft');
    fireEvent.keyDown(field(), { key: 'Escape' });

    expect(onCreate).not.toHaveBeenCalled();
    expect(trigger()).toBeInTheDocument();
  });

  it('dismisses on blur only when nothing was typed', () => {
    render(<Harness onCreate={vi.fn().mockResolvedValue(true)} />);

    fireEvent.click(trigger());
    fireEvent.blur(field());
    expect(trigger()).toBeInTheDocument();

    openAndType('Half typed');
    fireEvent.blur(field());
    expect(field()).toBeInTheDocument();
  });
});
