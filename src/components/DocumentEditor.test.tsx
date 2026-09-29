import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DocumentEditor } from './DocumentEditor';

describe('DocumentEditor — toolbar formatting', () => {
  it('applies Bold formatting on click without the mousedown blur closing the editor first', () => {
    const onChange = vi.fn();
    render(<DocumentEditor content="" onChange={onChange} />);

    // Enter edit mode.
    fireEvent.click(screen.getByText('Click to edit'));
    const textarea = screen.getByPlaceholderText('Start writing...') as HTMLTextAreaElement;
    textarea.focus();

    fireEvent.change(textarea, { target: { value: 'hello' } });
    textarea.setSelectionRange(0, 5);

    const boldButton = screen.getByTitle('Bold (⌘B)');

    // jsdom doesn't replicate the browser's default mousedown-shifts-focus
    // behavior, so simulate it explicitly: real browsers only blur the
    // textarea if the button's mousedown handler didn't call preventDefault.
    const mouseDownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    const defaultNotPrevented = boldButton.dispatchEvent(mouseDownEvent);
    if (defaultNotPrevented) fireEvent.blur(textarea);

    fireEvent.click(boldButton);

    expect(onChange).toHaveBeenLastCalledWith('**hello**');
    // The editor must still be open (toolbar still rendered) after formatting.
    expect(screen.getByTitle('Bold (⌘B)')).toBeInTheDocument();
  });
});
