'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserFile } from '../types';

const isOpenable = (name: string) => name.endsWith('.md') || name.endsWith('.html') || name.endsWith('.htm');

interface FileExplorerProps {
  show: boolean;
  currentDir: string;
  currentFile: string;
  onSelectFile: (path: string) => void;
  onRenameFile?: (filePath: string, newName: string) => void;
  onDeleteFile?: (filePath: string) => void;
  onMoveFile?: (filePath: string) => void;
}

export default function FileExplorer({ show, currentDir, currentFile, onSelectFile, onRenameFile, onDeleteFile, onMoveFile }: FileExplorerProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [contents, setContents] = useState<Record<string, BrowserFile[]>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: BrowserFile } | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [confirmDeletePath, setConfirmDeletePath] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchDir = useCallback(async (dirPath: string) => {
    if (loading[dirPath]) return;
    setLoading(prev => ({ ...prev, [dirPath]: true }));
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(dirPath)}`);
      const data = await res.json();
      setContents(prev => ({ ...prev, [dirPath]: data.files }));
    } catch (err) {
      console.error('Failed to load directory:', dirPath, err);
    } finally {
      setLoading(prev => ({ ...prev, [dirPath]: false }));
    }
  }, [loading]);

  useEffect(() => {
    if (currentDir) {
      fetchDir(currentDir);
      setExpanded({});
      setContents({});
    }
  }, [currentDir]);

  // Auto-expand directories leading to the current file
  useEffect(() => {
    if (!currentDir || !currentFile || !currentFile.startsWith(currentDir + '/')) return;
    const relative = currentFile.slice(currentDir.length + 1);
    const parts = relative.split('/');
    if (parts.length <= 1) return; // file is in root dir, no folders to expand

    // Build list of ancestor directories to expand
    const dirsToExpand: string[] = [];
    let path = currentDir;
    for (let i = 0; i < parts.length - 1; i++) {
      path += '/' + parts[i];
      dirsToExpand.push(path);
    }

    // Expand and fetch each ancestor sequentially
    (async () => {
      for (const dir of dirsToExpand) {
        setExpanded(prev => ({ ...prev, [dir]: true }));
        if (!contents[dir]) {
          try {
            const res = await fetch(`/api/files?path=${encodeURIComponent(dir)}`);
            const data = await res.json();
            setContents(prev => ({ ...prev, [dir]: data.files }));
          } catch { /* ignore */ }
        }
      }
    })();
  }, [currentDir, currentFile]);

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

  const toggleFolder = (path: string) => {
    const isExpanded = expanded[path];
    setExpanded(prev => ({ ...prev, [path]: !isExpanded }));
    if (!isExpanded && !contents[path]) {
      fetchDir(path);
    }
  };

  const refresh = () => {
    setExpanded({});
    setContents({});
    fetchDir(currentDir);
  };

  const handleRename = (filePath: string, newName: string) => {
    if (!newName.trim()) {
      setRenamingPath(null);
      return;
    }
    const oldName = filePath.split('/').pop() || '';
    if (newName === oldName) {
      setRenamingPath(null);
      return;
    }
    onRenameFile?.(filePath, newName);
    setRenamingPath(null);
    // Refresh parent directory after a short delay
    setTimeout(() => {
      const dir = filePath.substring(0, filePath.lastIndexOf('/'));
      fetchDir(dir);
    }, 200);
  };

  const handleDelete = (filePath: string) => {
    onDeleteFile?.(filePath);
    setConfirmDeletePath(null);
    setTimeout(() => {
      const dir = filePath.substring(0, filePath.lastIndexOf('/'));
      fetchDir(dir);
    }, 200);
  };

  const handleMove = (filePath: string) => {
    onMoveFile?.(filePath);
    setContextMenu(null);
  };

  if (!show) return null;

  const rootBasename = currentDir.split('/').filter(Boolean).pop() || currentDir;

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: 'var(--color-paper-dark)',
      color: 'var(--color-ink)',
      fontSize: '12px',
      fontFamily: 'var(--font-sans), system-ui, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
      }}>
        <span style={{
          fontWeight: 600,
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--color-ink-muted)',
        }}>
          {rootBasename}
        </span>
        <button
          onClick={refresh}
          title="Refresh"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
            color: 'var(--color-ink-faded)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
          </svg>
        </button>
      </div>

      {/* Tree */}
      <div id="file-explorer-tree" style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
        {contents[currentDir]?.map(file => (
          <FileTreeItem
            key={file.path}
            file={file}
            depth={0}
            expanded={expanded}
            contents={contents}
            loading={loading}
            currentFile={currentFile}
            onToggleFolder={toggleFolder}
            onSelectFile={onSelectFile}
            onContextMenu={(e, f) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, file: f }); }}
            renamingPath={renamingPath}
            onRename={handleRename}
            onStartRename={(p) => setRenamingPath(p)}
            onStartDelete={(p) => setConfirmDeletePath(p)}
          />
        ))}
        {loading[currentDir] && (
          <div style={{ padding: '8px 12px', color: 'var(--color-ink-faded)' }}>
            Loading...
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 rounded-lg overflow-hidden"
          style={{
            top: contextMenu.y,
            left: contextMenu.x,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            minWidth: '160px',
          }}
        >
          {!contextMenu.file.isDirectory && (
            <>
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
                  onClick={() => handleMove(contextMenu.file.path)}
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
            </>
          )}
          {contextMenu.file.isDirectory && (
            <div className="px-3 py-2 text-xs" style={{ color: 'var(--color-ink-faded)', fontFamily: 'var(--font-sans)' }}>
              No actions for folders
            </div>
          )}
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

function FileTreeItem({
  file,
  depth,
  expanded,
  contents,
  loading,
  currentFile,
  onToggleFolder,
  onSelectFile,
  onContextMenu,
  renamingPath,
  onRename,
  onStartRename,
  onStartDelete,
}: {
  file: BrowserFile;
  depth: number;
  expanded: Record<string, boolean>;
  contents: Record<string, BrowserFile[]>;
  loading: Record<string, boolean>;
  currentFile: string;
  onToggleFolder: (path: string) => void;
  onSelectFile: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, file: BrowserFile) => void;
  renamingPath: string | null;
  onRename: (filePath: string, newName: string) => void;
  onStartRename: (path: string) => void;
  onStartDelete: (path: string) => void;
}) {
  const isExpanded = expanded[file.path] || false;
  const isMarkdown = isOpenable(file.name);
  const isActive = file.path === currentFile;
  const isRenaming = renamingPath === file.path;
  const indent = 12 + depth * 16;
  const [hovered, setHovered] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      // Select filename without extension
      const dotIdx = file.name.lastIndexOf('.');
      renameInputRef.current.setSelectionRange(0, dotIdx > 0 ? dotIdx : file.name.length);
    }
  }, [isRenaming, file.name]);

  if (file.isDirectory) {
    return (
      <>
        <div
          onClick={() => onToggleFolder(file.path)}
          onContextMenu={(e) => onContextMenu(e, file)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            paddingLeft: `${indent}px`,
            paddingRight: '8px',
            paddingTop: '3px',
            paddingBottom: '3px',
            cursor: 'pointer',
            color: 'var(--color-ink-muted)',
            userSelect: 'none',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-accent-subtle)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          {/* Chevron */}
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s ease',
              flexShrink: 0,
            }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          {/* Folder icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            {isExpanded
              ? <path d="M5 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1M5 19h14a2 2 0 0 0 2-2l-3-7H8l-3 7z" />
              : <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            }
          </svg>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name}
          </span>
        </div>
        {isExpanded && (
          <>
            {loading[file.path] && (
              <div style={{ paddingLeft: `${indent + 28}px`, paddingTop: '2px', paddingBottom: '2px', color: 'var(--color-ink-faded)', fontSize: '11px' }}>
                ...
              </div>
            )}
            {contents[file.path]?.map(child => (
              <FileTreeItem
                key={child.path}
                file={child}
                depth={depth + 1}
                expanded={expanded}
                contents={contents}
                loading={loading}
                currentFile={currentFile}
                onToggleFolder={onToggleFolder}
                onSelectFile={onSelectFile}
                onContextMenu={onContextMenu}
                renamingPath={renamingPath}
                onRename={onRename}
                onStartRename={onStartRename}
                onStartDelete={onStartDelete}
              />
            ))}
          </>
        )}
      </>
    );
  }

  // File item
  return (
    <div
      onClick={isMarkdown && !isRenaming ? () => onSelectFile(file.path) : undefined}
      onContextMenu={(e) => onContextMenu(e, file)}
      data-active={isActive || undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      ref={el => { if (isActive && el) setTimeout(() => el.scrollIntoView({ block: 'nearest' }), 100); }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        paddingLeft: `${indent + 14}px`,
        paddingRight: '8px',
        paddingTop: '3px',
        paddingBottom: '3px',
        cursor: isMarkdown ? 'pointer' : 'default',
        color: isMarkdown ? 'var(--color-ink)' : 'var(--color-ink-faded)',
        opacity: isMarkdown ? 1 : 0.5,
        userSelect: 'none',
        background: isActive ? 'var(--color-highlight)' : hovered && isMarkdown ? 'var(--color-accent-subtle)' : 'transparent',
        borderLeft: isActive ? '2px solid var(--color-accent)' : '2px solid transparent',
      }}
    >
      {/* File icon */}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      {isRenaming ? (
        <input
          ref={renameInputRef}
          defaultValue={file.name}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onRename(file.path, (e.target as HTMLInputElement).value);
            } else if (e.key === 'Escape') {
              onRename(file.path, file.name); // cancel — pass same name
            }
          }}
          onBlur={(e) => onRename(file.path, e.target.value)}
          style={{
            flex: 1,
            fontSize: '12px',
            padding: '1px 4px',
            borderRadius: '3px',
            border: '1px solid var(--color-accent)',
            background: 'var(--color-paper)',
            color: 'var(--color-ink)',
            outline: 'none',
            fontFamily: 'inherit',
            minWidth: 0,
          }}
        />
      ) : (
        <>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {file.name}
          </span>
          {/* Hover action buttons */}
          {hovered && isMarkdown && (
            <span style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
              <button
                onClick={(e) => { e.stopPropagation(); onStartRename(file.path); }}
                title="Rename"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '1px',
                  display: 'flex', alignItems: 'center', color: 'var(--color-ink-faded)',
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onStartDelete(file.path); }}
                title="Delete"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '1px',
                  display: 'flex', alignItems: 'center', color: 'var(--color-ink-faded)',
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </span>
          )}
        </>
      )}
    </div>
  );
}
