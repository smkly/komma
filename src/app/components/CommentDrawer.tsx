'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface MentionItem {
  type: 'doc' | 'mcp';
  name: string;
  display: string;
}

interface CommentDrawerProps {
  show: boolean;
  selectedText: string;
  newComment: string;
  setNewComment: (value: string) => void;
  onSubmit: (commentText: string, refs?: { docs: string[]; mcps: string[] }) => void;
  onCancel: () => void;
  currentDir?: string;
}

export default function CommentDrawer({
  show,
  selectedText,
  newComment,
  setNewComment,
  onSubmit,
  onCancel,
  currentDir,
}: CommentDrawerProps) {
  const [localComment, setLocalComment] = useState(newComment);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionItems, setMentionItems] = useState<MentionItem[]>([]);
  const [mentionStartPos, setMentionStartPos] = useState(-1);
  const [allItems, setAllItems] = useState<MentionItem[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Reset local state when drawer opens
  useEffect(() => {
    if (show) {
      setLocalComment(newComment);
      setShowMentions(false);
      setMentionFilter('');
      setMentionIndex(0);
    }
  }, [show]);

  // Fetch available items when drawer opens
  useEffect(() => {
    if (!show) return;

    const items: MentionItem[] = [];

    // Fetch sibling .md files
    const fetchFiles = async () => {
      if (!currentDir) return;
      try {
        const res = await fetch(`/api/files?path=${encodeURIComponent(currentDir)}`);
        const data = await res.json();
        if (data.files) {
          for (const f of data.files) {
            if (!f.isDirectory && f.name.endsWith('.md')) {
              items.push({ type: 'doc', name: f.name, display: f.name });
            }
          }
        }
      } catch {
        // ignore
      }
    };

    // Fetch MCP tools
    const fetchMcps = async () => {
      try {
        const mcps = await window.electronAPI?.claude.listMcps();
        if (mcps) {
          for (const m of mcps) {
            items.push({ type: 'mcp', name: m.name, display: m.name });
          }
        }
      } catch {
        // ignore
      }
    };

    Promise.all([fetchFiles(), fetchMcps()]).then(() => {
      setAllItems(items);
    });
  }, [show, currentDir]);

  // Filter items when mention filter changes
  useEffect(() => {
    if (!showMentions) return;
    const lower = mentionFilter.toLowerCase();
    const filtered = allItems.filter(item =>
      item.name.toLowerCase().includes(lower)
    );
    setMentionItems(filtered);
    setMentionIndex(0);
  }, [mentionFilter, showMentions, allItems]);

  const insertMention = useCallback((item: MentionItem) => {
    const textarea = textareaRef.current;
    if (!textarea || mentionStartPos < 0) return;

    const before = localComment.slice(0, mentionStartPos);
    const after = localComment.slice(textarea.selectionStart);
    const insert = item.type === 'doc' ? `@${item.name}` : `@mcp:${item.name}`;
    const newVal = before + insert + ' ' + after;

    setLocalComment(newVal);
    setShowMentions(false);
    setMentionFilter('');
    setMentionStartPos(-1);

    // Restore focus and cursor position
    requestAnimationFrame(() => {
      textarea.focus();
      const cursorPos = before.length + insert.length + 1;
      textarea.setSelectionRange(cursorPos, cursorPos);
    });
  }, [localComment, mentionStartPos]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart;
    setLocalComment(val);

    // Check if we should show/update mention dropdown
    if (showMentions && mentionStartPos >= 0) {
      // We're in a mention — update filter or close
      const textSinceMention = val.slice(mentionStartPos + 1, cursorPos);
      if (textSinceMention.includes(' ') || textSinceMention.includes('\n')) {
        setShowMentions(false);
        setMentionStartPos(-1);
      } else {
        setMentionFilter(textSinceMention);
      }
    } else {
      // Check if user just typed @
      const charBefore = cursorPos > 0 ? val[cursorPos - 1] : '';
      const charBeforeThat = cursorPos > 1 ? val[cursorPos - 2] : ' ';
      if (charBefore === '@' && (charBeforeThat === ' ' || charBeforeThat === '\n' || cursorPos === 1)) {
        setShowMentions(true);
        setMentionStartPos(cursorPos - 1);
        setMentionFilter('');
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions && mentionItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => Math.min(prev + 1, mentionItems.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionItems[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentions(false);
        setMentionStartPos(-1);
        return;
      }
    }

    if (e.key === 'Enter' && e.metaKey) {
      handleSubmit();
    }
    if (e.key === 'Escape' && !showMentions) {
      onCancel();
    }
  };

  // Parse references from text
  const parseRefs = (text: string): { docs: string[]; mcps: string[] } => {
    const docs: string[] = [];
    const mcps: string[] = [];
    // Match @mcp:name first, then @filename.md
    const mcpRegex = /@mcp:([\w-]+)/g;
    const docRegex = /@([\w.-]+\.md)/g;
    let m;
    while ((m = mcpRegex.exec(text)) !== null) {
      if (!mcps.includes(m[1])) mcps.push(m[1]);
    }
    while ((m = docRegex.exec(text)) !== null) {
      if (!docs.includes(m[1])) docs.push(m[1]);
    }
    return { docs, mcps };
  };

  const handleSubmit = () => {
    if (!localComment.trim()) return;
    const refs = parseRefs(localComment);
    onSubmit(localComment, refs);
    setLocalComment('');
  };

  // Scroll dropdown to keep selected item visible
  useEffect(() => {
    if (!showMentions || !dropdownRef.current) return;
    const selected = dropdownRef.current.children[mentionIndex] as HTMLElement;
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [mentionIndex, showMentions]);

  if (!show) return null;

  return (
    <>
      {/* Subtle backdrop - no blur, allows scroll on document */}
      <div
        data-comment-ui
        className="fixed inset-0 z-40 animate-backdrop pointer-events-none"
        style={{
          background: 'rgba(0, 0, 0, 0.05)'
        }}
      />

      {/* Compact slide-in drawer */}
      <div
        data-comment-ui
        className="fixed top-0 right-0 h-full z-50 animate-slide-in-right flex flex-col"
        style={{
          width: 'min(400px, 90vw)',
          background: 'var(--color-surface)',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        {/* Compact Header */}
        <div
          className="px-5 py-3 border-b flex items-center justify-between flex-shrink-0"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center gap-2">
            <svg
              width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="var(--color-accent)" strokeWidth="2"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <h2
              className="font-semibold"
              style={{ color: 'var(--color-ink)', fontFamily: 'var(--font-sans)' }}
            >
              Add Comment
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-md flex items-center justify-center btn-ghost"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-muted)" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content - flexbox for proper distribution */}
        <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
          {/* Selected Text - compact */}
          <div className="flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-xs font-medium uppercase tracking-wide"
                style={{ color: 'var(--color-ink-faded)' }}
              >
                Selected
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: 'var(--color-paper-dark)', color: 'var(--color-ink-faded)' }}
              >
                {selectedText.length} chars
              </span>
            </div>
            <div
              className="p-3 rounded-lg max-h-24 overflow-y-auto text-sm"
              style={{
                background: 'var(--color-highlight)',
                border: '1px solid var(--color-border)',
                fontFamily: 'var(--font-serif)',
                color: 'var(--color-ink)',
                lineHeight: 1.5
              }}
            >
              &ldquo;{selectedText}&rdquo;
            </div>
          </div>

          {/* Comment Input - takes remaining space */}
          <div className="flex-1 flex flex-col min-h-0 relative">
            <span
              className="text-xs font-medium uppercase tracking-wide mb-2"
              style={{ color: 'var(--color-ink-faded)' }}
            >
              Instruction for Claude
            </span>
            <div className="flex-1 relative min-h-0">
              <textarea
                ref={textareaRef}
                autoFocus
                value={localComment}
                onChange={handleChange}
                placeholder="What should Claude do with this text?

Examples:
• Make this more concise
• Add a date reference
• Rephrase for clarity
• Fix formatting

Type @ to reference docs or MCP tools"
                className="w-full h-full p-3 text-sm rounded-lg transition-all resize-none focus:outline-none"
                style={{
                  border: '2px solid var(--color-border)',
                  fontFamily: 'var(--font-sans)',
                  color: 'var(--color-ink)',
                  lineHeight: 1.6,
                  minHeight: '120px',
                  background: 'var(--color-surface)'
                }}
                onKeyDown={handleKeyDown}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-accent)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-accent-light)';
                }}
                onBlur={(e) => {
                  // Don't close mentions on blur if clicking dropdown
                  const related = e.relatedTarget as HTMLElement;
                  if (related?.closest('[data-mention-dropdown]')) return;
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />

              {/* Mention Autocomplete Dropdown */}
              {showMentions && mentionItems.length > 0 && (
                <div
                  ref={dropdownRef}
                  data-mention-dropdown
                  className="absolute left-2 right-2 max-h-48 overflow-y-auto rounded-lg z-10"
                  style={{
                    bottom: '100%',
                    marginBottom: '4px',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    boxShadow: 'var(--shadow-lg)',
                  }}
                >
                  {mentionItems.map((item, i) => (
                    <button
                      key={`${item.type}-${item.name}`}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors"
                      style={{
                        background: i === mentionIndex ? 'var(--color-accent-subtle)' : 'transparent',
                        color: 'var(--color-ink)',
                        fontFamily: 'var(--font-sans)',
                        borderBottom: i < mentionItems.length - 1 ? '1px solid var(--color-border)' : 'none',
                      }}
                      onMouseEnter={() => setMentionIndex(i)}
                      onMouseDown={(e) => {
                        e.preventDefault(); // Prevent textarea blur
                        insertMention(item);
                      }}
                    >
                      {/* Icon */}
                      {item.type === 'doc' ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-muted)" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-muted)" strokeWidth="2">
                          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                        </svg>
                      )}
                      <span className="truncate">
                        {item.type === 'mcp' ? `mcp:${item.name}` : item.name}
                      </span>
                      <span
                        className="ml-auto text-xs px-1.5 py-0.5 rounded"
                        style={{ background: 'var(--color-paper-dark)', color: 'var(--color-ink-faded)' }}
                      >
                        {item.type === 'doc' ? 'doc' : 'mcp'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Compact Footer */}
        <div
          className="px-4 py-3 border-t flex-shrink-0 flex items-center justify-between"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-paper)' }}
        >
          <span className="text-xs" style={{ color: 'var(--color-ink-faded)' }}>
            <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--color-paper-dark)', border: '1px solid var(--color-border)' }}>&#8984;&#8629;</kbd>
            {' '}to add
          </span>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-sm rounded-md btn-ghost"
              style={{ color: 'var(--color-ink-muted)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!localComment.trim()}
              className="px-4 py-1.5 text-sm rounded-md font-medium transition-all disabled:opacity-40"
              style={{
                background: localComment.trim() ? 'var(--color-accent)' : 'var(--color-border)',
                color: localComment.trim() ? 'var(--color-vim-insert-fg)' : 'var(--color-ink-faded)'
              }}
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
