'use client';

import { useState, useEffect, useRef } from 'react';
import { Comment, ChangelogEntry } from '../../types';

interface EditsTabProps {
  // From CommentsTab
  comments: Comment[];
  isSending: boolean;
  selectedText: string;
  savedSelectionRef: React.MutableRefObject<{ text: string; range: Range | null }>;
  setSelectedText: (text: string) => void;
  setShowCommentInput: (show: boolean) => void;
  setShowMiniTooltip: (show: boolean) => void;
  setTooltipPosition: (pos: { x: number; y: number }) => void;
  sendToClaude: () => void;
  cancelEdit: () => void;
  removeComment: (id: number) => void;
  approveComment: (id: number) => void;
  onReviseComment: (comment: Comment) => void;
  model: string;
  setModel: (model: string) => void;
  hasChanges: boolean;
  // From OutputTab
  claudeOutput: string;
  streamOutput: string;
  setStreamOutput: (output: string) => void;
  isStreaming: boolean;
  showLastOutput: boolean;
  setShowLastOutput: (show: boolean) => void;
  streamRef: React.RefObject<HTMLDivElement | null>;
  loadLastOutput: () => void;
  changelogs: ChangelogEntry[];
  expandedEntryId: number | null;
  setExpandedEntryId: (id: number | null) => void;
  onClearChangelogs: () => void;
}

