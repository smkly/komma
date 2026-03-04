'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { BrowserFile } from '../types';

const isOpenable = (name: string) => name.endsWith('.md') || name.endsWith('.html') || name.endsWith('.htm');

interface FileBrowserProps {
  show: boolean;
  filePath: string;
  recentFiles: string[];
  vaultRoot?: string | null;
  onSelectFile: (path: string) => void;
  onClose: () => void;
  onRenameFile?: (filePath: string, newName: string) => void;
  onDeleteFile?: (filePath: string) => void;
  onMoveFile?: (filePath: string) => void;
}

export default function FileBrowser({
  show,
  filePath,
  recentFiles,
  vaultRoot,
  onSelectFile,
  onClose,
  onRenameFile,
  onDeleteFile,
  onMoveFile,
}: FileBrowserProps) {
  const [browserPath, setBrowserPath] = useState('');
  const [browserFiles, setBrowserFiles] = useState<BrowserFile[]>([]);
  const [filter, setFilter] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: BrowserFile } | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [confirmDeletePath, setConfirmDeletePath] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const [searchResults, setSearchResults] = useState<BrowserFile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRoot = vaultRoot || '';

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [contextMenu]);

  // Focus rename input
  useEffect(() => {
    if (renamingPath && renameInputRef.current) {
      renameInputRef.current.focus();
      const name = renamingPath.split('/').pop() || '';
      const dotIdx = name.lastIndexOf('.');
      renameInputRef.current.setSelectionRange(0, dotIdx > 0 ? dotIdx : name.length);
    }
  }, [renamingPath]);

  const handleRename = (filePath: string, newName: string) => {
    if (!newName.trim()) { setRenamingPath(null); return; }
    const oldName = filePath.split('/').pop() || '';
    if (newName === oldName) { setRenamingPath(null); return; }
    onRenameFile?.(filePath, newName);
    setRenamingPath(null);
    setTimeout(() => loadBrowserDirectory(browserPath), 200);
  };

  const handleDelete = (filePath: string) => {
    onDeleteFile?.(filePath);
    setConfirmDeletePath(null);
    setTimeout(() => loadBrowserDirectory(browserPath), 200);
  };

  const loadBrowserDirectory = useCallback(async (path: string) => {
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (data.files) {
        setBrowserPath(data.path);
        setBrowserFiles(data.files);
        setSelectedIndex(0);
      }
    } catch (error) {
      console.error('Failed to load directory:', error);
    }
  }, []);

  // Debounced recursive search
  useEffect(() => {
    if (!filter || !searchRoot) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/files?path=${encodeURIComponent(searchRoot)}&search=${encodeURIComponent(filter)}`);
        const data = await res.json();
        setSearchResults(data.files || []);
      } catch {
        setSearchResults([]);
      }
      setIsSearching(false);
    }, 200);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [filter, searchRoot]);

  // When searching, show recursive results; otherwise filter current directory
  const filteredFiles = useMemo(() => {
    if (filter && searchRoot) return searchResults;
    if (!filter) return browserFiles;
    const lower = filter.toLowerCase();
    return browserFiles.filter(f => f.name.toLowerCase().includes(lower));
  }, [browserFiles, filter, searchResults, searchRoot]);

  // Load the directory when the modal opens — navigate to current file's location
  useEffect(() => {
    if (show) {
      const fileDir = filePath ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
      const dir = fileDir || vaultRoot || '';
      loadBrowserDirectory(dir);
      setFilter('');
      setSelectedIndex(0);
      // Auto-focus search input
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [show, filePath, vaultRoot, loadBrowserDirectory]);

  // Pre-select the current file when the file list loads
  useEffect(() => {
    if (show && filePath && browserFiles.length > 0) {
      const fileName = filePath.split('/').pop() || '';
      const idx = browserFiles.findIndex(f => f.name === fileName);
      if (idx >= 0) setSelectedIndex(idx);
    }
  }, [show, filePath, browserFiles]);

  // Reset selected index when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-file-item]');
    items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredFiles.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter': {
        e.preventDefault();
        const file = filteredFiles[selectedIndex];
        if (file) {
          if (file.isDirectory) {
            loadBrowserDirectory(file.path);
            setFilter('');
          } else if (isOpenable(file.name)) {
            onSelectFile(file.path);
          }
        }
        break;
      }
      case 'Backspace':
        // Only navigate up if search input is empty
        if (filter === '') {
          e.preventDefault();
          const parent = browserPath.substring(0, browserPath.lastIndexOf('/')) || '/';
          loadBrowserDirectory(parent);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [filteredFiles, selectedIndex, filter, browserPath, loadBrowserDirectory, onSelectFile, onClose]);

  const selectFile = (path: string, isDirectory: boolean) => {
    if (isDirectory) {
      loadBrowserDirectory(path);
    } else if (isOpenable(path)) {
      onSelectFile(path);
    }
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl overflow-hidden animate-slide-up"
        style={{ background: 'var(--color-surface)', boxShadow: 'var(--shadow-lg)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 py-4 border-b flex items-center justify-between flex-shrink-0"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <h2
              className="font-semibold"
              style={{ color: 'var(--color-ink)', fontFamily: 'var(--font-sans)' }}
            >
              Open File
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md flex items-center justify-center transition-colors"
            style={{ }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-accent-subtle)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = ''; }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-muted)" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Search + Path bar */}
        <div
          className="px-5 py-2 border-b flex items-center gap-2"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-paper)' }}
          onKeyDown={handleKeyDown}
        >
          <button
            onClick={() => {
              const parent = browserPath.substring(0, browserPath.lastIndexOf('/')) || '/';
              loadBrowserDirectory(parent);
            }}
            className="p-1.5 rounded transition-colors"
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-accent-subtle)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = ''; }}
            title="Go up"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <input
            ref={searchInputRef}
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={browserPath}
            className="flex-1 text-sm font-mono bg-transparent outline-none truncate"
            style={{ color: 'var(--color-ink-muted)' }}
          />
        </div>

        {/* Recent files */}
        {recentFiles.length > 0 && (
          <div
            className="px-5 py-3 border-b"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-highlight)' }}
          >
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-amber)' }}>
              Recent Files
            </p>
            <div className="flex flex-wrap gap-2">
              {recentFiles.map((file) => (
                <button
                  key={file}
                  onClick={() => onSelectFile(file)}
                  className="px-2 py-1 text-xs rounded-md transition-colors"
                  style={{
                    background: 'var(--color-accent-light)',
                    color: 'var(--color-amber)',
                    border: '1px solid var(--color-border)'
                  }}
                  title={file}
                >
                  {file.split('/').pop()}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* File list */}
        <div ref={listRef} className="flex-1 overflow-y-auto" onKeyDown={handleKeyDown}>
          {filteredFiles.length === 0 ? (
            <div className="p-5 text-center text-sm" style={{ color: 'var(--color-ink-muted)' }}>
              {isSearching ? 'Searching...' : filter ? 'No matching files' : 'No files found'}
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {filteredFiles.map((file, index) => {
                const isOpenableFile = isOpenable(file.name);
                const canSelect = file.isDirectory || isOpenableFile;
                const isSelected = index === selectedIndex;

                const isRenamingThis = renamingPath === file.path;

                return (
                  <div
                    key={file.path}
                    data-file-item
                    className={`group w-full px-5 py-3 flex items-center gap-3 text-left transition-colors ${
                      !canSelect ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                    }`}
                    style={{
                      background: isSelected ? 'var(--color-highlight)' : undefined,
                      borderLeft: isSelected ? '3px solid var(--color-accent)' : '3px solid transparent',
                    }}
                    onClick={() => !isRenamingThis && canSelect && selectFile(file.path, file.isDirectory)}
                    onMouseEnter={e => { if (canSelect && !isSelected) e.currentTarget.style.background = 'var(--color-accent-subtle)'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = ''; }}
                    onContextMenu={(e) => {
                      if (!file.isDirectory && isOpenableFile) {
                        e.preventDefault();
                        setContextMenu({ x: e.clientX, y: e.clientY, file });
                      }
                    }}
                  >
                    {file.isDirectory ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-amber)" strokeWidth="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                    ) : isOpenableFile ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-faded)" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    )}
                    {isRenamingThis ? (
                      <input
                        ref={renameInputRef}
                        defaultValue={file.name}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(file.path, (e.target as HTMLInputElement).value);
                          else if (e.key === 'Escape') setRenamingPath(null);
                        }}
                        onBlur={(e) => handleRename(file.path, e.target.value)}
                        className="flex-1 text-sm"
                        style={{
                          padding: '2px 6px', borderRadius: '4px',
                          border: '1px solid var(--color-accent)',
                          background: 'var(--color-paper)', color: 'var(--color-ink)',
                          outline: 'none', fontFamily: 'inherit', minWidth: 0,
                        }}
                      />
                    ) : (
                      <span
                        className="flex-1 truncate text-sm"
                        style={{ color: canSelect ? 'var(--color-ink)' : 'var(--color-ink-faded)' }}
                      >
                        {file.name}
                      </span>
                    )}
                    {file.isDirectory && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-faded)" strokeWidth="2">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    )}
                    {/* Hover action buttons */}
                    {!file.isDirectory && isOpenableFile && !isRenamingThis && (
                      <span className="hidden group-hover:flex gap-1 flex-shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); setRenamingPath(file.path); }}
                          title="Rename"
                          className="p-1 rounded transition-colors"
                          style={{ color: 'var(--color-ink-faded)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-ink)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-ink-faded)'; }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDeletePath(file.path); }}
                          title="Delete"
                          className="p-1 rounded transition-colors"
                          style={{ color: 'var(--color-ink-faded)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-danger, #ef4444)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-ink-faded)'; }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 border-t flex items-center justify-between"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-paper)' }}
        >
          <span className="text-xs flex items-center gap-3" style={{ color: 'var(--color-ink-faded)' }}>
            <span>&#8593;&#8595; navigate</span>
            <span>&#8629; open</span>
            <span>&#9003; up dir</span>
            <span>esc close</span>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm rounded-md transition-colors"
            style={{ color: 'var(--color-ink-muted)' }}
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-[60] rounded-lg overflow-hidden"
          style={{
            top: contextMenu.y,
            left: contextMenu.x,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            minWidth: '160px',
          }}
        >
          <button
            className="w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2"
            style={{ color: 'var(--color-ink)', fontFamily: 'var(--font-sans)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-accent-subtle)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            onClick={() => { setRenamingPath(contextMenu.file.path); setContextMenu(null); }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Rename
          </button>
          {onMoveFile && (
            <button
              className="w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2"
              style={{ color: 'var(--color-ink)', fontFamily: 'var(--font-sans)', borderTop: '1px solid var(--color-border)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-accent-subtle)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              onClick={() => { onMoveFile(contextMenu.file.path); setContextMenu(null); }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                <line x1="12" y1="11" x2="12" y2="17" />
                <polyline points="9 14 12 11 15 14" />
              </svg>
              Move to...
            </button>
          )}
          <button
            className="w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2"
            style={{ color: 'var(--color-danger, #ef4444)', fontFamily: 'var(--font-sans)', borderTop: '1px solid var(--color-border)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-accent-subtle)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            onClick={() => { setConfirmDeletePath(contextMenu.file.path); setContextMenu(null); }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Delete
          </button>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDeletePath && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setConfirmDeletePath(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--color-surface)',
              borderRadius: '12px',
              padding: '20px 24px',
              width: '380px',
              maxWidth: '90vw',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              border: '1px solid var(--color-border)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)' }}>Delete file?</h3>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--color-ink-muted)' }}>
              <strong>{confirmDeletePath.split('/').pop()}</strong> will be moved to the Trash.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmDeletePath(null)}
                style={{
                  padding: '6px 14px', fontSize: '13px', borderRadius: '6px',
                  border: '1px solid var(--color-border)', background: 'var(--color-surface-raised)',
                  color: 'var(--color-ink)', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDeletePath)}
                style={{
                  padding: '6px 14px', fontSize: '13px', borderRadius: '6px',
                  border: 'none', background: 'var(--color-danger, #ef4444)',
                  color: '#fff', cursor: 'pointer', fontWeight: 500,
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
