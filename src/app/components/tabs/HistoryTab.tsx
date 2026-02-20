'use client';

interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  date: string;
  author: string;
}

interface HistoryTabProps {
  commits: GitCommit[];
  isLoading: boolean;
  selectedCommit: GitCommit | null;
  onSelectCommit: (commit: GitCommit) => void;
  onBack: () => void;
  isElectron: boolean;
  isDiffLoading: boolean;
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function commitIcon(message: string) {
  if (message.startsWith('Applied edit')) return 'pencil';
  if (message.startsWith('Checkpoint')) return 'checkpoint';
  if (message.startsWith('Manual save')) return 'save';
  return 'commit';
}

export default function HistoryTab({
  commits,
  isLoading,
  selectedCommit,
  onSelectCommit,
  onBack,
  isElectron,
  isDiffLoading,
}: HistoryTabProps) {
  if (!isElectron) {
    return (
      <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--color-ink-faded)', fontSize: '13px' }}>
        Git history requires the desktop app
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center" style={{ color: 'var(--color-ink-faded)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
          <circle cx="12" cy="12" r="10" opacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
        <span className="text-sm">Loading history...</span>
      </div>
    );
  }

  // When a commit is selected, show info + back button in sidebar
  if (selectedCommit) {
    return (
      <div>
        <button
          onClick={onBack}
          className="text-xs px-2 py-1 rounded transition-colors mb-3"
          style={{
            color: 'var(--color-ink-faded)',
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            cursor: 'pointer',
          }}
        >
          &larr; All commits
        </button>

        {/* Selected commit highlighted */}
        <div
          className="px-2 py-2 rounded-md mb-3"
          style={{
            background: 'var(--color-accent-subtle)',
            border: '1px solid var(--color-accent)',
          }}
        >
          <div className="text-xs font-medium" style={{ color: 'var(--color-ink)' }}>
            {selectedCommit.message}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--color-ink-faded)' }}>
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '10px' }}>{selectedCommit.shortHash}</span>
            {' \u00b7 '}
            {formatRelativeDate(selectedCommit.date)}
            {' \u00b7 '}
            {selectedCommit.author}
          </div>
        </div>

        {isDiffLoading && (
          <div className="flex items-center gap-2 py-4 justify-center" style={{ color: 'var(--color-ink-faded)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
              <circle cx="12" cy="12" r="10" opacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
            <span className="text-xs">Loading diff...</span>
          </div>
        )}

        {/* Rest of commits dimmed */}
        <div style={{ opacity: 0.5 }}>
          <div className="text-xs mb-1" style={{ color: 'var(--color-ink-faded)' }}>Other commits</div>
          {commits.filter(c => c.hash !== selectedCommit.hash).map((commit) => (
            <button
              key={commit.hash}
              onClick={() => onSelectCommit(commit)}
              className="w-full text-left px-2 py-1.5 rounded-md transition-colors"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = ''; }}
            >
              <div className="text-xs truncate" style={{ color: 'var(--color-ink)' }}>{commit.message}</div>
              <div className="text-xs" style={{ color: 'var(--color-ink-faded)', fontSize: '10px' }}>
                {commit.shortHash} &middot; {formatRelativeDate(commit.date)}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Commit list
  if (commits.length === 0) {
    return (
      <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--color-ink-faded)', fontSize: '13px' }}>
        No history available
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {commits.map((commit) => {
        const icon = commitIcon(commit.message);
        return (
          <button
            key={commit.hash}
            onClick={() => onSelectCommit(commit)}
            className="w-full text-left px-2 py-2 rounded-md transition-colors"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-raised)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <div className="flex items-start gap-2">
              <div
                className="flex-shrink-0 mt-0.5"
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: icon === 'pencil' ? 'var(--color-accent-subtle)' :
                    icon === 'checkpoint' ? 'rgba(234, 179, 8, 0.15)' :
                    icon === 'save' ? 'rgba(34, 197, 94, 0.15)' :
                    'var(--color-surface-raised)',
                  color: icon === 'pencil' ? 'var(--color-accent)' :
                    icon === 'checkpoint' ? 'var(--color-amber)' :
                    icon === 'save' ? 'var(--color-success)' :
                    'var(--color-ink-faded)',
                }}
              >
                {icon === 'pencil' ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                ) : icon === 'checkpoint' ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 2v20M2 12h20" />
                  </svg>
                ) : icon === 'save' ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                  </svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="4" />
                  </svg>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="text-xs font-medium truncate"
                  style={{ color: 'var(--color-ink)', lineHeight: '1.4' }}
                >
                  {commit.message}
                </div>
                <div className="text-xs" style={{ color: 'var(--color-ink-faded)', marginTop: '1px' }}>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '10px' }}>{commit.shortHash}</span>
                  {' \u00b7 '}
                  {formatRelativeDate(commit.date)}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
