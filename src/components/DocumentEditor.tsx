import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { marked } from 'marked';
import { Pencil, Bold, Italic, Strikethrough, Code, Heading1, Heading2, Heading3, List, ListOrdered, CheckSquare, Quote, Minus, Link2, Braces, Table } from 'lucide-react';

const PROSE_CLASSES = `prose prose-sm max-w-none
  prose-headings:font-semibold prose-headings:text-foreground
  prose-h1:text-lg prose-h1:mb-3 prose-h1:mt-0
  prose-h2:text-sm prose-h2:mb-2 prose-h2:mt-4
  prose-h3:text-xs prose-h3:mb-1.5 prose-h3:mt-3
  prose-p:text-xs prose-p:text-foreground prose-p:leading-relaxed
  prose-li:text-xs prose-li:text-foreground
  prose-strong:text-foreground
  prose-table:text-xs
  prose-th:text-left prose-th:py-1.5 prose-th:px-2 prose-th:border prose-th:border-border prose-th:bg-muted prose-th:font-medium
  prose-td:py-1.5 prose-td:px-2 prose-td:border prose-td:border-border
  prose-code:text-[11px] prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded
  prose-hr:border-border prose-hr:my-4`;

interface DocumentEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
}

type FormatAction = {
  icon: React.ReactNode;
  label: string;
  apply: (text: string, start: number, end: number) => { text: string; cursor: number };
  shortcut?: string;
};

type SlashCommand = {
  icon: React.ReactNode;
  label: string;
  description: string;
  insert: string;
};

function wrapSelection(text: string, start: number, end: number, before: string, after: string) {
  const selected = text.slice(start, end);
  const newText = text.slice(0, start) + before + selected + after + text.slice(end);
  return { text: newText, cursor: start + before.length + selected.length };
}

function prefixLine(text: string, start: number, prefix: string) {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const newText = text.slice(0, lineStart) + prefix + text.slice(lineStart);
  return { text: newText, cursor: start + prefix.length };
}

const ICON_SIZE = 'h-3.5 w-3.5';

const FORMAT_ACTIONS: FormatAction[] = [
  { icon: <Bold className={ICON_SIZE} />, label: 'Bold', shortcut: '⌘B', apply: (t, s, e) => wrapSelection(t, s, e, '**', '**') },
  { icon: <Italic className={ICON_SIZE} />, label: 'Italic', shortcut: '⌘I', apply: (t, s, e) => wrapSelection(t, s, e, '_', '_') },
  { icon: <Strikethrough className={ICON_SIZE} />, label: 'Strikethrough', apply: (t, s, e) => wrapSelection(t, s, e, '~', '~') },
  { icon: <Code className={ICON_SIZE} />, label: 'Inline code', shortcut: '⌘E', apply: (t, s, e) => wrapSelection(t, s, e, '`', '`') },
  { icon: <Heading1 className={ICON_SIZE} />, label: 'Heading 1', apply: (t, s) => prefixLine(t, s, '# ') },
  { icon: <Heading2 className={ICON_SIZE} />, label: 'Heading 2', apply: (t, s) => prefixLine(t, s, '## ') },
  { icon: <Heading3 className={ICON_SIZE} />, label: 'Heading 3', apply: (t, s) => prefixLine(t, s, '### ') },
  { icon: <List className={ICON_SIZE} />, label: 'Bullet list', apply: (t, s) => prefixLine(t, s, '- ') },
  { icon: <ListOrdered className={ICON_SIZE} />, label: 'Numbered list', apply: (t, s) => prefixLine(t, s, '1. ') },
  { icon: <CheckSquare className={ICON_SIZE} />, label: 'Checklist', apply: (t, s) => prefixLine(t, s, '- [ ] ') },
  { icon: <Quote className={ICON_SIZE} />, label: 'Blockquote', apply: (t, s) => prefixLine(t, s, '> ') },
  { icon: <Minus className={ICON_SIZE} />, label: 'Divider', apply: (t, s) => {
    const lineStart = t.lastIndexOf('\n', s - 1) + 1;
    const newText = t.slice(0, lineStart) + '---\n' + t.slice(lineStart);
    return { text: newText, cursor: lineStart + 4 };
  }},
  { icon: <Braces className={ICON_SIZE} />, label: 'Code block', apply: (t, s, e) => wrapSelection(t, s, e, '```\n', '\n```') },
  { icon: <Link2 className={ICON_SIZE} />, label: 'Link', shortcut: '⌘K', apply: (t, s, e) => {
    const selected = t.slice(s, e);
    const linkText = selected || 'text';
    const newText = t.slice(0, s) + `[${linkText}](url)` + t.slice(e);
    return { text: newText, cursor: s + linkText.length + 3 };
  }},
];

