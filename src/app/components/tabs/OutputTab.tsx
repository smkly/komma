'use client';

import { ChangelogEntry } from '../../types';

interface OutputTabProps {
  claudeOutput: string;
  streamOutput: string;
  setStreamOutput: (output: string) => void;
  isStreaming: boolean;
  isSending: boolean;
  showLastOutput: boolean;
  setShowLastOutput: (show: boolean) => void;
  streamRef: React.RefObject<HTMLDivElement | null>;
  loadLastOutput: () => void;
  changelogs: ChangelogEntry[];
  expandedEntryId: number | null;
  setExpandedEntryId: (id: number | null) => void;
  onClearChangelogs: () => void;
}

export default function OutputTab({
  claudeOutput,
  streamOutput,
  setStreamOutput,
  isStreaming,
  isSending,
  showLastOutput,
  setShowLastOutput,
  streamRef,
  loadLastOutput,
  changelogs,
  expandedEntryId,
  setExpandedEntryId,
  onClearChangelogs,
}: OutputTabProps) {
  return (
    <div className="space-y-4">
      {/* View Last Output button */}
      {!isStreaming && !showLastOutput && (
        <button
          onClick={loadLastOutput}
          className="w-full py-2 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all"
          style={{
            background: 'var(--color-accent-light)',
            color: 'var(--color-accent)',
            border: '1px solid var(--color-accent)'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          View Last Output
        </button>
      )}

      {/* Live Stream Viewer */}
      {(isStreaming || showLastOutput || streamOutput) && (
        <div className="animate-fade-in">
          <div
            className="flex items-center justify-between mb-2"
          >
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
              {isStreaming ? 'Live Agent Output' : 'Last Agent Output'}
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
              maxHeight: '400px',
              minHeight: '150px',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}
          >
            {streamOutput || (
              <span style={{ color: 'var(--color-ink-faded)' }}>
                {isStreaming ? 'Waiting for agent output...' : 'No output available.'}
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

      {/* Current status */}
      {claudeOutput && (
        <div
          className="p-4 rounded-xl animate-slide-up"
          style={{
            background: claudeOutput.startsWith('Error') ? 'var(--color-highlight)' : isSending ? 'var(--color-highlight)' : 'var(--color-accent-subtle)',
            border: `1px solid ${claudeOutput.startsWith('Error') ? 'var(--color-danger)' : isSending ? 'var(--color-amber)' : 'var(--color-success)'}`
          }}
        >
          <div className="flex items-start gap-3">
            {claudeOutput.startsWith('Error') ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2" className="flex-shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            ) : isSending ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-amber)" strokeWidth="2" className="flex-shrink-0 mt-0.5 animate-spin">
                <circle cx="12" cy="12" r="10" opacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" className="flex-shrink-0 mt-0.5">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            )}
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-medium mb-1"
                style={{ color: claudeOutput.startsWith('Error') ? 'var(--color-danger)' : isSending ? 'var(--color-amber)' : 'var(--color-success)' }}
              >
                {claudeOutput.startsWith('Error') ? 'Error' : isSending ? 'Processing' : 'Success'}
              </p>
              <p
                className="text-sm break-words"
                style={{ color: 'var(--color-ink)', lineHeight: 1.6 }}
              >
                {claudeOutput.replace(/^Error:\s*/, '')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Changelog history */}
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

      {!claudeOutput && !streamOutput && changelogs.length === 0 && (
        <div className="text-sm text-center py-8" style={{ color: 'var(--color-ink-faded)' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3 opacity-50">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          <p>No changes for this file yet</p>
          <p className="text-xs mt-1">Add comments and send to Claude</p>
        </div>
      )}
    </div>
  );
}
