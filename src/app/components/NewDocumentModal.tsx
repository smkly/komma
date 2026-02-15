'use client';

import { useState, useEffect, useRef } from 'react';

interface NewDocumentModalProps {
  show: boolean;
  currentDir: string;
  onSubmit: (filePath: string, prompt: string) => void;
  onCancel: () => void;
}

export default function NewDocumentModal({
  show,
  currentDir,
  onSubmit,
  onCancel,
}: NewDocumentModalProps) {
  const [fileName, setFileName] = useState('');
  const [prompt, setPrompt] = useState('');
  const fileNameRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // Reset state and focus when modal opens
  useEffect(() => {
    if (show) {
      setFileName('');
      setPrompt('');
      setTimeout(() => fileNameRef.current?.focus(), 50);
    }
  }, [show]);

  // Auto-suggest filename from prompt
  useEffect(() => {
    if (prompt && !fileName) {
      const words = prompt.trim().split(/\s+/).slice(0, 4);
      const suggested = words.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '') + '.md';
      setFileName(suggested);
    }
  }, [prompt]);

  const handleSubmit = () => {
    if (!fileName.trim() || !prompt.trim()) return;
    const name = fileName.endsWith('.md') ? fileName : fileName + '.md';
    const filePath = `${currentDir}/${name}`;
    onSubmit(filePath, prompt);
  };

  if (!show) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0, 0, 0, 0.4)' }}
        onClick={onCancel}
      />

      {/* Modal */}
      <div
        className="fixed z-50 animate-fade-in"
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(560px, 90vw)',
          background: 'var(--color-surface)',
          borderRadius: '12px',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--color-border)',
        }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center gap-2">
            <svg
              width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="var(--color-accent)" strokeWidth="2"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            <h2
              className="font-semibold"
              style={{ color: 'var(--color-ink)', fontFamily: 'var(--font-sans)' }}
            >
              New Document
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-md flex items-center justify-center btn-ghost"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-muted)" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-4">
          {/* File name */}
          <div>
            <label
              className="text-xs font-medium uppercase tracking-wide mb-2 block"
              style={{ color: 'var(--color-ink-faded)' }}
            >
              File name
            </label>
            <input
              ref={fileNameRef}
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="my-document.md"
              className="w-full px-3 py-2 text-sm rounded-lg transition-all focus:outline-none"
              style={{
                border: '2px solid var(--color-border)',
                fontFamily: 'var(--font-sans)',
                color: 'var(--color-ink)',
                background: 'var(--color-surface)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-accent)';
                e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-accent-light)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  promptRef.current?.focus();
                }
                if (e.key === 'Escape') {
                  onCancel();
                }
              }}
            />
            <span
              className="text-xs mt-1 block"
              style={{ color: 'var(--color-ink-faded)' }}
            >
              {currentDir}/
            </span>
          </div>

          {/* Prompt */}
          <div className="flex flex-col">
            <label
              className="text-xs font-medium uppercase tracking-wide mb-2"
              style={{ color: 'var(--color-ink-faded)' }}
            >
              Describe what you want to write
            </label>
            <textarea
              ref={promptRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A blog post about productivity tips for remote workers..."
              className="w-full p-3 text-sm rounded-lg transition-all resize-none focus:outline-none"
              style={{
                border: '2px solid var(--color-border)',
                fontFamily: 'var(--font-sans)',
                color: 'var(--color-ink)',
                lineHeight: 1.6,
                minHeight: '140px',
                background: 'var(--color-surface)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-accent)';
                e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-accent-light)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.metaKey) {
                  e.preventDefault();
                  handleSubmit();
                }
                if (e.key === 'Escape') {
                  onCancel();
                }
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 border-t flex items-center justify-between"
          style={{
            borderColor: 'var(--color-border)',
            background: 'var(--color-paper)',
            borderRadius: '0 0 12px 12px',
          }}
        >
          <span className="text-xs" style={{ color: 'var(--color-ink-faded)' }}>
            <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--color-paper-dark)', border: '1px solid var(--color-border)' }}>&#8984;&#8629;</kbd>
            {' '}to create
          </span>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-sm rounded-md btn-ghost"
              style={{ color: 'var(--color-ink-muted)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!fileName.trim() || !prompt.trim()}
              className="px-4 py-1.5 text-sm rounded-md font-medium transition-all disabled:opacity-40"
              style={{
                background: (fileName.trim() && prompt.trim()) ? 'var(--color-accent)' : 'var(--color-border)',
                color: (fileName.trim() && prompt.trim()) ? 'var(--color-vim-insert-fg)' : 'var(--color-ink-faded)',
              }}
            >
              Create with Claude
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