const SLASH_COMMANDS: SlashCommand[] = [
  { icon: <Heading1 className={ICON_SIZE} />, label: 'Heading 1', description: 'Large heading', insert: '# ' },
  { icon: <Heading2 className={ICON_SIZE} />, label: 'Heading 2', description: 'Medium heading', insert: '## ' },
  { icon: <Heading3 className={ICON_SIZE} />, label: 'Heading 3', description: 'Small heading', insert: '### ' },
  { icon: <List className={ICON_SIZE} />, label: 'Bullet list', description: 'Unordered list item', insert: '- ' },
  { icon: <ListOrdered className={ICON_SIZE} />, label: 'Numbered list', description: 'Ordered list item', insert: '1. ' },
  { icon: <CheckSquare className={ICON_SIZE} />, label: 'Checklist', description: 'Task checkbox', insert: '- [ ] ' },
  { icon: <Quote className={ICON_SIZE} />, label: 'Blockquote', description: 'Quote block', insert: '> ' },
  { icon: <Minus className={ICON_SIZE} />, label: 'Divider', description: 'Horizontal rule', insert: '---\n' },
  { icon: <Braces className={ICON_SIZE} />, label: 'Code block', description: 'Fenced code', insert: '```\n\n```' },
  { icon: <Table className={ICON_SIZE} />, label: 'Table', description: '3-column table', insert: '| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| | | |' },
  { icon: <Bold className={ICON_SIZE} />, label: 'Bold', description: 'Bold text', insert: '**bold**' },
  { icon: <Italic className={ICON_SIZE} />, label: 'Italic', description: 'Italic text', insert: '_italic_' },
  { icon: <Code className={ICON_SIZE} />, label: 'Inline code', description: 'Code snippet', insert: '`code`' },
  { icon: <Link2 className={ICON_SIZE} />, label: 'Link', description: 'Hyperlink', insert: '[text](url)' },
];

