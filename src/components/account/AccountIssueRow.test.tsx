import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AccountIssueRow } from './AccountIssueRow';
import { initialsOf } from '@/lib/initials';
import type { DbTask } from '@/hooks/useProjectsDB';

const task = (over: Partial<DbTask> = {}) => ({
  id: 't1',
  name: 'Get admin access to launch the new campaigns',
  status: 'todo',
  priority: null,
  assign_to: null,
  due_date: null,
  code: 'ACME-23',
  parent_id: null,
  milestone_id: null,
  account_id: 'a1',
  organization_id: 'o1',
  position: 0,
  is_done: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
} as DbTask);

const members = [{ user_id: 'u1', display_name: 'Jane Smith' }];

function renderRow(over: Partial<DbTask> = {}, props: Partial<Parameters<typeof AccountIssueRow>[0]> = {}) {
  const onUpdate = vi.fn();
  const onOpenPanel = vi.fn();
  const utils = render(
    <AccountIssueRow
      task={task(over)}
      orgMembers={members}
      isSelected={false}
      onUpdate={onUpdate}
      onStatusChange={vi.fn()}
      onOpenPanel={onOpenPanel}
      onDelete={vi.fn()}
      {...props}
    />,
  );
  return { ...utils, onUpdate, onOpenPanel };
}

describe('initialsOf', () => {
  it('takes first and last initials, or a placeholder', () => {
    expect(initialsOf('Jane Smith')).toBe('JS');
    expect(initialsOf('Mary Ann Jones')).toBe('MJ');
    expect(initialsOf('Sam')).toBe('S');
    expect(initialsOf(null)).toBe('?');
    expect(initialsOf('   ')).toBe('?');
  });
});

describe('AccountIssueRow icons', () => {
  // Regression guard for a bug that shipped: the trigger carries
  // `[&>svg]:hidden` to hide the Radix chevron, so any icon passed as a DIRECT
  // svg child gets hidden too. Icons must stay wrapped in a span.
  it('never renders an icon as a direct svg child of a Select trigger', () => {
    const { container } = renderRow();
    const triggers = container.querySelectorAll('[role="combobox"]');
    expect(triggers.length).toBe(2); // status + owner
    triggers.forEach(trigger => {
      // The chevron is the only direct-svg the hiding rule may match.
      expect(trigger.querySelectorAll(':scope > svg').length).toBeLessThanOrEqual(1);
      // ...and the actual icon is nested deeper, so it survives.
      expect(trigger.querySelector('span svg')).not.toBeNull();
    });
  });

  it('shows an owner icon when unassigned and initials when assigned', () => {
    const { container, unmount } = renderRow({ assign_to: null });
    expect(container.querySelector('[aria-label="Owner"] span svg')).not.toBeNull();
    unmount();

    renderRow({ assign_to: 'u1' });
    expect(screen.getByText('JS')).toBeInTheDocument();
  });

  it('labels the status trigger with the current status', () => {
    renderRow({ status: 'in_progress' });
    expect(screen.getByLabelText('Status')).toHaveAttribute('title', 'In Progress');
  });
});

describe('AccountIssueRow interaction', () => {
  it('focuses the title when the row background is clicked', () => {
    const { container } = renderRow();
    const input = screen.getByLabelText('Issue title') as HTMLInputElement;
    expect(document.activeElement).not.toBe(input);

    fireEvent.click(container.firstChild as HTMLElement);

    expect(document.activeElement).toBe(input);
    // Caret parked at the end — a stray keystroke must not wipe the name.
    expect(input.selectionStart).toBe(input.value.length);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('does not hijack focus when a control is clicked', () => {
    const { onOpenPanel } = renderRow();
    const input = screen.getByLabelText('Issue title');

    fireEvent.click(screen.getByLabelText('Open details'));

    expect(onOpenPanel).toHaveBeenCalledTimes(1);
    expect(document.activeElement).not.toBe(input);
  });

  it('strikes through the title input itself when the issue is finished', () => {
    // text-decoration does not reach into form controls from an ancestor,
    // so the class has to land on the input.
    for (const status of ['done', 'cancelled']) {
      const { unmount } = renderRow({ status });
      expect(screen.getByLabelText('Issue title').className).toContain('line-through');
      unmount();
    }
  });

  it('leaves an open issue unstruck', () => {
    renderRow({ status: 'in_progress' });
    expect(screen.getByLabelText('Issue title').className).not.toContain('line-through');
  });

  it('renames through onUpdate on blur', () => {
    const { onUpdate } = renderRow();
    const input = screen.getByLabelText('Issue title');
    fireEvent.change(input, { target: { value: 'Novo titulo' } });
    fireEvent.blur(input);
    expect(onUpdate).toHaveBeenCalledWith({ name: 'Novo titulo' });
  });
});
