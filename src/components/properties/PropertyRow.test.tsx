import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PropertyRow } from './PropertyRow';

describe('PropertyRow', () => {
  it('shows emptyText when value is empty', () => {
    render(<PropertyRow label="Expected close" value={null} emptyText="Not set" />);
    expect(screen.getByText('Not set')).toBeInTheDocument();
  });

  // The signal has to appear when the field is empty and disappear the moment
  // it is filled, without the caller tracking that itself — the caller passes
  // the blocker unconditionally.
  describe('missing', () => {
    const reason = 'A proposal with no expiry has no reason to be signed this month.';

    it('replaces emptyText with a required marker and the reason', () => {
      render(<PropertyRow label="Proposal valid until" value={null} missing={{ reason }} />);
      expect(screen.getByText('Required')).toBeInTheDocument();
      expect(screen.getByText(`— ${reason}`)).toBeInTheDocument();
      expect(screen.queryByText('Not set')).toBeNull();
    });

    it('stays silent once the field has a value, even if still flagged', () => {
      render(<PropertyRow label="Proposal valid until" value="Sep 30, 2026" missing={{ reason }} />);
      expect(screen.queryByText('Required')).toBeNull();
      expect(screen.getByText('Sep 30, 2026')).toBeInTheDocument();
    });

    it('leaves an unflagged empty row exactly as it was', () => {
      render(<PropertyRow label="Source" value={null} emptyText="Not set" />);
      expect(screen.getByText('Not set')).toBeInTheDocument();
      expect(screen.queryByText('Required')).toBeNull();
    });

    it('stays editable so the row itself is the way to fix it', () => {
      const onEdit = vi.fn();
      render(<PropertyRow label="Potential MRR" value={null} missing={{ reason }} onEdit={onEdit} />);
      fireEvent.click(screen.getByRole('button'));
      expect(onEdit).toHaveBeenCalled();
    });
  });
  it('calls onEdit on click when editable', () => {
    const onEdit = vi.fn();
    render(<PropertyRow label="Owner" value="Luiz" onEdit={onEdit} />);
    fireEvent.click(screen.getByText('Owner'));
    expect(onEdit).toHaveBeenCalled();
  });
  it('shows a formula tooltip and never calls onEdit when calculated', () => {
    const onEdit = vi.fn();
    render(<PropertyRow label="Expected ARR" value="$2.4M" calculated formula="$200 x 12 - from MRR" onEdit={onEdit} />);
    expect(screen.getByLabelText('Derived value: $200 x 12 - from MRR')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Expected ARR'));
    expect(onEdit).not.toHaveBeenCalled();
  });
  it('renders editor node when editing', () => {
    render(<PropertyRow label="Owner" value="x" editing editor={<input aria-label="owner-input" />} />);
    expect(screen.getByLabelText('owner-input')).toBeInTheDocument();
  });
  it('editable row has role="button" and calls onEdit on Enter', () => {
    const onEdit = vi.fn();
    const { container } = render(<PropertyRow label="Owner" value="Luiz" onEdit={onEdit} />);
    const row = container.firstChild as HTMLElement;
    expect(row).toHaveAttribute('role', 'button');
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onEdit).toHaveBeenCalled();
  });
  it('editable row prevents default and calls onEdit on Space keydown', () => {
    const onEdit = vi.fn();
    const { container } = render(<PropertyRow label="Owner" value="Luiz" onEdit={onEdit} />);
    const row = container.firstChild as HTMLElement;
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    row.dispatchEvent(event);
    expect(onEdit).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });
  it('non-editable (calculated) row has no role="button"', () => {
    const onEdit = vi.fn();
    const { container } = render(<PropertyRow label="Expected ARR" value="$2.4M" calculated onEdit={onEdit} />);
    const row = container.firstChild as HTMLElement;
    expect(row).not.toHaveAttribute('role', 'button');
  });
});
