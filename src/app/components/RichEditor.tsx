'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { useEffect, useRef, useCallback, useState } from 'react';

interface RichEditorProps {
  content: string; // HTML content
  onChange?: (html: string) => void;
  initialBlockIndex?: number; // vim cursor position to focus on mount
  initialWordIndex?: number; // word within block to focus on mount
  isVisible?: boolean; // whether the editor is currently shown
  onCursorBlockChange?: (blockIndex: number) => void;
  onExit?: () => void; // called on jk escape sequence
  onEditorReady?: (editor: any) => void; // exposes TipTap editor to parent
}

const BubbleButton = ({
  onClick,
  isActive,
  title,
  children,
}: {
  onClick: () => void;
  isActive: boolean;
  title: string;
  children: React.ReactNode;
}) => (
  <button
    onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    title={title}
    className="p-1.5 rounded transition-colors"
    style={{
      background: isActive ? 'rgba(255,255,255,0.2)' : 'transparent',
      color: isActive ? '#fff' : 'rgba(255,255,255,0.7)',
    }}
    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = '#fff'; }}
    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
  >
    {children}
  </button>
);

export default function RichEditor({ content, onChange, initialBlockIndex, initialWordIndex, isVisible, onCursorBlockChange, onExit, onEditorReady }: RichEditorProps) {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const jkTimestampRef = useRef(0); // for jk escape sequence detection
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const onEditorReadyRef = useRef(onEditorReady);
  onEditorReadyRef.current = onEditorReady;

  const [bubblePos, setBubblePos] = useState<{ x: number; y: number } | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const onCursorBlockChangeRef = useRef(onCursorBlockChange);
  onCursorBlockChangeRef.current = onCursorBlockChange;

  // Flush onChange immediately — no debounce, so save never reads stale HTML
  const flushOnChange = useCallback((html: string) => {
    onChangeRef.current?.(html);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Underline,
      Link.configure({ openOnClick: false }),
    ],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      flushOnChange(editor.getHTML());
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;

      // Track which block the cursor is in — use the same selector as the viewer's getBlocks()
      // so indices match between edit and normal mode
      const proseMirror = editorContainerRef.current?.querySelector('.ProseMirror');
      if (proseMirror) {
        const blocks = Array.from(proseMirror.querySelectorAll(
          ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, ' +
          ':scope > p, :scope > ul > li, :scope > ol > li, :scope > blockquote, :scope > pre, ' +
          ':scope > table, :scope > hr, :scope > div:not(.ProseMirror-gapcursor)'
        ));
        const domAtPos = editor.view.domAtPos(from);
        let node: Node | null = domAtPos.node;
        // Walk up from cursor position to find which navigable block contains it
        while (node && node !== proseMirror) {
          if (node instanceof HTMLElement && blocks.includes(node)) {
            const idx = blocks.indexOf(node);
            if (idx >= 0) onCursorBlockChangeRef.current?.(idx);
            break;
          }
          node = node.parentNode;
        }
      }

      if (from === to) {
        setBubblePos(null);
        return;
      }
      // Get bounding rect of selection
      const view = editor.view;
      const start = view.coordsAtPos(from);
      const end = view.coordsAtPos(to);
      const mainEl = editorContainerRef.current?.closest('main');
      if (!mainEl) return;
      const mainRect = mainEl.getBoundingClientRect();
      setBubblePos({
        x: (start.left + end.right) / 2 - mainRect.left,
        y: start.top - mainRect.top - 8,
      });
    },
    editorProps: {
      attributes: {
        class: 'prose prose-editorial max-w-none min-h-[calc(100vh-14rem)] focus:outline-none',
      },
      handleKeyDown: (view, event) => {
        // jk escape sequence: j then k within 200ms exits edit mode
        if (event.key === 'j') {
          jkTimestampRef.current = Date.now();
          return false; // let j be typed normally
        }
        if (event.key === 'k' && jkTimestampRef.current && Date.now() - jkTimestampRef.current < 200) {
          jkTimestampRef.current = 0;
          // Delete the j that was just typed
          const { from } = view.state.selection;
          if (from > 0) {
            const charBefore = view.state.doc.textBetween(from - 1, from);
            if (charBefore === 'j') {
              view.dispatch(view.state.tr.delete(from - 1, from));
            }
          }
          onExitRef.current?.();
          return true; // prevent k from being typed
        }
        if (event.key !== 'j') {
          jkTimestampRef.current = 0;
        }
        return false;
      },
    },
  });

  // Expose editor instance to parent via callback
  useEffect(() => {
    if (editor) onEditorReadyRef.current?.(editor);
  }, [editor]);

  // Hide bubble on click outside
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (bubbleRef.current && !bubbleRef.current.contains(e.target as Node)) {
        // Will be handled by selection update
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  // Update content when prop changes
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  // Position cursor at the initial block every time editor becomes visible
  const wasVisible = useRef(false);
  useEffect(() => {
    if (!isVisible) {
      wasVisible.current = false;
      setBubblePos(null);
      return;
    }
    if (wasVisible.current) return;
    wasVisible.current = true;

    if (!editor || initialBlockIndex == null || initialBlockIndex < 0) return;

    requestAnimationFrame(() => {
      const proseMirror = editorContainerRef.current?.querySelector('.ProseMirror');
      if (!proseMirror) {
        editor.commands.focus('start');
        return;
      }

      const blocks = Array.from(proseMirror.querySelectorAll(
        ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, ' +
        ':scope > p, :scope > ul > li, :scope > ol > li, :scope > blockquote, :scope > pre, ' +
        ':scope > table, :scope > hr, :scope > div:not(.ProseMirror-gapcursor)'
      ));

      const targetBlock = blocks[initialBlockIndex] as HTMLElement | undefined;
      if (targetBlock) {
        try {
          const wordIdx = initialWordIndex ?? 0;
          if (wordIdx > 0) {
            const blockWords: { node: Text; startOffset: number; endOffset: number }[] = [];
            const textWalker = document.createTreeWalker(targetBlock, NodeFilter.SHOW_TEXT);
            let twNode: Text | null;
            while ((twNode = textWalker.nextNode() as Text | null)) {
              const txt = twNode.textContent || '';
              const regex = /\S+/g;
              let match: RegExpExecArray | null;
              while ((match = regex.exec(txt)) !== null) {
                blockWords.push({ node: twNode, startOffset: match.index, endOffset: match.index + match[0].length });
              }
            }
            const wordTarget = blockWords[Math.min(wordIdx, blockWords.length - 1)];
            if (wordTarget) {
              const pos = editor.view.posAtDOM(wordTarget.node, wordTarget.startOffset);
              editor.chain().focus().setTextSelection(pos).run();
            } else {
              const pos = editor.view.posAtDOM(targetBlock, 0);
              editor.chain().focus().setTextSelection(pos).run();
            }
          } else {
            const pos = editor.view.posAtDOM(targetBlock, 0);
            editor.chain().focus().setTextSelection(pos).run();
          }
          targetBlock.scrollIntoView({ block: 'center' });
        } catch {
          editor.commands.focus('start');
        }
      } else {
        editor.commands.focus('start');
      }
    });
  }, [editor, initialBlockIndex, initialWordIndex, isVisible]);

  return (
    <div ref={editorContainerRef}>
      {/* Floating bubble menu — appears on text selection, no layout impact */}
      {editor && bubblePos && (
        <div
          ref={bubbleRef}
          className="absolute z-20 animate-fade-in"
          style={{
            left: bubblePos.x,
            top: bubblePos.y,
            transform: 'translate(-50%, -100%)',
            pointerEvents: 'auto',
          }}
        >
          <div
            className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg"
            style={{
              background: 'var(--color-ink, #1a1a2e)',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}
          >
            <BubbleButton
              onClick={() => editor.chain().focus().toggleBold().run()}
              isActive={editor.isActive('bold')}
              title="Bold (⌘B)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
                <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
              </svg>
            </BubbleButton>
            <BubbleButton
              onClick={() => editor.chain().focus().toggleItalic().run()}
              isActive={editor.isActive('italic')}
              title="Italic (⌘I)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="19" y1="4" x2="10" y2="4"/>
                <line x1="14" y1="20" x2="5" y2="20"/>
                <line x1="15" y1="4" x2="9" y2="20"/>
              </svg>
            </BubbleButton>
            <BubbleButton
              onClick={() => editor.chain().focus().toggleStrike().run()}
              isActive={editor.isActive('strike')}
              title="Strikethrough"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.3 4.9c-2.3-.6-4.4-1-6.2-.9-2.7 0-5.3.7-5.3 3.6 0 1.5 1.1 2.5 3.3 3.1"/>
                <line x1="4" y1="12" x2="20" y2="12"/>
                <path d="M17.3 13.1c.9.4 1.7 1.1 1.7 2.3 0 2.9-2.7 3.6-5.3 3.6-2.3 0-4.7-.5-6.7-1.5"/>
              </svg>
            </BubbleButton>

            <div className="w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,0.2)' }} />

            <BubbleButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              isActive={editor.isActive('heading', { level: 1 })}
              title="Heading 1"
            >
              <span className="text-xs font-bold">H1</span>
            </BubbleButton>
            <BubbleButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              isActive={editor.isActive('heading', { level: 2 })}
              title="Heading 2"
            >
              <span className="text-xs font-bold">H2</span>
            </BubbleButton>
            <BubbleButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              isActive={editor.isActive('heading', { level: 3 })}
              title="Heading 3"
            >
              <span className="text-xs font-bold">H3</span>
            </BubbleButton>

            <div className="w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,0.2)' }} />

            <BubbleButton
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              isActive={editor.isActive('bulletList')}
              title="Bullet List"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="9" y1="6" x2="20" y2="6"/>
                <line x1="9" y1="12" x2="20" y2="12"/>
                <line x1="9" y1="18" x2="20" y2="18"/>
                <circle cx="4" cy="6" r="1.5" fill="currentColor"/>
                <circle cx="4" cy="12" r="1.5" fill="currentColor"/>
                <circle cx="4" cy="18" r="1.5" fill="currentColor"/>
              </svg>
            </BubbleButton>
            <BubbleButton
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              isActive={editor.isActive('orderedList')}
              title="Numbered List"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="10" y1="6" x2="21" y2="6"/>
                <line x1="10" y1="12" x2="21" y2="12"/>
                <line x1="10" y1="18" x2="21" y2="18"/>
                <text x="2" y="8" fontSize="8" fill="currentColor">1</text>
                <text x="2" y="14" fontSize="8" fill="currentColor">2</text>
                <text x="2" y="20" fontSize="8" fill="currentColor">3</text>
              </svg>
            </BubbleButton>
            <BubbleButton
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              isActive={editor.isActive('blockquote')}
              title="Quote"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21"/>
                <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3"/>
              </svg>
            </BubbleButton>
            <BubbleButton
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              isActive={editor.isActive('codeBlock')}
              title="Code Block"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 18 22 12 16 6"/>
                <polyline points="8 6 2 12 8 18"/>
              </svg>
            </BubbleButton>
          </div>
        </div>
      )}

      {/* Editor content — no toolbar, zero layout shift */}
      <EditorContent editor={editor} />
    </div>
  );
}
