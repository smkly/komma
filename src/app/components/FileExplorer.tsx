'use client';

import { useState, useEffect, useCallback } from 'react';
import { BrowserFile } from '../types';

interface FileExplorerProps {
  show: boolean;
  currentDir: string;
  currentFile: string;
  onSelectFile: (path: string) => void;
}

export default function FileExplorer({ show, currentDir, currentFile, onSelectFile }: FileExplorerProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [contents, setContents] = useState<Record<string, BrowserFile[]>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

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
      borderRight: '1px solid var(--color-border)',
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
      <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
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
          />
        ))}
        {loading[currentDir] && (
          <div style={{ padding: '8px 12px', color: 'var(--color-ink-faded)' }}>
            Loading...
          </div>
        )}
      </div>
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
}: {
  file: BrowserFile;
  depth: number;
  expanded: Record<string, boolean>;
  contents: Record<string, BrowserFile[]>;
  loading: Record<string, boolean>;
  currentFile: string;
  onToggleFolder: (path: string) => void;
  onSelectFile: (path: string) => void;
}) {
  const isExpanded = expanded[file.path] || false;
  const isMarkdown = file.name.endsWith('.md');
  const isActive = file.path === currentFile;
  const indent = 12 + depth * 16;

  if (file.isDirectory) {
    return (
      <>
        <div
          onClick={() => onToggleFolder(file.path)}
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
      onClick={isMarkdown ? () => onSelectFile(file.path) : undefined}
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
        background: isActive ? 'var(--color-highlight)' : 'transparent',
        borderLeft: isActive ? '2px solid var(--color-accent)' : '2px solid transparent',
      }}
      onMouseEnter={e => { if (isMarkdown && !isActive) e.currentTarget.style.background = 'var(--color-accent-subtle)'; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
    >
      {/* File icon */}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {file.name}
      </span>
    </div>
  );
}
