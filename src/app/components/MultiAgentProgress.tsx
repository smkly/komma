'use client';

import { useState, useEffect } from 'react';

interface SectionStatus {
  title: string;
  status: 'pending' | 'streaming' | 'complete' | 'error';
  output: string;
}

interface MultiAgentProgressProps {
  sections: SectionStatus[];
  onCancel: () => void;
  onCombine: () => void;
}

export default function MultiAgentProgress({ sections, onCancel, onCombine }: MultiAgentProgressProps) {
  const allComplete = sections.every(s => s.status === 'complete' || s.status === 'error');
  const anyStreaming = sections.some(s => s.status === 'streaming');
  const completedCount = sections.filter(s => s.status === 'complete').length;
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <div className="flex flex-col items-center gap-6 py-10 px-8">
      <div className="text-center mb-2">
        <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--color-ink)' }}>
          Generating Document
        </h2>
        <p className="text-sm" style={{ color: 'var(--color-ink-faded)' }}>
          {allComplete
            ? `All ${sections.length} sections complete`
            : `${completedCount} of ${sections.length} sections complete`}
        </p>
      </div>

      {/* Progress bar */}
      <div
        className="w-full max-w-md h-2 rounded-full overflow-hidden"
        style={{ background: 'var(--color-paper-dark)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${(completedCount / sections.length) * 100}%`,
            background: 'var(--color-accent)',
          }}
        />
      </div>

      {/* Section list */}
      <div className="w-full max-w-lg space-y-2">
        {sections.map((section, i) => (
          <div
            key={i}
            className="rounded-lg transition-all cursor-pointer"
            style={{
              background: 'var(--color-surface)',
              border: expandedIndex === i ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
            }}
            onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
          >
            <div className="flex items-center gap-3 px-4 py-3">
              {/* Status icon */}
              {section.status === 'pending' && (
                <div className="w-4 h-4 rounded-full" style={{ background: 'var(--color-border)' }} />
              )}
              {section.status === 'streaming' && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" className="animate-spin">
                  <circle cx="12" cy="12" r="10" opacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
              )}
              {section.status === 'complete' && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              {section.status === 'error' && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              )}

              <span className="text-sm font-medium flex-1" style={{ color: 'var(--color-ink)' }}>
                {section.title}
              </span>

              <span className="text-xs" style={{ color: 'var(--color-ink-faded)' }}>
                {section.status === 'streaming' ? 'Writing...' : section.status}
              </span>

              <svg
                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-faded)" strokeWidth="2"
                style={{ transform: expandedIndex === i ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>

            {/* Expanded preview */}
            {expandedIndex === i && section.output && (
              <div
                className="px-4 pb-3 pt-2 border-t"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <div
                  className="rounded-lg p-3 font-mono text-xs overflow-y-auto"
                  style={{
                    background: 'var(--color-paper-dark)',
                    color: 'var(--color-ink)',
                    maxHeight: '200px',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {section.output.substring(0, 500)}{section.output.length > 500 ? '...' : ''}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        {!allComplete && (
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              color: 'var(--color-danger)',
              border: '1px solid var(--color-danger)',
              background: 'transparent',
            }}
          >
            Cancel All
          </button>
        )}
        {allComplete && (
          <button
            onClick={onCombine}
            className="px-6 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              color: '#fff',
              background: 'var(--color-accent)',
              border: '1px solid var(--color-accent)',
            }}
          >
            Combine &amp; Save
          </button>
        )}
      </div>
    </div>
  );
}
