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
    </header>
  );
}
