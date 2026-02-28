'use client';

import { useEditor, EditorContent, ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import ImageNodeView from './ImageNodeView';
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
}) => {
  const [showTip, setShowTip] = useState(false);
  return (
    <div className="relative" onMouseEnter={() => setShowTip(true)} onMouseLeave={() => setShowTip(false)}>
      <button
        onMouseDown={(e) => { e.preventDefault(); onClick(); }}
        className="p-1.5 rounded transition-colors"
        style={{
          background: isActive ? 'rgba(255,255,255,0.2)' : 'transparent',
          color: isActive ? '#fff' : 'rgba(255,255,255,0.7)',
        }}
      >
        {children}
      </button>
      {showTip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap pointer-events-none z-50"
          style={{ background: 'var(--color-ink)', color: 'var(--color-paper)', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
          {title}
        </div>
      )}
    </div>
  );
};

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
  const [tableToolbarPos, setTableToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const tableToolbarRef = useRef<HTMLDivElement>(null);
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
      Highlight,
      Link.configure({ openOnClick: false }),
      Image.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            width: { default: null, renderHTML: attrs => attrs.width ? { width: attrs.width } : {} },
            align: { default: 'center', renderHTML: attrs => ({ 'data-align': attrs.align }) },
          };
        },
        addNodeView() {
          return ReactNodeViewRenderer(ImageNodeView);
        },
      }).configure({ inline: false, allowBase64: true }),
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

      // Table context toolbar — show when cursor is in a table
      if (editor.isActive('table')) {
        const view = editor.view;
        const coords = view.coordsAtPos(from);
        // Find the table DOM element to position toolbar at its top-right
        const domAtPos = view.domAtPos(from);
        let tableEl: HTMLElement | null = null;
        let el: Node | null = domAtPos.node;
        while (el) {
          if (el instanceof HTMLElement && el.tagName === 'TABLE') { tableEl = el; break; }
          el = el.parentNode;
        }
        if (tableEl) {
          const tableRect = tableEl.getBoundingClientRect();
          const ttW = tableToolbarRef.current?.offsetWidth ?? 300;
          const ttHalf = ttW / 2 + 12;
          const ttX = Math.max(ttHalf, Math.min(tableRect.left + tableRect.width / 2, window.innerWidth - ttHalf));
          setTableToolbarPos({ x: ttX, y: tableRect.top - 8 });
        }
      } else {
        setTableToolbarPos(null);
      }

      if (from === to) {
        setBubblePos(null);
        return;
      }
      // Get bounding rect of selection (viewport coords)
      const view = editor.view;
      const start = view.coordsAtPos(from);
      const end = view.coordsAtPos(to);
      const rawX = (start.left + end.right) / 2;
      // Measure toolbar width to clamp; fallback to 350 if not yet rendered
      const toolbarW = bubbleRef.current?.offsetWidth ?? 350;
      const half = toolbarW / 2 + 12;
      const clampedX = Math.max(half, Math.min(rawX, window.innerWidth - half));
      setBubblePos({
        x: clampedX,
        y: start.top - 8,
      });
    },
    editorProps: {
      attributes: {
        class: 'prose prose-editorial max-w-none min-h-[calc(100vh-14rem)] focus:outline-none',
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (!file) return false;
            const reader = new FileReader();
            reader.onload = (e) => {
              const src = e.target?.result as string;
              view.dispatch(view.state.tr.replaceSelectionWith(
                view.state.schema.nodes.image.create({ src })
              ));
            };
            reader.readAsDataURL(file);
            return true;
          }
        }
        return false;
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;
        for (const file of Array.from(files)) {
          if (file.type.startsWith('image/')) {
            event.preventDefault();
            const reader = new FileReader();
            reader.onload = (e) => {
              const src = e.target?.result as string;
              const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
              if (pos) {
                view.dispatch(view.state.tr.insert(pos.pos,
                  view.state.schema.nodes.image.create({ src })
                ));
              }
            };
            reader.readAsDataURL(file);
            return true;
          }
        }
        return false;
      },
      handleKeyDown: (view, event) => {
        // Cmd+Shift+H toggles highlight
        if (event.key === 'h' && event.metaKey && event.shiftKey) {
          event.preventDefault();
          editor?.chain().focus().toggleHighlight().run();
          return true;
        }
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

  // Update content when prop changes (deferred to avoid flushSync inside lifecycle)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      queueMicrotask(() => editor.commands.setContent(content));
    }
  }, [content, editor]);

  // Position cursor at the initial block every time editor becomes visible
  const wasVisible = useRef(false);
  useEffect(() => {
    if (!isVisible) {
      wasVisible.current = false;
      setBubblePos(null);
      setTableToolbarPos(null);
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
          // Special blocks (table, hr, img) — skip word-level positioning, just place cursor at block start
          const tag = targetBlock.tagName.toLowerCase();
          const isSpecialBlock = tag === 'table' || tag === 'hr' || tag === 'img' || targetBlock.querySelector('img');
          const wordIdx = isSpecialBlock ? 0 : (initialWordIndex ?? 0);
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

  // Reset positioning flag when content changes so cursor re-positions on next visibility toggle
  useEffect(() => {
    wasVisible.current = false;
  }, [content]);


  return (
    <div ref={editorContainerRef}>
      {/* Floating bubble menu — appears on text selection, no layout impact */}
      {editor && bubblePos && (
        <div
          ref={bubbleRef}
          className="fixed z-20 animate-fade-in"
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
              background: 'var(--color-overlay, #1a1a2e)',
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
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              isActive={editor.isActive('underline')}
              title="Underline (⌘U)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/>
                <line x1="4" y1="21" x2="20" y2="21"/>
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
            <BubbleButton
              onClick={() => editor.chain().focus().toggleHighlight().run()}
              isActive={editor.isActive('highlight')}
              title="Highlight (⌘⇧H)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
            </BubbleButton>
            <BubbleButton
              onClick={() => {
                const url = window.prompt('URL');
                if (url) editor.chain().focus().setLink({ href: url }).run();
                else editor.chain().focus().unsetLink().run();
              }}
              isActive={editor.isActive('link')}
              title="Link (⌘K)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </BubbleButton>
            <BubbleButton
              onClick={() => editor.chain().focus().toggleCode().run()}
              isActive={editor.isActive('code')}
              title="Inline Code"
            >
              <span className="text-xs font-mono font-bold">{'{}'}</span>
            </BubbleButton>
            <BubbleButton
              onClick={() => editor.chain().focus().unsetAllMarks().run()}
              isActive={false}
              title="Clear Formatting"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7V4h16v3"/>
                <path d="M9 20h6"/>
                <path d="M12 4v16"/>
                <line x1="4" y1="20" x2="20" y2="4" strokeWidth="1.5" strokeDasharray="2 2"/>
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

            <div className="w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,0.2)' }} />

            <BubbleButton
              onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
              isActive={false}
              title="Insert Table"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/>
                <line x1="3" y1="15" x2="21" y2="15"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
                <line x1="15" y1="3" x2="15" y2="21"/>
              </svg>
            </BubbleButton>
            <BubbleButton
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
              isActive={false}
              title="Horizontal Rule"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12"/>
              </svg>
            </BubbleButton>
            <BubbleButton
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = () => {
                  const file = input.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (e) => {
                    const src = e.target?.result as string;
                    editor.chain().focus().setImage({ src }).run();
                  };
                  reader.readAsDataURL(file);
                };
                input.click();
              }}
              isActive={false}
              title="Insert Image"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <path d="m21 15-5-5L5 21"/>
              </svg>
            </BubbleButton>
          </div>
        </div>
      )}

      {/* Table context toolbar — appears when cursor is inside a table */}
      {editor && tableToolbarPos && (
        <div
          ref={tableToolbarRef}
          className="fixed z-20 animate-fade-in"
          style={{
            left: tableToolbarPos.x,
            top: tableToolbarPos.y,
            transform: 'translate(-50%, -100%)',
            pointerEvents: 'auto',
          }}
        >
          <div
            className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg"
            style={{
              background: 'var(--color-overlay, #1a1a2e)',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}
          >
            <BubbleButton onClick={() => editor.chain().focus().addColumnBefore().run()} isActive={false} title="Add Column Before">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="6" y="3" width="15" height="18" rx="2"/><line x1="11" y1="3" x2="11" y2="21"/>
                <line x1="3" y1="9" x2="3" y2="15"/><line x1="0" y1="12" x2="6" y2="12"/>
              </svg>
            </BubbleButton>
            <BubbleButton onClick={() => editor.chain().focus().addColumnAfter().run()} isActive={false} title="Add Column After">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="15" height="18" rx="2"/><line x1="13" y1="3" x2="13" y2="21"/>
                <line x1="21" y1="9" x2="21" y2="15"/><line x1="18" y1="12" x2="24" y2="12"/>
              </svg>
            </BubbleButton>
            <BubbleButton onClick={() => editor.chain().focus().deleteColumn().run()} isActive={false} title="Delete Column">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="6" y="3" width="12" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>
              </svg>
            </BubbleButton>

            <div className="w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,0.2)' }} />

            <BubbleButton onClick={() => editor.chain().focus().addRowBefore().run()} isActive={false} title="Add Row Above">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="6" width="18" height="15" rx="2"/><line x1="3" y1="11" x2="21" y2="11"/>
                <line x1="9" y1="3" x2="15" y2="3"/><line x1="12" y1="0" x2="12" y2="6"/>
              </svg>
            </BubbleButton>
            <BubbleButton onClick={() => editor.chain().focus().addRowAfter().run()} isActive={false} title="Add Row Below">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="15" rx="2"/><line x1="3" y1="13" x2="21" y2="13"/>
                <line x1="9" y1="21" x2="15" y2="21"/><line x1="12" y1="18" x2="12" y2="24"/>
              </svg>
            </BubbleButton>
            <BubbleButton onClick={() => editor.chain().focus().deleteRow().run()} isActive={false} title="Delete Row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="6" width="18" height="12" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>
              </svg>
            </BubbleButton>

            <div className="w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,0.2)' }} />

            <BubbleButton onClick={() => editor.chain().focus().mergeCells().run()} isActive={false} title="Merge Cells">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/>
                <polyline points="8 10 12 6 16 10"/><polyline points="8 14 12 18 16 14"/>
              </svg>
            </BubbleButton>
            <BubbleButton onClick={() => editor.chain().focus().splitCell().run()} isActive={false} title="Split Cell">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/>
                <polyline points="8 6 12 10 16 6"/><polyline points="8 18 12 14 16 18"/>
              </svg>
            </BubbleButton>
            <BubbleButton onClick={() => editor.chain().focus().toggleHeaderRow().run()} isActive={false} title="Toggle Header Row">
              <span className="text-xs font-bold">H</span>
            </BubbleButton>

            <div className="w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,0.2)' }} />

            <BubbleButton onClick={() => editor.chain().focus().deleteTable().run()} isActive={false} title="Delete Table">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>
                <line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
                <line x1="5" y1="5" x2="19" y2="19" stroke="rgba(239,68,68,0.8)" strokeWidth="2"/>
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