export default function EditsTab({
  comments,
  isSending,
  selectedText,
  savedSelectionRef,
  setSelectedText,
  setShowCommentInput,
  setShowMiniTooltip,
  setTooltipPosition,
  sendToClaude,
  cancelEdit,
  removeComment,
  approveComment,
  onReviseComment,
  model,
  setModel,
  hasChanges,
  claudeOutput,
  streamOutput,
  setStreamOutput,
  isStreaming,
  showLastOutput,
  setShowLastOutput,
  streamRef,
  loadLastOutput,
  changelogs,
  expandedEntryId,
  setExpandedEntryId,
  onClearChangelogs,
}: EditsTabProps) {
  const pendingComments = comments.filter(c => c.status === 'pending');
  const appliedComments = comments.filter(c => c.status === 'applied');

  // Auto-dismiss success status after 3 seconds
  const [dismissedOutput, setDismissedOutput] = useState<string | null>(null);
  const prevSendingRef = useRef(isSending);

  useEffect(() => {
    // When isSending transitions from true to false and there's a success output, auto-dismiss
    if (prevSendingRef.current && !isSending && claudeOutput && !claudeOutput.startsWith('Error')) {
      const timer = setTimeout(() => {
        setDismissedOutput(claudeOutput);
      }, 3000);
      return () => clearTimeout(timer);
    }
    prevSendingRef.current = isSending;
  }, [isSending, claudeOutput]);

  // Reset dismissed when new output arrives
  useEffect(() => {
    if (claudeOutput !== dismissedOutput) {
      setDismissedOutput(null);
    }
  }, [claudeOutput]);

  const showStatus = claudeOutput && claudeOutput !== dismissedOutput;

  return (
    <div className="space-y-4">
      {/* 1. Applied changes review (from CommentsTab) */}
      {appliedComments.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-success)' }}>
              Review Changes
            </span>
            <button
              onClick={() => appliedComments.forEach(c => approveComment(c.id))}
              className="text-xs px-2 py-1 rounded-md font-medium transition-all"
              style={{ background: 'var(--color-paper)', color: 'var(--color-success)', border: '1px solid var(--color-success)' }}
            >
              Approve All
            </button>
          </div>
          <div className="space-y-2">
            {appliedComments.map((comment) => (
              <div
                key={comment.id}
                className="p-3 rounded-lg"
                style={{ background: 'var(--color-accent-subtle)', border: '1px solid var(--color-border)' }}
              >
                <div
                  className="text-xs mb-1.5 truncate px-2 py-0.5 rounded"
                  style={{ background: 'var(--color-accent-light)', color: 'var(--color-success)', fontFamily: 'var(--font-serif)' }}
                  title={comment.selectedText}
                >
                  &ldquo;{comment.lineHint}&rdquo;
                </div>
                <p className="text-xs mb-2" style={{ color: 'var(--color-ink)' }}>
                  {comment.comment}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => approveComment(comment.id)}
                    className="text-xs px-2 py-1 rounded font-medium transition-colors"
                    style={{ background: 'var(--color-success)', color: 'var(--color-surface)' }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => onReviseComment(comment)}
                    className="text-xs px-2 py-1 rounded font-medium transition-colors"
                    style={{ background: 'var(--color-paper-dark)', color: 'var(--color-ink)' }}
                  >
                    Revise
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Add Comment button + Send button */}
      <div className="space-y-2">
        <button
          onMouseDown={(e) => {
            const selection = window.getSelection();
            const text = selection?.toString().trim();
            if (text && text.length >= 1) {
              try {
                const range = selection?.getRangeAt(0);
                if (range) {
                  savedSelectionRef.current = { text, range: range.cloneRange() };
                }
              } catch (err) {
                // Selection might be invalid
              }
            }
          }}
          onClick={() => {
            const savedText = savedSelectionRef.current.text;
            if (savedText && savedText.length >= 1) {
              setSelectedText(savedText);
              setShowCommentInput(true);
              setShowMiniTooltip(false);
              setTooltipPosition({
                x: window.innerWidth / 2,
                y: 200
              });
            } else {
              alert('Please highlight some text in the document first');
            }
          }}
          className="w-full py-2 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all"
          style={{
            background: 'var(--color-accent-light)',
            color: 'var(--color-accent)',
            border: '1px solid var(--color-accent)'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <line x1="12" y1="8" x2="12" y2="14" />
            <line x1="9" y1="11" x2="15" y2="11" />
          </svg>
          Add Comment to Selection
        </button>

        {pendingComments.length > 0 && (
          <div className="flex items-center gap-2">
            {isSending ? (
              <button
                onClick={cancelEdit}
                className="flex-1 text-sm py-2 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all"
                style={{
                  background: 'var(--color-danger)',
                  color: '#fff',
                  border: '1px solid var(--color-danger)',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
                Stop
              </button>
            ) : (
              <button
                onClick={sendToClaude}
                disabled={isSending}
                className="flex-1 btn btn-primary text-sm justify-center"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                Send
              </button>
            )}
            <div className="relative">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="appearance-none text-xs font-medium pl-2 pr-5 py-1.5 rounded-md cursor-pointer outline-none"
                style={{
                  background: 'var(--color-paper-dark)',
                  color: 'var(--color-ink-faded)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <option value="haiku">Haiku</option>
                <option value="sonnet">Sonnet</option>
                <option value="opus">Opus</option>
              </select>
              <svg
                width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--color-ink-faded)' }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
        )}

        {/* Model selector when no pending comments */}
        {pendingComments.length === 0 && (
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--color-ink-faded)' }}>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <div className="relative">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="appearance-none text-xs pl-1 pr-4 py-0.5 rounded cursor-pointer outline-none"
                style={{
                  background: 'transparent',
                  color: 'var(--color-ink-faded)',
                  border: 'none',
                }}
              >
                <option value="haiku">Haiku</option>
                <option value="sonnet">Sonnet</option>
                <option value="opus">Opus</option>
              </select>
              <svg
                width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--color-ink-faded)' }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* 3. Pending comments list */}
      {pendingComments.length > 0 && (
        <div className="space-y-3">
          <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-ink-faded)' }}>
            Pending Comments
          </span>
          {pendingComments.map((comment, index) => (
            <div
              key={comment.id}
              className="card p-4 transition-all hover:shadow-md animate-slide-up"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div
                className="text-xs mb-2 truncate px-2 py-1 rounded"
                style={{
                  background: 'var(--color-highlight)',
                  color: 'var(--color-ink)',
                  fontFamily: 'var(--font-serif)'
                }}
                title={comment.selectedText}
              >
                &ldquo;{comment.lineHint}&rdquo;
              </div>
              <p
                className="text-sm mb-3"
                style={{ color: 'var(--color-ink)', lineHeight: 1.6 }}
              >
                {comment.comment}
              </p>
              <button
                onClick={() => removeComment(comment.id)}
                className="text-xs flex items-center gap-1 transition-colors"
                style={{ color: 'var(--color-ink-faded)' }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-danger)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-ink-faded)'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 5. Status indicator — compact inline bar, only when processing or error */}
      {showStatus && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs animate-slide-up"
          style={{
            background: claudeOutput.startsWith('Error')
              ? 'var(--color-highlight)'
              : isSending
              ? 'var(--color-highlight)'
              : 'var(--color-accent-subtle)',
            border: `1px solid ${
              claudeOutput.startsWith('Error')
                ? 'var(--color-danger)'
                : isSending
                ? 'var(--color-amber)'
                : 'var(--color-success)'
            }`,
          }}
        >
          {claudeOutput.startsWith('Error') ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2" className="flex-shrink-0">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          ) : isSending ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-amber)" strokeWidth="2" className="flex-shrink-0 animate-spin">
              <circle cx="12" cy="12" r="10" opacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" className="flex-shrink-0">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          <span
            className="truncate"
            style={{
              color: claudeOutput.startsWith('Error')
                ? 'var(--color-danger)'
                : isSending
                ? 'var(--color-amber)'
                : 'var(--color-success)',
            }}
          >
            {claudeOutput.startsWith('Error')
              ? claudeOutput.replace(/^Error:\s*/, '')
              : isSending
              ? 'Processing...'
              : 'Done'}
          </span>
        </div>
      )}

      {/* 6. Live output — only when streaming, collapsed when idle */}
      {(isStreaming || showLastOutput || streamOutput) && (
        <div className="animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-xs font-medium uppercase tracking-wide flex items-center gap-2"
              style={{ color: 'var(--color-ink-faded)' }}
            >
              {isStreaming && (
                <span
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ background: 'var(--color-success)' }}
                />
              )}
              {isStreaming ? 'Live Output' : 'Last Output'}
            </span>
            {!isStreaming && (streamOutput || showLastOutput) && (
              <button
                onClick={() => { setStreamOutput(''); setShowLastOutput(false); }}
                className="text-xs px-2 py-1 rounded btn-ghost"
                style={{ color: 'var(--color-ink-faded)' }}
              >
                Close
              </button>
            )}
          </div>
          <div
            ref={streamRef}
            className="rounded-lg p-3 font-mono text-xs overflow-y-auto"
            style={{
              background: 'var(--color-paper-dark)',
              color: 'var(--color-ink)',
              maxHeight: '200px',
              minHeight: '80px',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}
          >
            {streamOutput || (
              <span style={{ color: 'var(--color-ink-faded)' }}>
                {isStreaming ? 'Waiting for output...' : 'No output available.'}
              </span>
            )}
            {isStreaming && (
              <span
                className="inline-block w-2 h-4 ml-1 animate-pulse"
                style={{ background: 'var(--color-success)' }}
              />
            )}
          </div>
        </div>
      )}

      {/* View Last Output button — subtle, only when no stream visible */}
      {!isStreaming && !showLastOutput && !streamOutput && (
        <button
          onClick={loadLastOutput}
          className="w-full py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all"
          style={{
            background: 'transparent',
            color: 'var(--color-ink-faded)',
            border: '1px solid var(--color-border)'
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          View Last Output
        </button>
      )}

      {/* 7. Changelog (from OutputTab) */}
      {changelogs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: 'var(--color-ink-faded)' }}
            >
              Changelog
            </h3>
            <button
              onClick={onClearChangelogs}
              className="text-xs px-2 py-1 rounded hover:bg-red-50 transition-colors"
              style={{ color: 'var(--color-ink-faded)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-danger)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-ink-faded)'}
            >
              Clear
            </button>
          </div>
          <div className="space-y-2 mb-4">
            {changelogs.map((entry) => {
              const isExpanded = expandedEntryId === entry.id;
              const parsedComments = entry.comments_snapshot ? (() => { try { return JSON.parse(entry.comments_snapshot); } catch { return []; } })() : [];
              const editsCount = Array.isArray(parsedComments) ? parsedComments.length : 0;
              const timestamp = new Date(entry.created_at);
              return (
                <div
                  key={entry.id}
                  className="rounded-lg text-sm cursor-pointer transition-all"
                  style={{
                    background: 'var(--color-surface)',
                    border: isExpanded ? '2px solid var(--color-accent)' : '1px solid var(--color-border)'
                  }}
                  onClick={() => setExpandedEntryId(isExpanded ? null : entry.id)}
                >
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className="text-xs flex items-center gap-1.5"
                        style={{
                          color: entry.status === 'completed' ? 'var(--color-success)' : entry.status === 'error' ? 'var(--color-danger)' : 'var(--color-amber)'
                        }}
                      >
                        {entry.status === 'completed' ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : entry.status === 'error' ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                            <circle cx="12" cy="12" r="10" opacity="0.25" />
                            <path d="M12 2a10 10 0 0 1 10 10" />
                          </svg>
                        )}
                        {editsCount > 0 ? `${editsCount} edit${editsCount > 1 ? 's' : ''}` : entry.status}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs" style={{ color: 'var(--color-ink-faded)' }}>
                          {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <svg
                          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-faded)" strokeWidth="2"
                          style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </div>
                    {entry.summary && (
                      <p
                        className={isExpanded ? "text-xs" : "text-xs truncate"}
                        style={{ color: 'var(--color-ink)' }}
                      >
                        {entry.summary}
                      </p>
                    )}
                  </div>
                  {/* Expanded content */}
                  {isExpanded && (
                    <div
                      className="px-3 pb-3 pt-2 border-t"
                      style={{ borderColor: 'var(--color-border)' }}
                    >
                      {entry.stream_log ? (
                        <div
                          className="rounded-lg p-3 font-mono text-xs overflow-y-auto"
                          style={{
                            background: 'var(--color-paper-dark)',
                            color: 'var(--color-ink)',
                            maxHeight: '300px',
                            lineHeight: 1.5,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                          }}
                        >
                          {entry.stream_log}
                        </div>
                      ) : (
                        <p className="text-xs italic" style={{ color: 'var(--color-ink-faded)' }}>
                          No detailed output log available for this entry.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state — only when nothing is happening */}
      {!claudeOutput && !streamOutput && changelogs.length === 0 && pendingComments.length === 0 && appliedComments.length === 0 && (
        <div className="text-sm text-center py-6" style={{ color: 'var(--color-ink-faded)' }}>
          <p className="text-xs">Select text and add comments, then send to Claude</p>
        </div>
      )}
    </div>
  );
}
