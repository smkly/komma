'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { BrowserFile } from '../types';

interface FileBrowserProps {
  show: boolean;
  filePath: string;
  recentFiles: string[];
  onSelectFile: (path: string) => void;
  onClose: () => void;
}

export default function FileBrowser({
  show,
  filePath,
  recentFiles,
  onSelectFile,
  onClose,
}: FileBrowserProps) {
  const [browserPath, setBrowserPath] = useState('');
  const [browserFiles, setBrowserFiles] = useState<BrowserFile[]>([]);
  const [filter, setFilter] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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

  // Filter files based on search input
  const filteredFiles = useMemo(() => {
    if (!filter) return browserFiles;
    const lower = filter.toLowerCase();
    return browserFiles.filter(f => f.name.toLowerCase().includes(lower));
  }, [browserFiles, filter]);

  // Load the directory when the modal opens
  useEffect(() => {
    if (show) {
      const dir = filePath.substring(0, filePath.lastIndexOf('/'));
      loadBrowserDirectory(dir);
      setFilter('');
      setSelectedIndex(0);
      // Auto-focus search input
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [show, filePath, loadBrowserDirectory]);

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
          } else if (file.name.endsWith('.md')) {
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
    } else if (path.endsWith('.md')) {
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
              {filter ? 'No matching files' : 'No files found'}
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {filteredFiles.map((file, index) => {
                const isMarkdown = file.name.endsWith('.md');
                const canSelect = file.isDirectory || isMarkdown;
                const isSelected = index === selectedIndex;

                return (
                  <button
                    key={file.path}
                    data-file-item
                    onClick={() => canSelect && selectFile(file.path, file.isDirectory)}
                    disabled={!canSelect}
                    className={`w-full px-5 py-3 flex items-center gap-3 text-left transition-colors ${
                      !canSelect ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    style={{
                      background: isSelected ? 'var(--color-highlight)' : undefined,
                      borderLeft: isSelected ? '3px solid var(--color-accent)' : '3px solid transparent',
                    }}
                    onMouseEnter={e => { if (canSelect && !isSelected) e.currentTarget.style.background = 'var(--color-accent-subtle)'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = ''; }}
                  >
                    {file.isDirectory ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-amber)" strokeWidth="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                    ) : isMarkdown ? (
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
                    <span
                      className="flex-1 truncate text-sm"
                      style={{ color: canSelect ? 'var(--color-ink)' : 'var(--color-ink-faded)' }}
                    >
                      {file.name}
                    </span>
                    {file.isDirectory && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-faded)" strokeWidth="2">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    )}
                  </button>
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
    </div>
  );
}
