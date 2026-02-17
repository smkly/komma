'use client';

interface HeaderProps {
  isEditMode: boolean;
  isSaving: boolean;
  loadDocument: () => void;
  saveDocument: () => void;
  toggleEditMode: () => void;
  setIsEditMode: (mode: boolean) => void;
  openFileBrowser: () => void;
  onNewDocument: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  shareStatus: 'idle' | 'sharing' | 'done' | 'error' | 'confirm';
  shareUrl: string | null;
  shareError: string | null;
  existingDocInfo: { url: string; title: string; updatedAt: string } | null;
  onShareToGoogleDocs: (action?: 'new' | 'update') => void;
  onOpenShareUrl: () => void;
  onDismissShare: () => void;
  onOpenSettings?: () => void;
  onPullChanges?: () => void;
  shareMessage?: string | null;
}

export default function Header({
  isEditMode,
  isSaving,
  loadDocument,
  saveDocument,
  toggleEditMode,
  setIsEditMode,
  openFileBrowser,
  onNewDocument,
  theme,
  onToggleTheme,
  shareStatus,
  shareUrl,
  shareError,
  existingDocInfo,
  onShareToGoogleDocs,
  onOpenShareUrl,
  onDismissShare,
  onOpenSettings,
  onPullChanges,
  shareMessage,
}: HeaderProps) {
  return (
    <header
      className="sticky top-0 z-10 backdrop-blur-xl"
      style={{
        background: 'color-mix(in srgb, var(--color-paper) 85%, transparent)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <div className="px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <img
              src={theme === 'dark' ? '/logo-dark.svg' : '/logo-light.svg'}
              alt="Helm"
              className="w-7 h-7 rounded-md"
            />
            <h1
              className="text-sm font-semibold tracking-tight"
              style={{ color: 'var(--color-ink)', fontFamily: 'var(--font-sans)' }}
            >
              Helm
            </h1>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onNewDocument}
              className="btn btn-ghost p-1.5"
              title="New document (&#8984;N)"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button
              onClick={openFileBrowser}
              className="btn btn-ghost p-1.5"
              title="Browse files (&#8984;P)"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Theme toggle */}
          <button
            onClick={onToggleTheme}
            className="btn btn-ghost p-1.5"
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            )}
          </button>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="btn btn-ghost p-1.5"
              title="Settings"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          )}
          <button
            onClick={() => onShareToGoogleDocs()}
            disabled={shareStatus === 'sharing' || shareStatus === 'confirm'}
            className="btn btn-ghost text-sm"
            title="Share to Google Docs"
          >
            {shareStatus === 'sharing' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                <circle cx="12" cy="12" r="10" opacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            )}
            {shareStatus === 'sharing' ? 'Sharing...' : 'Share'}
          </button>
          <button
            onClick={loadDocument}
            className="btn btn-ghost text-sm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Reload
          </button>
          {isEditMode ? (
            <>
              <button
                onClick={() => setIsEditMode(false)}
                className="btn btn-ghost text-sm"
              >
                Cancel
              </button>
              <button
                onClick={saveDocument}
                disabled={isSaving}
                className="btn btn-primary text-sm"
              >
                {isSaving ? (
                  <span className="animate-pulse-subtle">Saving</span>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                    Save
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              onClick={toggleEditMode}
              className="btn btn-secondary text-sm"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Share confirmation prompt */}
      {shareStatus === 'confirm' && existingDocInfo && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginTop: '8px',
            padding: '12px 16px',
            borderRadius: '8px',
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 100,
            background: 'var(--color-paper)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-ink)',
            whiteSpace: 'nowrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>Already shared — last updated {new Date(existingDocInfo.updatedAt).toLocaleDateString()}</span>
          </div>
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            <button
              onClick={onDismissShare}
              className="btn btn-ghost"
              style={{ fontSize: '12px', padding: '3px 10px' }}
            >
              Cancel
            </button>
            {onPullChanges && (
              <button
                onClick={onPullChanges}
                className="btn btn-ghost"
                style={{ fontSize: '12px', padding: '3px 10px' }}
              >
                Pull Changes
              </button>
            )}
            <button
              onClick={() => onShareToGoogleDocs('new')}
              className="btn btn-ghost"
              style={{ fontSize: '12px', padding: '3px 10px' }}
            >
              Create New
            </button>
            <button
              onClick={() => onShareToGoogleDocs('update')}
              className="btn btn-primary"
              style={{ fontSize: '12px', padding: '3px 10px' }}
            >
              Update Existing
            </button>
          </div>
        </div>
      )}

      {/* Share toast notification */}
      {(shareStatus === 'done' || shareStatus === 'error') && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginTop: '8px',
            padding: '10px 16px',
            borderRadius: '8px',
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 100,
            background: shareStatus === 'done' ? 'var(--color-success)' : 'var(--color-danger, #ef4444)',
            color: '#fff',
            whiteSpace: 'nowrap',
          }}
        >
          {shareStatus === 'done' ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{shareMessage || 'Shared to Google Docs'}</span>
              {shareUrl && (
                <button
                  onClick={onOpenShareUrl}
                  style={{
                    background: 'rgba(255,255,255,0.2)',
                    border: 'none',
                    color: '#fff',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  Open
                </button>
              )}
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <span>{shareError || 'Share failed'}</span>
            </>
          )}
          <button
            onClick={onDismissShare}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer',
              padding: '0 0 0 4px',
              fontSize: '16px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}
    </header>
  );
}
