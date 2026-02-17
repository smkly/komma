'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { DiffChunk } from '../../lib/diff';

interface InlineDiffViewProps {
  chunks: DiffChunk[];
  onApproveChunk: (id: string) => void;
  onRejectChunk: (id: string) => void;
  onApproveAll: () => void;
  onRejectAll: () => void;
  onFinalize: () => void;
  stats: { added: number; removed: number; pending: number };
}

function ChunkView({
  chunk,
  onApprove,
  onReject,
}: {
  chunk: DiffChunk;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [hovering, setHovering] = useState(false);

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
      {/* Hover action buttons */}
      {hovering && (
        <div
          className="absolute flex gap-1"
          style={{
            top: '4px',
            right: '0px',
            zIndex: 10,
          }}
        >
          <button
            onClick={onApprove}
            className="text-xs px-2 py-1 rounded-md font-medium transition-all"
            style={{
              background: 'var(--color-success)',
              color: '#fff',
              boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
            }}
          >
            Accept
          </button>
          <button
            onClick={onReject}
            className="text-xs px-2 py-1 rounded-md font-medium transition-all"
            style={{
              background: 'var(--color-danger)',
              color: '#fff',
              boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
            }}
          >
            Reject
          </button>
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
  stats,
}: InlineDiffViewProps) {
  const hasChanges = chunks.some(c => c.type !== 'unchanged');
  if (!hasChanges) return null;

  const hasPending = chunks.some(c => c.type === 'modification' && c.status === 'pending');
  const allDecided = !hasPending;

  return (
    <div>
      {/* Sticky review banner */}
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
            <span style={{ color: 'var(--color-success)' }}>+{stats.added}</span>
            {' / '}
            <span style={{ color: 'var(--color-danger)' }}>-{stats.removed}</span>
            {' lines'}
            {stats.pending > 0 && (
              <>
                {' \u00b7 '}
                <span style={{ color: 'var(--color-amber)' }}>{stats.pending} pending</span>
              </>
            )}
          </span>
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

      {/* Rendered diff as annotated prose */}
      <div className="prose prose-editorial max-w-none">
        {chunks.map((chunk) => (
          <ChunkView
            key={chunk.id}
            chunk={chunk}
            onApprove={() => onApproveChunk(chunk.id)}
            onReject={() => onRejectChunk(chunk.id)}
          />
        ))}
      </div>
    </div>
  );
}
