'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { DiffChunk } from '../../lib/diff';

interface InlineDiffViewProps {
  chunks: DiffChunk[];
  onApproveChunk?: (id: string) => void;
  onRejectChunk?: (id: string) => void;
  onApproveAll?: () => void;
  onRejectAll?: () => void;
  onFinalize?: () => void;
  onReviseChunk?: (chunkId: string, instruction: string) => void;
  stats?: { added: number; removed: number; pending: number };
  readOnly?: boolean;
}

function ChunkView({
  chunk,
  onApprove,
  onReject,
  onRevise,
  readOnly,
}: {
  chunk: DiffChunk;
  onApprove: () => void;
  onReject: () => void;
  onRevise?: (instruction: string) => void;
  readOnly?: boolean;
}) {
  const [hovering, setHovering] = useState(false);
  const [showThread, setShowThread] = useState(false);
  const [reviseInput, setReviseInput] = useState('');

  if (chunk.type === 'unchanged') {
    const text = chunk.beforeLines.join('\n');
    if (!text.trim()) return null;
    return (
      <div className="diff-unchanged">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    );
  }

  // Modification chunk
  if (chunk.status === 'approved') {
    // Show only the new version with a subtle green indicator
    const text = chunk.afterLines.join('\n');
    return (
      <div
        data-chunk-id={chunk.id}
        data-chunk-type="modification"
        style={{
          borderLeft: '3px solid var(--color-success)',
          paddingLeft: '16px',
          marginLeft: '-19px',
          background: 'rgba(34, 197, 94, 0.04)',
        }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    );
  }

  if (chunk.status === 'rejected') {
    // Show only the original version with a subtle red indicator
    const text = chunk.beforeLines.join('\n');
    return (
      <div
        data-chunk-id={chunk.id}
        data-chunk-type="modification"
        style={{
          borderLeft: '3px solid var(--color-danger)',
          paddingLeft: '16px',
          marginLeft: '-19px',
          background: 'rgba(239, 68, 68, 0.04)',
        }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    );
  }

  // Pending -- show both old and new with approve/reject controls
  const removedText = chunk.beforeLines.join('\n');
  const addedText = chunk.afterLines.join('\n');

  return (
    <div
      className="relative"
      data-chunk-id={chunk.id}
      data-chunk-type="modification"
      style={{
        borderLeft: '3px solid var(--color-amber)',
        paddingLeft: '16px',
        marginLeft: '-19px',
        marginTop: '4px',
        marginBottom: '4px',
      }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Removed content */}
      {removedText.trim() && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            textDecoration: 'line-through',
            opacity: 0.6,
            borderRadius: '4px',
            padding: '2px 4px',
          }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{removedText}</ReactMarkdown>
        </div>
      )}
      {/* Added content */}
      {addedText.trim() && (
        <div
          style={{
            background: 'rgba(34, 197, 94, 0.08)',
            borderRadius: '4px',
            padding: '2px 4px',
          }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{addedText}</ReactMarkdown>
        </div>
      )}
      {/* Always-visible action buttons for pending chunks */}
      {!readOnly && (
      <div
        className="flex gap-1.5 items-center"
        style={{
          marginTop: '8px',
          paddingTop: '6px',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); console.log('[InlineDiffView] Accept clicked for chunk:', chunk.id); onApprove(); }}
          className="text-xs px-3 py-1 rounded-md font-medium transition-all"
          style={{
            background: 'var(--color-success)',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Accept
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); console.log('[InlineDiffView] Reject clicked for chunk:', chunk.id); onReject(); }}
          className="text-xs px-3 py-1 rounded-md font-medium transition-all"
          style={{
            background: 'var(--color-danger)',
            color: '#fff',
          }}
        >
          Reject
        </button>
        {onRevise && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowThread(prev => !prev); }}
            className="text-xs px-3 py-1 rounded-md font-medium transition-all"
            style={{
              background: 'transparent',
              color: 'var(--color-ink-faded)',
              border: '1px solid var(--color-border)',
            }}
          >
            Discuss
          </button>
        )}
      </div>
      )}

      {/* Mini-thread for discussion / revision */}
      {showThread && !readOnly && (
        <div
          style={{
            marginTop: '8px',
            padding: '8px 12px',
            background: 'var(--color-surface-raised)',
            borderRadius: '6px',
            border: '1px solid var(--color-border)',
            fontSize: '13px',
          }}
        >
          {/* Thread messages */}
          {chunk.thread && chunk.thread.length > 0 && (
            <div style={{ marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {chunk.thread.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    background: msg.role === 'user' ? 'var(--color-accent-subtle)' : 'transparent',
                    borderLeft: msg.role === 'assistant' ? '2px solid var(--color-border)' : 'none',
                    color: 'var(--color-ink)',
                    fontSize: '12px',
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '11px', opacity: 0.6 }}>
                    {msg.role === 'user' ? 'You' : 'Claude'}:
                  </span>{' '}
                  {msg.content}
                </div>
              ))}
            </div>
          )}

          {/* Revise input */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              type="text"
              value={reviseInput}
              onChange={(e) => setReviseInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && reviseInput.trim() && onRevise && !chunk.isRevising) {
                  e.stopPropagation();
                  onRevise(reviseInput.trim());
                  setReviseInput('');
                }
                e.stopPropagation(); // prevent vim keys
              }}
              placeholder="Describe how to revise this change..."
              disabled={chunk.isRevising}
              style={{
                flex: 1,
                padding: '6px 10px',
                fontSize: '12px',
                borderRadius: '4px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-paper)',
                color: 'var(--color-ink)',
                outline: 'none',
              }}
            />
            <button
              onClick={() => {
                if (reviseInput.trim() && onRevise && !chunk.isRevising) {
                  onRevise(reviseInput.trim());
                  setReviseInput('');
                }
              }}
              disabled={!reviseInput.trim() || chunk.isRevising}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 500,
                borderRadius: '4px',
                border: 'none',
                background: chunk.isRevising ? 'var(--color-border)' : 'var(--color-accent)',
                color: '#fff',
                cursor: chunk.isRevising ? 'wait' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {chunk.isRevising ? 'Revising...' : 'Revise'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InlineDiffView({
  chunks,
  onApproveChunk,
  onRejectChunk,
  onApproveAll,
  onRejectAll,
  onFinalize,
  onReviseChunk,
  stats,
  readOnly,
}: InlineDiffViewProps) {
  const hasChanges = chunks.some(c => c.type !== 'unchanged');
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentChangeIdx, setCurrentChangeIdx] = useState(0);
  const modificationIds = chunks.filter(c => c.type === 'modification').map(c => c.id);

  // Auto-scroll to first change on mount
  const hasScrolledRef = useRef(false);
  useEffect(() => {
    if (!hasChanges || hasScrolledRef.current) return;
    hasScrolledRef.current = true;
    // Small delay to let DOM render
    requestAnimationFrame(() => {
      const firstChange = containerRef.current?.querySelector('[data-chunk-type="modification"]');
      if (firstChange) {
        firstChange.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }, [hasChanges]);

  const navigateToChange = useCallback((index: number) => {
    const id = modificationIds[index];
    if (!id) return;
    const el = containerRef.current?.querySelector(`[data-chunk-id="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setCurrentChangeIdx(index);
    }
  }, [modificationIds]);

  const goNext = useCallback(() => {
    const next = (currentChangeIdx + 1) % modificationIds.length;
    navigateToChange(next);
  }, [currentChangeIdx, modificationIds.length, navigateToChange]);

  const goPrev = useCallback(() => {
    const prev = (currentChangeIdx - 1 + modificationIds.length) % modificationIds.length;
    navigateToChange(prev);
  }, [currentChangeIdx, modificationIds.length, navigateToChange]);

  if (!hasChanges) return null;

  const hasPending = chunks.some(c => c.type === 'modification' && c.status === 'pending');
  const allDecided = !hasPending;

  return (
    <div ref={containerRef}>
      {/* Sticky review banner — hidden in readOnly mode */}
      {!readOnly && (
      <div
        className="sticky top-0 z-20 flex items-center justify-between px-6 py-3 mb-6 rounded-lg"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium" style={{ color: 'var(--color-ink)' }}>
            Review Changes
          </span>
          <span className="text-xs" style={{ color: 'var(--color-ink-faded)' }}>
            <span style={{ color: 'var(--color-success)' }}>+{stats?.added ?? 0}</span>
            {' / '}
            <span style={{ color: 'var(--color-danger)' }}>-{stats?.removed ?? 0}</span>
            {' lines'}
            {(stats?.pending ?? 0) > 0 && (
              <>
                {' \u00b7 '}
                <span style={{ color: 'var(--color-amber)' }}>{stats!.pending} pending</span>
              </>
            )}
          </span>
          {/* Prev/Next change navigation */}
          {modificationIds.length > 1 && (
            <div className="flex items-center gap-1" style={{ marginLeft: '4px' }}>
              <button
                onClick={goPrev}
                className="text-xs px-1.5 py-0.5 rounded transition-colors"
                style={{ color: 'var(--color-ink-faded)', background: 'var(--color-surface-raised)' }}
                title="Previous change"
              >
                &#x25B2;
              </button>
              <span className="text-xs" style={{ color: 'var(--color-ink-faded)', minWidth: '40px', textAlign: 'center' }}>
                {currentChangeIdx + 1}/{modificationIds.length}
              </span>
              <button
                onClick={goNext}
                className="text-xs px-1.5 py-0.5 rounded transition-colors"
                style={{ color: 'var(--color-ink-faded)', background: 'var(--color-surface-raised)' }}
                title="Next change"
              >
                &#x25BC;
              </button>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {hasPending && (
            <>
              <button
                onClick={onRejectAll}
                className="text-xs px-3 py-1.5 rounded-md font-medium transition-all"
                style={{
                  color: 'var(--color-danger)',
                  border: '1px solid var(--color-danger)',
                  background: 'transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--color-danger)';
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--color-danger)';
                }}
              >
                Reject All
              </button>
              <button
                onClick={onApproveAll}
                className="text-xs px-3 py-1.5 rounded-md font-medium transition-all"
                style={{
                  color: '#fff',
                  background: 'var(--color-success)',
                  border: '1px solid var(--color-success)',
                }}
              >
                Accept All
              </button>
            </>
          )}
          {allDecided && (
            <button
              onClick={onFinalize}
              className="text-xs px-4 py-1.5 rounded-md font-medium transition-all"
              style={{
                color: '#fff',
                background: 'var(--color-accent)',
                border: '1px solid var(--color-accent)',
              }}
            >
              Apply &amp; Save
            </button>
          )}
        </div>
      </div>
      )}

      {/* Rendered diff as annotated prose */}
      <div className="prose prose-editorial max-w-none">
        {chunks.map((chunk) => (
          <ChunkView
            key={chunk.id}
            chunk={chunk}
            onApprove={() => onApproveChunk?.(chunk.id)}
            onReject={() => onRejectChunk?.(chunk.id)}
            onRevise={onReviseChunk ? (instruction) => onReviseChunk(chunk.id, instruction) : undefined}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  );
}
