'use client';

import { useState, useEffect, useRef, ReactNode } from 'react';

interface SidebarProps {
  activeTab: 'toc' | 'edits' | 'chat';
  setActiveTab: (tab: 'toc' | 'edits' | 'chat') => void;
  commentsCount: number;
  isSending: boolean;
  isChatStreaming?: boolean;
  children: ReactNode;
}

const tabs = [
  { id: 'toc' as const, label: 'Contents', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="15" y2="12" />
      <line x1="3" y1="18" x2="18" y2="18" />
    </svg>
  )},
  { id: 'edits' as const, label: 'Edits', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )},
  { id: 'chat' as const, label: 'Chat', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )},
];

export default function Sidebar({
  activeTab,
  setActiveTab,
  commentsCount,
  isSending,
  isChatStreaming,
  children,
}: SidebarProps) {
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  // Sidebar resize handler
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      setSidebarWidth(Math.max(280, Math.min(600, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    if (isResizing) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const getBadge = (tabId: string) => {
    if (tabId === 'edits' && isSending) {
      return (
        <span
          className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full animate-pulse"
          style={{ background: 'var(--color-amber)' }}
        />
      );
    }
    if (tabId === 'edits' && commentsCount > 0 && !isSending) {
      return (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 text-[10px] font-semibold px-1 rounded-full flex items-center justify-center"
          style={{
            background: 'var(--color-amber)',
            color: 'var(--color-paper)',
          }}
        >
          {commentsCount}
        </span>
      );
    }
    if (tabId === 'chat' && isChatStreaming) {
      return (
        <span
          className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full animate-pulse"
          style={{ background: 'var(--color-accent)' }}
        />
      );
    }
    return null;
  };

  return (
    <aside
      ref={sidebarRef}
      data-sidebar
      className="h-full flex-shrink-0 flex flex-col relative"
      style={{
        width: sidebarWidth,
        background: 'var(--color-paper-dark)',
        borderLeft: '1px solid var(--color-border)'
      }}
    >
      {/* Resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize transition-colors z-10"
        style={{ background: isResizing ? 'var(--color-accent)' : 'transparent' }}
        onMouseDown={(e) => {
          e.preventDefault();
          setIsResizing(true);
        }}
      />
      {/* Tab Headers */}
      <div
        className="flex flex-shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
              className="flex-1 py-2.5 flex items-center justify-center transition-all relative"
              style={{
                color: isActive ? 'var(--color-accent)' : 'var(--color-ink-faded)',
                background: isActive ? 'var(--color-surface)' : 'transparent',
              }}
            >
              {isActive && (
                <span
                  className="absolute bottom-0 left-3 right-3 h-[2px] rounded-t"
                  style={{ background: 'var(--color-accent)', boxShadow: '0 0 8px var(--color-accent-glow)' }}
                />
              )}
              <span className="relative">
                {tab.icon}
                {getBadge(tab.id)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className={`flex-1 min-h-0 px-3 py-3 ${activeTab === 'chat' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
        {children}
      </div>
    </aside>
  );
}
