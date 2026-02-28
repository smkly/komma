'use client';

import { useState, useRef, useEffect } from 'react';

interface Tab {
  path: string;
  title: string;
  generating?: boolean;
}

interface TabBarProps {
  tabs: Tab[];
  activeIndex: number;
  splitTabIndex?: number | null;
  onSelectTab: (index: number) => void;
  onCloseTab: (index: number) => void;
  onOpenInSplit?: (index: number) => void;
  onToggleSplit?: () => void;
}

export default function TabBar({ tabs, activeIndex, splitTabIndex, onSelectTab, onCloseTab, onOpenInSplit, onToggleSplit }: TabBarProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabIndex: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  return (
    <div
      className="flex items-end gap-0 overflow-x-auto relative"
      style={{
        background: 'var(--color-paper-dark)',
        borderBottom: '1px solid var(--color-border)',
        paddingLeft: '1.5rem',
      }}
    >
      {tabs.map((tab, i) => {
        const isActive = i === activeIndex;
        const isSplit = i === splitTabIndex;
        return (
          <button
            key={tab.path}
            className="group relative flex items-center gap-2 px-4 py-2.5 text-xs shrink-0 transition-all"
            style={{
              fontFamily: 'var(--font-sans)',
              color: isActive ? 'var(--color-accent)' : isSplit ? 'var(--color-accent)' : 'var(--color-ink-faded)',
              background: isActive ? 'var(--color-surface)' : 'transparent',
              borderTop: 'none',
              borderLeft: isActive ? '1px solid var(--color-border)' : '1px solid transparent',
              borderRight: isActive ? '1px solid var(--color-border)' : '1px solid transparent',
              borderBottom: isActive ? '1px solid var(--color-surface)' : '1px solid transparent',
              marginBottom: '-1px',
              fontWeight: isActive ? 600 : isSplit ? 500 : 400,
            }}
            onClick={() => onSelectTab(i)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, tabIndex: i });
            }}
          >
            {/* Active tab glow line */}
            {isActive && (
              <span
                className="absolute top-0 left-2 right-2 h-[2px] rounded-b"
                style={{
                  background: 'var(--color-accent)',
                  boxShadow: '0 0 8px var(--color-accent-glow), 0 2px 12px var(--color-accent-glow)',
                }}
              />
            )}
            {/* Generating spinner icon */}
            {tab.generating && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="3" className="animate-spin" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" opacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
            )}
            {/* Split indicator icon */}
            {isSplit && !isActive && !tab.generating && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" style={{ opacity: 0.6 }}>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="12" y1="3" x2="12" y2="21" />
              </svg>
            )}
            <span className="truncate max-w-[160px]" style={{ color: tab.generating ? 'var(--color-accent)' : undefined }}>{tab.title}</span>
            {tabs.length > 1 && !tab.generating && (
              <span
                className="ml-1 rounded hover:bg-black/10 transition-all flex items-center justify-center"
                style={{
                  width: '16px',
                  height: '16px',
                  opacity: isActive ? 0.6 : 0,
                  fontSize: '14px',
                  lineHeight: 1,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(i);
                }}
              >
                <span className="group-hover:opacity-60" style={{ opacity: isActive ? undefined : 0 }}>
                  &times;
                </span>
              </span>
            )}
          </button>
        );
      })}

      {/* Spacer + split button (right-aligned) */}
      <div className="flex-1" />
      {tabs.length > 1 && (
        <button
          onClick={onToggleSplit}
          className="flex items-center justify-center mr-3 mb-0.5 rounded transition-all"
          style={{
            width: '28px',
            height: '28px',
            color: splitTabIndex !== null ? 'var(--color-accent)' : 'var(--color-ink-faded)',
            background: splitTabIndex !== null ? 'var(--color-accent-subtle)' : 'transparent',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-accent-subtle)'; e.currentTarget.style.color = 'var(--color-accent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = splitTabIndex !== null ? 'var(--color-accent-subtle)' : 'transparent'; e.currentTarget.style.color = splitTabIndex !== null ? 'var(--color-accent)' : 'var(--color-ink-faded)'; }}
          title={splitTabIndex !== null ? 'Close split (⌘\\)' : 'Split editor (⌘\\)'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="12" y1="3" x2="12" y2="21" />
          </svg>
        </button>
      )}

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
            boxShadow: 'var(--shadow-lg)',
            minWidth: '180px',
          }}
        >
          <button
            className="w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2"
            style={{ color: 'var(--color-ink)', fontFamily: 'var(--font-sans)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-accent-subtle)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            onClick={() => {
              onOpenInSplit?.(contextMenu.tabIndex);
              setContextMenu(null);
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="12" y1="3" x2="12" y2="21" />
            </svg>
            Open in Split Right
          </button>
          <button
            className="w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2"
            style={{ color: 'var(--color-ink)', fontFamily: 'var(--font-sans)', borderTop: '1px solid var(--color-border)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-accent-subtle)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            onClick={() => {
              onCloseTab(contextMenu.tabIndex);
              setContextMenu(null);
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Close Tab
          </button>
        </div>
      )}
    </div>
  );
}
