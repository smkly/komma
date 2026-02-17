'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAtMentions } from '../hooks/useAtMentions';
import MentionDropdown from './MentionDropdown';

interface CommentDrawerProps {
  show: boolean;
  selectedText: string;
  newComment: string;
  setNewComment: (value: string) => void;
  onSubmit: (commentText: string, refs?: { docs: string[]; mcps: string[]; vault?: boolean; architecture?: boolean }) => void;
  onCancel: () => void;
  currentDir?: string;
  vaultRoot?: string | null;
}

export default function CommentDrawer({
  show,
  selectedText,
  newComment,
  setNewComment,
  onSubmit,
  onCancel,
  currentDir,
  vaultRoot,
}: CommentDrawerProps) {
  const [localComment, setLocalComment] = useState(newComment);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mentions = useAtMentions({ currentDir, vaultRoot });

  // Reset local state when drawer opens
  useEffect(() => {
    if (show) {
      setLocalComment(newComment);
      mentions.reset();
    }
  }, [show]);

  // Fetch available mention items when drawer opens
  useEffect(() => {
    if (!show) return;
    mentions.fetchItems();
  }, [show, currentDir, vaultRoot]);

  const insertMentionIntoTextarea = useCallback((item: typeof mentions.mentionItems[0]) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const { newText, cursorPos } = mentions.insertMention(localComment, item);
    setLocalComment(newText);

    // Restore focus and cursor position
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursorPos, cursorPos);
    });
  }, [localComment, mentions]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart;
    setLocalComment(val);
    mentions.handleTextChange(val, cursorPos);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Check mention dropdown first
    const handled = mentions.handleMentionKeyDown(e);
    if (handled) {
      // If Enter or Tab was pressed and we have a selected item, insert it
      if ((e.key === 'Enter' || e.key === 'Tab') && mentions.selectedItem) {
        insertMentionIntoTextarea(mentions.selectedItem);
      }
      return;
    }

    if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      handleSubmit();
    }
    if (e.key === 'Escape' && !mentions.showMentions) {
      onCancel();
    }
  };

  const handleSubmit = () => {
    if (!localComment.trim()) return;
    const refs = mentions.parseRefs(localComment);
    onSubmit(localComment, refs);
    setLocalComment('');
  };

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
              <MentionDropdown
                show={mentions.showMentions}
                items={mentions.mentionItems}
                selectedIndex={mentions.mentionIndex}
                onSelect={insertMentionIntoTextarea}
                onHover={mentions.setMentionIndex}
                position="above"
              />
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