export function DocumentEditor({ content, onChange, placeholder = 'Start writing...', className }: DocumentEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Slash command state
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashPos, setSlashPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const slashStartRef = useRef<number>(-1);

  useEffect(() => {
    if (!editing) setDraft(content);
  }, [content, editing]);

  const html = useMemo(() => {
    if (!content) return '';
    return marked.parse(content, { breaks: true }) as string;
  }, [content]);

  const filteredCommands = useMemo(() => {
    if (!slashFilter) return SLASH_COMMANDS;
    const q = slashFilter.toLowerCase();
    return SLASH_COMMANDS.filter(c => c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
  }, [slashFilter]);

  useEffect(() => {
    setSlashIndex(0);
  }, [slashFilter]);

  useEffect(() => {
    if (!slashOpen) return;
    const handler = () => positionSlashMenu();
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slashOpen]);

  const startEditing = useCallback(() => {
    setDraft(content);
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [content]);

  const saveAndClose = useCallback(() => {
    if (slashOpen) return; // don't close if slash menu is open
    setEditing(false);
    if (draft !== content) onChange(draft);
  }, [draft, content, onChange, slashOpen]);

  const cancel = useCallback(() => {
    setSlashOpen(false);
    setEditing(false);
    setDraft(content);
  }, [content]);

  const applyFormat = useCallback((action: FormatAction) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { text, cursor } = action.apply(draft, ta.selectionStart, ta.selectionEnd);
    setDraft(text);
    onChange(text);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(cursor, cursor); }, 0);
  }, [draft, onChange]);

  const applySlashCommand = useCallback((cmd: SlashCommand) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = slashStartRef.current;
    const cursorPos = ta.selectionStart;
    // Replace from slash start to current cursor with the insert text
    const newText = draft.slice(0, start) + cmd.insert + draft.slice(cursorPos);
    const newCursor = start + cmd.insert.length;
    setDraft(newText);
    onChange(newText);
    setSlashOpen(false);
    setSlashFilter('');
    slashStartRef.current = -1;
    setTimeout(() => { ta.focus(); ta.setSelectionRange(newCursor, newCursor); }, 0);
  }, [draft, onChange]);

  const getCaretCoordinates = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return { top: 0, left: 0 };
    // Create a mirror div to measure caret position
    const mirror = document.createElement('div');
    const style = window.getComputedStyle(ta);
    const props = ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight', 'paddingTop', 'paddingLeft', 'paddingRight', 'borderTopWidth', 'borderLeftWidth', 'boxSizing', 'whiteSpace', 'wordWrap', 'overflowWrap'] as const;
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';
    mirror.style.width = style.width;
    props.forEach(p => { (mirror.style as any)[p] = style.getPropertyValue(p.replace(/[A-Z]/g, m => '-' + m.toLowerCase())); });
    const text = ta.value.substring(0, ta.selectionStart);
    mirror.textContent = text;
    const span = document.createElement('span');
    span.textContent = '|';
    mirror.appendChild(span);
    document.body.appendChild(mirror);
    const top = span.offsetTop - ta.scrollTop;
    const left = span.offsetLeft;
    document.body.removeChild(mirror);
    return { top, left };
  }, []);

  const positionSlashMenu = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const taRect = ta.getBoundingClientRect();
    const caret = getCaretCoordinates(); // relative to textarea content box
    const MENU_W = 224; // w-56
    const MENU_MAX_H = 256; // max-h-64
    const MARGIN = 8;
    const lineHeight = parseFloat(window.getComputedStyle(ta).lineHeight) || 20;

    // Caret position in viewport coordinates
    const caretViewportTop = taRect.top + caret.top;
    const caretViewportLeft = taRect.left + caret.left;

    const spaceBelow = window.innerHeight - (caretViewportTop + lineHeight) - MARGIN;
    const spaceAbove = caretViewportTop - MARGIN;
    const flipUp = spaceBelow < 160 && spaceAbove > spaceBelow;

    const maxH = Math.min(MENU_MAX_H, Math.max(120, flipUp ? spaceAbove : spaceBelow));
    const top = flipUp ? caretViewportTop - maxH - 4 : caretViewportTop + lineHeight + 4;
    const left = Math.min(Math.max(MARGIN, caretViewportLeft), window.innerWidth - MENU_W - MARGIN);

    setSlashPos({ top, left, maxHeight: maxH });
  }, [getCaretCoordinates]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setDraft(val);
    onChange(val);

    const ta = e.target;
    const pos = ta.selectionStart;
    const lineStart = val.lastIndexOf('\n', pos - 1) + 1;
    const lineText = val.slice(lineStart, pos);

    // Check if we're in a slash command context
    const slashMatch = lineText.match(/^\/(\w*)$/);
    if (slashMatch) {
      slashStartRef.current = lineStart;
      setSlashFilter(slashMatch[1]);
      setSlashOpen(true);
      setTimeout(positionSlashMenu, 0);
    } else {
      if (slashOpen) {
        setSlashOpen(false);
        setSlashFilter('');
        slashStartRef.current = -1;
      }
    }
  }, [onChange, slashOpen, positionSlashMenu]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Slash menu navigation
    if (slashOpen && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex(i => (i + 1) % filteredCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex(i => (i - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applySlashCommand(filteredCommands[slashIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashOpen(false);
        setSlashFilter('');
        slashStartRef.current = -1;
        return;
      }
    }

    if (e.key === 'Escape') { cancel(); return; }
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const map: Record<string, number> = { b: 0, i: 1, e: 3, k: 13 };
    const idx = map[e.key.toLowerCase()];
    if (idx !== undefined) {
      e.preventDefault();
      applyFormat(FORMAT_ACTIONS[idx]);
    }
  }, [cancel, applyFormat, slashOpen, filteredCommands, slashIndex, applySlashCommand]);

  if (editing) {
    return (
      <div className={`flex flex-col flex-1 overflow-hidden ${className || ''}`}>
        {/* Toolbar */}
        <div className="flex items-center gap-0.5 px-1 py-1 border-b border-border bg-muted/30 flex-wrap">
          {FORMAT_ACTIONS.map((action, i) => (
            <button
              key={i}
              onMouseDown={e => e.preventDefault()} // prevent blur (would close the editor before the click fires)
              onClick={() => applyFormat(action)}
              className="p-1.5 rounded-sm hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title={action.label + (action.shortcut ? ` (${action.shortcut})` : '')}
              type="button"
            >
              {action.icon}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-muted-foreground px-2">
            Type <kbd className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">/</kbd> for commands · <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Esc</kbd> to cancel
          </span>
        </div>
        {/* Editor */}
        <div className="flex-1 overflow-hidden relative">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onBlur={saveAndClose}
            className="w-full h-full resize-none bg-transparent px-0 py-2 text-sm font-mono leading-relaxed placeholder:text-muted-foreground/40 outline-none"
            placeholder={placeholder}
          />
          {/* Slash command menu — portaled & fixed so it never gets clipped */}
          {slashOpen && filteredCommands.length > 0 && slashPos && createPortal(
            <div
              ref={menuRef}
              className="fixed z-[100] w-56 overflow-y-auto rounded-md border border-border bg-popover shadow-md py-1"
              style={{ top: slashPos.top, left: slashPos.left, maxHeight: slashPos.maxHeight }}
              onMouseDown={e => e.preventDefault()} // prevent blur
            >
              {filteredCommands.map((cmd, i) => (
                <button
                  key={cmd.label}
                  type="button"
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors ${
                    i === slashIndex ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-muted'
                  }`}
                  onMouseDown={e => { e.preventDefault(); applySlashCommand(cmd); }}
                  onMouseEnter={() => setSlashIndex(i)}
                >
                  <span className="text-muted-foreground shrink-0">{cmd.icon}</span>
                  <span className="flex flex-col min-w-0">
                    <span className="text-xs font-medium truncate">{cmd.label}</span>
                    <span className="text-[10px] text-muted-foreground truncate">{cmd.description}</span>
                  </span>
                </button>
              ))}
            </div>,
            document.body
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex-1 overflow-y-auto group cursor-text ${className || ''}`}
      onClick={startEditing}
    >
      <div className="flex items-center gap-1 mb-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Pencil className="h-3 w-3 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground">Click to edit</span>
      </div>
      {content ? (
        <div className={PROSE_CLASSES} dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="text-xs text-muted-foreground py-8 text-center">{placeholder}</p>
      )}
    </div>
  );
}
