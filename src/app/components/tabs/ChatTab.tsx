'use client';

import { useState, useRef, useEffect } from 'react';
import type { ChatSession, ChatMessage } from '../../hooks/useChat';

interface ChatTabProps {
  sessions: ChatSession[];
  activeSessionId: number | null;
  messages: ChatMessage[];
  streamOutput: string;
  isStreaming: boolean;
  streamRef: React.RefObject<HTMLDivElement | null>;
  selectedText: string;
  onNewSession: () => void;
  onSelectSession: (sessionId: number) => void;
  onSendMessage: (message: string, contextSelection?: string) => void;
  onDeleteSession: (sessionId: number) => void;
  draft?: string;
  onDraftChange?: (value: string) => void;
}

export default function ChatTab({
  sessions,
  activeSessionId,
  messages,
  streamOutput,
  isStreaming,
  streamRef,
  selectedText,
  onNewSession,
  onSelectSession,
  onSendMessage,
  onDeleteSession,
  draft,
  onDraftChange,
}: ChatTabProps) {
  const [inputValue, setInputValue] = useState(draft || '');
  const [includeContext, setIncludeContext] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamOutput]);

  // Auto-resize textarea
  const handleInputChange = (value: string) => {
    setInputValue(value);
    onDraftChange?.(value);
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  };

  const handleSend = () => {
    const msg = inputValue.trim();
    if (!msg || isStreaming) return;
    onSendMessage(msg, includeContext && selectedText ? selectedText : undefined);
    setInputValue('');
    onDraftChange?.('');
    setIncludeContext(false);
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      {/* Header with New Chat + Session selector */}
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <button
          onClick={onNewSession}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{
            background: 'var(--color-accent-light)',
            color: 'var(--color-accent)',
            border: '1px solid var(--color-accent)',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Chat
        </button>

        {sessions.length > 0 && (
          <button
            onClick={() => setShowSessions(!showSessions)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: showSessions ? 'var(--color-surface)' : 'transparent',
              color: 'var(--color-ink-faded)',
              border: '1px solid var(--color-border)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {sessions.length}
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ transform: showSessions ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}
      </div>

      {/* Session list dropdown */}
      {showSessions && sessions.length > 0 && (
        <div
          className="mb-3 rounded-lg overflow-hidden flex-shrink-0"
          style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
        >
          {sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            const time = new Date(session.updated_at);
            return (
              <div
                key={session.id}
                className="flex items-center justify-between px-3 py-2 text-xs cursor-pointer transition-colors"
                style={{
                  background: isActive ? 'var(--color-accent-light)' : 'var(--color-surface)',
                  borderBottom: '1px solid var(--color-border)',
                }}
                onClick={() => {
                  onSelectSession(session.id);
                  setShowSessions(false);
                }}
              >
                <span style={{ color: isActive ? 'var(--color-accent)' : 'var(--color-ink)' }}>
                  Chat {session.id}
                </span>
                <div className="flex items-center gap-2">
                  <span style={{ color: 'var(--color-ink-faded)' }}>
                    {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.id);
                    }}
                    className="p-0.5 rounded hover:bg-red-50 transition-colors"
                    style={{ color: 'var(--color-ink-faded)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-danger)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-ink-faded)'}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto mb-3 space-y-3" style={{ minHeight: 0 }}>
        {messages.length === 0 && !isStreaming ? (
          <div
            className="text-sm text-center py-8"
            style={{ color: 'var(--color-ink-faded)' }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3 opacity-50">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p>Start a conversation about your document</p>
            <p className="text-xs mt-1">Select text for context, then ask a question</p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="max-w-[85%] rounded-xl px-3 py-2 text-sm"
                  style={msg.role === 'user' ? {
                    background: 'var(--color-accent)',
                    color: 'var(--color-vim-insert-fg)',
                    borderBottomRightRadius: '4px',
                  } : {
                    background: 'var(--color-surface)',
                    color: 'var(--color-ink)',
                    border: '1px solid var(--color-border)',
                    borderBottomLeftRadius: '4px',
                  }}
                >
                  {/* Context selection badge */}
                  {msg.context_selection && (
                    <div
                      className="text-xs mb-1.5 px-2 py-1 rounded"
                      style={{
                        background: msg.role === 'user' ? 'rgba(255,255,255,0.15)' : 'var(--color-highlight)',
                        color: msg.role === 'user' ? 'rgba(255,255,255,0.8)' : 'var(--color-ink-muted)',
                        fontFamily: 'var(--font-serif)',
                      }}
                    >
                      &ldquo;{msg.context_selection.substring(0, 80)}{msg.context_selection.length > 80 ? '...' : ''}&rdquo;
                    </div>
                  )}
                  <div style={{ lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {msg.content}
                  </div>
                </div>
              </div>
            ))}

            {/* Streaming indicator */}
            {isStreaming && (
              <div className="flex justify-start">
                <div
                  className="rounded-xl px-3 py-2 text-sm"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderBottomLeftRadius: '4px',
                  }}
                >
                  <div className="flex items-center gap-1.5" style={{ color: 'var(--color-ink-faded)' }}>
                    <span
                      className="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{ background: 'var(--color-accent)', animationDelay: '0ms' }}
                    />
                    <span
                      className="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{ background: 'var(--color-accent)', animationDelay: '150ms' }}
                    />
                    <span
                      className="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{ background: 'var(--color-accent)', animationDelay: '300ms' }}
                    />
                    <span className="ml-1 text-xs">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Stream output (collapsible) */}
      {isStreaming && streamOutput && (
        <div className="mb-3 flex-shrink-0">
          <div
            className="text-xs font-medium uppercase tracking-wide mb-1 flex items-center gap-2"
            style={{ color: 'var(--color-ink-faded)' }}
          >
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ background: 'var(--color-success)' }}
            />
            Live Output
          </div>
          <div
            ref={streamRef}
            className="rounded-lg p-2 font-mono text-xs overflow-y-auto"
            style={{
              background: 'var(--color-paper-dark)',
              color: 'var(--color-ink)',
              maxHeight: '150px',
              lineHeight: 1.4,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {streamOutput}
          </div>
        </div>
      )}

      {/* Context selection indicator */}
      {selectedText && (
        <div className="mb-2 flex-shrink-0">
          <label
            className="flex items-center gap-2 text-xs cursor-pointer rounded-lg px-2 py-1.5 transition-colors"
            style={{
              background: includeContext ? 'var(--color-accent-light)' : 'var(--color-paper-dark)',
              color: includeContext ? 'var(--color-accent)' : 'var(--color-ink-faded)',
              border: `1px solid ${includeContext ? 'var(--color-accent)' : 'var(--color-border)'}`,
            }}
          >
            <input
              type="checkbox"
              checked={includeContext}
              onChange={(e) => setIncludeContext(e.target.checked)}
              className="rounded"
            />
            <span className="truncate">
              Include: &ldquo;{selectedText.substring(0, 40)}{selectedText.length > 40 ? '...' : ''}&rdquo;
            </span>
          </label>
        </div>
      )}

      {/* Input area */}
      <div
        className="flex-shrink-0 flex items-end gap-2 p-2 rounded-xl"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
        }}
      >
        <textarea
          ref={inputRef}
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about this document..."
          disabled={isStreaming}
          rows={1}
          className="flex-1 resize-none text-sm outline-none"
          style={{
            color: 'var(--color-ink)',
            lineHeight: 1.5,
            maxHeight: '120px',
            background: 'transparent',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!inputValue.trim() || isStreaming}
          aria-label="Send message"
          className="p-1.5 rounded-lg transition-all flex-shrink-0"
          style={{
            background: inputValue.trim() && !isStreaming ? 'var(--color-accent)' : 'var(--color-border)',
            color: inputValue.trim() && !isStreaming ? 'var(--color-vim-insert-fg)' : 'var(--color-ink-faded)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
