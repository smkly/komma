'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// --- Types ---

export type VimMode = 'NORMAL' | 'INSERT' | 'OPERATOR_PENDING' | 'VISUAL';
export type VimOperator = 'd' | 'c' | 'y' | null;

interface WordInfo {
  text: string;
  node: Text;
  startOffset: number;
  endOffset: number;
}

export interface UseVimOptions {
  mainRef: React.RefObject<HTMLElement | null>;
  getBlocks: () => HTMLElement[];
  editorRef: React.RefObject<any>;
  isEditMode: boolean;
  toggleEditMode: () => void;
  saveDocument: () => void;
  markdown: string;
  setMarkdown: (md: string) => void;
  filePath: string;
  openSearch: () => void;
}

export interface UseVimReturn {
  mode: VimMode;
  blockIndex: number;
  wordIndex: number;
  operator: VimOperator;
  register: string;
  selectionAnchor: number | null;
  enabled: boolean;
  handleKeyDown: (e: KeyboardEvent) => void;
  handleArticleClick: (e: React.MouseEvent) => void;
  setBlockIndex: (idx: number) => void;
  setWordIndex: (idx: number) => void;
  toggleEnabled: () => void;
  exitInsertMode: () => void;
  statusText: string;
  modeLabel: string;
  selectWordOnEdit: boolean;
  insertPosition: 'at' | 'after' | 'start' | 'end';
}

// --- Hook ---

export function useVim({
  mainRef,
  getBlocks,
  editorRef,
  isEditMode,
  toggleEditMode,
  saveDocument,
  markdown,
  setMarkdown,
  filePath,
  openSearch,
}: UseVimOptions): UseVimReturn {
  // --- Core state ---
  const [mode, setMode] = useState<VimMode>('NORMAL');
  const [blockIndex, setBlockIndex] = useState(0);
  const [wordIndex, setWordIndex] = useState(0);
  const [operator, setOperator] = useState<VimOperator>(null);
  const [register, setRegister] = useState('');
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [selectWordOnEdit, setSelectWordOnEdit] = useState(false);
  const [insertPosition, setInsertPosition] = useState<'at' | 'after' | 'start' | 'end'>('at');

  // --- Refs (for stable access in handlers) ---
  const modeRef = useRef<VimMode>('NORMAL');
  modeRef.current = mode;
  const blockIndexRef = useRef(0);
  blockIndexRef.current = blockIndex;
  const wordIndexRef = useRef(0);
  wordIndexRef.current = wordIndex;
  const operatorRef = useRef<VimOperator>(null);
  operatorRef.current = operator;
  const registerRef = useRef('');
  registerRef.current = register;
  const selectionAnchorRef = useRef<number | null>(null);
  selectionAnchorRef.current = selectionAnchor;
  const enabledRef = useRef(true);
  enabledRef.current = enabled;
  const isEditModeRef = useRef(false);
  isEditModeRef.current = isEditMode;
  const markdownRef = useRef(markdown);
  markdownRef.current = markdown;

  // Wrap setMarkdown to also update local ref synchronously (for multi-op loops)
  const setMarkdownLocal = useCallback((md: string) => {
    markdownRef.current = md;
    setMarkdown(md);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setMarkdown]);
  // All markdown mutations below must use setMarkdownLocal (not setMarkdown) to keep ref in sync

  const lastGRef = useRef(0); // for gg detection
  const overlayRef = useRef<HTMLDivElement | null>(null); // persistent word cursor overlay
  const updateOverlayRef = useRef<() => void>(() => {}); // ref to avoid declaration order issues
  const navSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null); // debounce state sync

  // --- localStorage persistence ---
  useEffect(() => {
    const saved = localStorage.getItem('helm-vim-mode');
    if (saved !== null) setEnabled(saved !== 'false');
  }, []);

  const toggleEnabled = useCallback(() => {
    setEnabled(prev => {
      const next = !prev;
      localStorage.setItem('helm-vim-mode', String(next));
      return next;
    });
  }, []);

  // --- Reset cursor on document change ---
  useEffect(() => {
    setBlockIndex(0);
    setWordIndex(0);
    setSelectionAnchor(null);
    setOperator(null);
    setMode('NORMAL');
  }, [filePath]);

  // --- Sync mode with edit mode ---
  useEffect(() => {
    if (isEditMode) {
      setMode('INSERT');
    } else {
      setMode('NORMAL');
      setOperator(null);
    }
  }, [isEditMode]);

  // --- Word extraction helper ---
  const getWordsInBlock = useCallback((block: HTMLElement): WordInfo[] => {
    const words: WordInfo[] = [];
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let textNode: Text | null;
    while ((textNode = walker.nextNode() as Text | null)) {
      const content = textNode.textContent || '';
      const regex = /\S+/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        words.push({
          text: match[0],
          node: textNode,
          startOffset: match.index,
          endOffset: match.index + match[0].length,
        });
      }
    }
    return words;
  }, []);

  // --- Markdown helpers (operators work on markdown, not ProseMirror) ---

  // Map DOM block indices to markdown line ranges
  const getMarkdownBlockMap = useCallback((): { lineStart: number; lineEnd: number }[] => {
    const md = markdownRef.current;
    const lines = md.split('\n');
    const blocks: { lineStart: number; lineEnd: number }[] = [];
    let i = 0;

    // Skip YAML frontmatter (---\n...\n---) — not rendered in DOM
    if (lines[0]?.trim() === '---') {
      i = 1;
      while (i < lines.length && lines[i].trim() !== '---') i++;
      if (i < lines.length) i++; // skip closing ---
    }

    while (i < lines.length) {
      if (lines[i].trim() === '') { i++; continue; }
      const line = lines[i];

      // Code fence
      if (/^```/.test(line)) {
        const start = i;
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) i++;
        if (i < lines.length) i++;
        blocks.push({ lineStart: start, lineEnd: i - 1 });
        continue;
      }

      // Heading
      if (/^#{1,6}\s/.test(line)) {
        blocks.push({ lineStart: i, lineEnd: i });
        i++;
        continue;
      }

      // HR
      if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
        blocks.push({ lineStart: i, lineEnd: i });
        i++;
        continue;
      }

      // List item (each item is one block)
      if (/^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
        blocks.push({ lineStart: i, lineEnd: i });
        i++;
        continue;
      }

      // Blockquote
      if (/^>\s/.test(line)) {
        blocks.push({ lineStart: i, lineEnd: i });
        i++;
        continue;
      }

      // Paragraph — consecutive non-blank, non-special lines
      const start = i;
      i++;
      while (i < lines.length && lines[i].trim() !== '' &&
             !/^#{1,6}\s/.test(lines[i]) &&
             !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i].trim()) &&
             !/^\s*[-*+]\s/.test(lines[i]) &&
             !/^\s*\d+\.\s/.test(lines[i]) &&
             !/^>\s/.test(lines[i]) &&
             !/^```/.test(lines[i])) {
        i++;
      }
      blocks.push({ lineStart: start, lineEnd: i - 1 });
    }

    return blocks;
  }, []);

  // Get text of a block from DOM (not ProseMirror)
  const getBlockText = useCallback((blockIdx: number): string => {
    const blocks = getBlocks();
    return blocks[blockIdx]?.textContent?.trim() || '';
  }, [getBlocks]);

  // Delete a word from markdown by block index and word index
  // Returns the deleted word text (for yank register)
  const deleteWordFromMarkdown = useCallback((blockIdx: number, wordIdx: number): string => {
    const blocks = getBlocks();
    const block = blocks[blockIdx];
    if (!block) return '';

    const words = getWordsInBlock(block);
    if (wordIdx >= words.length || words.length === 0) return '';
    const wordText = words[wordIdx].text;

    // Count occurrences of this word text before wordIdx
    let occurrence = 0;
    for (let i = 0; i < wordIdx; i++) {
      if (words[i].text === wordText) occurrence++;
    }

    const mdBlockMap = getMarkdownBlockMap();
    if (blockIdx >= mdBlockMap.length) return '';

    const md = markdownRef.current;
    const lines = md.split('\n');
    const mdBlock = mdBlockMap[blockIdx];
    const blockLines = lines.slice(mdBlock.lineStart, mdBlock.lineEnd + 1);
    let blockMd = blockLines.join('\n');


    // Find the Nth occurrence of wordText in the markdown, with optional surrounding formatting
    const escaped = wordText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match word with optional surrounding *, _, ` markers
    const pattern = new RegExp(`[*_\`]*${escaped}[*_\`]*`, 'g');

    let matchCount = 0;
    let found = false;
    blockMd = blockMd.replace(pattern, (match) => {
      if (found) return match;
      if (matchCount === occurrence) {
        found = true;
        return '';
      }
      matchCount++;
      return match;
    });

    if (!found) return '';

    // Normalize spaces (collapse multiple spaces, trim line ends)
    blockMd = blockMd.replace(/  +/g, ' ').split('\n').map(l => l.trimEnd()).join('\n');

    const newLines = [...lines];
    newLines.splice(mdBlock.lineStart, mdBlock.lineEnd - mdBlock.lineStart + 1, ...blockMd.split('\n'));
    setMarkdownLocal(newLines.join('\n'));

    return wordText;
  }, [getBlocks, getWordsInBlock, getMarkdownBlockMap, setMarkdownLocal]);

  // Delete a range of words from a block (inclusive, fromWord to toWord)
  const deleteWordRangeFromMarkdown = useCallback((blockIdx: number, fromWord: number, toWord: number): string => {
    const blocks = getBlocks();
    const block = blocks[blockIdx];
    if (!block) return '';

    const words = getWordsInBlock(block);
    if (words.length === 0) return '';
    const from = Math.max(0, fromWord);
    const to = Math.min(words.length - 1, toWord);
    if (from > to) return '';

    // Build the text being deleted
    const deletedText = words.slice(from, to + 1).map(w => w.text).join(' ');

    // Delete words one at a time from right to left so indices stay valid
    const mdBlockMap = getMarkdownBlockMap();
    if (blockIdx >= mdBlockMap.length) return '';

    const md = markdownRef.current;
    const lines = md.split('\n');
    const mdBlock = mdBlockMap[blockIdx];
    const blockLines = lines.slice(mdBlock.lineStart, mdBlock.lineEnd + 1);
    let blockMd = blockLines.join('\n');

    // For each word to delete (from right to left), find and remove it
    for (let wi = to; wi >= from; wi--) {
      const wText = words[wi].text;
      // Count occurrences before this word index
      let occ = 0;
      for (let j = 0; j < wi; j++) {
        if (words[j].text === wText) occ++;
      }

      const escaped = wText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`[*_\`]*${escaped}[*_\`]*`, 'g');
      let matchCount = 0;
      let foundMatch = false;
      blockMd = blockMd.replace(pattern, (match) => {
        if (foundMatch) return match;
        if (matchCount === occ) {
          foundMatch = true;
          return '';
        }
        matchCount++;
        return match;
      });
    }

    blockMd = blockMd.replace(/  +/g, ' ').split('\n').map(l => l.trimEnd()).join('\n');

    const newLines = [...lines];
    newLines.splice(mdBlock.lineStart, mdBlock.lineEnd - mdBlock.lineStart + 1, ...blockMd.split('\n'));
    setMarkdownLocal(newLines.join('\n'));

    return deletedText;
  }, [getBlocks, getWordsInBlock, getMarkdownBlockMap, setMarkdown]);

  // Insert text into markdown at a specific word position
  const pasteTextInMarkdown = useCallback((blockIdx: number, wordIdx: number, text: string, position: 'before' | 'after') => {
    const blocks = getBlocks();
    const block = blocks[blockIdx];
    if (!block) return;

    const words = getWordsInBlock(block);

    const mdBlockMap = getMarkdownBlockMap();
    if (blockIdx >= mdBlockMap.length) return;

    const md = markdownRef.current;
    const lines = md.split('\n');
    const mdBlock = mdBlockMap[blockIdx];
    const blockLines = lines.slice(mdBlock.lineStart, mdBlock.lineEnd + 1);
    let blockMd = blockLines.join('\n');

    if (words.length === 0) {
      // Empty block — just append the text
      blockMd = blockMd + ' ' + text;
    } else {
      const wi = Math.min(wordIdx, words.length - 1);
      const wordText = words[wi].text;

      // Count occurrences before this word
      let occurrence = 0;
      for (let j = 0; j < wi; j++) {
        if (words[j].text === wordText) occurrence++;
      }

      const escaped = wordText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`[*_\`]*${escaped}[*_\`]*`, 'g');
      let matchCount = 0;
      let found = false;
      blockMd = blockMd.replace(pattern, (match) => {
        if (found) return match;
        if (matchCount === occurrence) {
          found = true;
          return position === 'before' ? text + ' ' + match : match + ' ' + text;
        }
        matchCount++;
        return match;
      });
    }

    blockMd = blockMd.replace(/  +/g, ' ').split('\n').map(l => l.trimEnd()).join('\n');

    const newLines = [...lines];
    newLines.splice(mdBlock.lineStart, mdBlock.lineEnd - mdBlock.lineStart + 1, ...blockMd.split('\n'));
    setMarkdownLocal(newLines.join('\n'));
  }, [getBlocks, getWordsInBlock, getMarkdownBlockMap, setMarkdownLocal]);

  const executeBlockDelete = useCallback((blockIdx: number) => {
    // Delete a full block by manipulating markdown
    const md = markdownRef.current;
    const lines = md.split('\n');
    const blocks = getBlocks();
    const block = blocks[blockIdx];
    if (!block) return;

    const blockText = block.textContent?.trim() || '';
    if (!blockText) return;

    // Find the paragraph/block in markdown that matches this block's text
    // Strategy: find a line containing the block text
    let startLine = -1;
    let endLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() && blockText.startsWith(lines[i].replace(/^#+\s*/, '').replace(/^\s*[-*]\s*/, '').replace(/^\s*\d+\.\s*/, '').replace(/^>\s*/, '').trim().substring(0, 20))) {
        startLine = i;
        endLine = i;
        // Extend to blank line or end
        while (endLine < lines.length - 1 && lines[endLine + 1].trim() !== '') {
          // Stop if next line looks like a new block (heading, list item, etc.)
          if (/^(#{1,6}\s|[-*]\s|\d+\.\s|>\s)/.test(lines[endLine + 1])) break;
          endLine++;
        }
        break;
      }
    }

    if (startLine >= 0) {
      const newLines = [...lines];
      // Remove the block lines and any trailing blank line
      const removeCount = endLine - startLine + 1;
      newLines.splice(startLine, removeCount);
      // Clean up double blank lines
      const newMd = newLines.join('\n').replace(/\n{3,}/g, '\n\n');
      setMarkdownLocal(newMd);
    }
  }, [getBlocks, setMarkdownLocal]);

  const executeOperator = useCallback((op: VimOperator, motion: string) => {
    if (!op) return;
    const bi = blockIndexRef.current;
    const wi = wordIndexRef.current;

    // Determine the range based on motion
    if (motion === 'w' || motion === 'l' || motion === 'e') {
      // Word forward — delete/yank the word under cursor
      if (op === 'y') {
        const text = getBlockText(bi);
        const blocks = getBlocks();
        const block = blocks[bi];
        if (block) {
          const words = getWordsInBlock(block);
          if (wi < words.length) setRegister(words[wi].text);
        }
      } else {
        const deleted = deleteWordFromMarkdown(bi, wi);
        if (deleted && op === 'd') setRegister(deleted);
        if (op === 'c') {
          setSelectWordOnEdit(false);
          toggleEditMode();
        }
      }
    } else if (motion === 'b' || motion === 'h') {
      // Word backward
      const prevWi = wi > 0 ? wi - 1 : 0;
      const prevBi = wi > 0 ? bi : Math.max(0, bi - 1);
      const actualWi = wi > 0 ? prevWi : (() => {
        const blocks = getBlocks();
        const prevBlock = blocks[prevBi];
        if (!prevBlock) return 0;
        const words = getWordsInBlock(prevBlock);
        return Math.max(0, words.length - 1);
      })();

      if (op === 'y') {
        const blocks = getBlocks();
        const block = blocks[prevBi];
        if (block) {
          const words = getWordsInBlock(block);
          if (actualWi < words.length) setRegister(words[actualWi].text);
        }
      } else {
        const deleted = deleteWordFromMarkdown(prevBi, actualWi);
        if (deleted && op === 'd') setRegister(deleted);
        setWordIndex(actualWi);
        if (wi === 0 && bi > 0) setBlockIndex(prevBi);
        if (op === 'c') {
          setSelectWordOnEdit(false);
          toggleEditMode();
        }
      }
    } else if (motion === 'd' || motion === 'c' || motion === 'y') {
      // Line operation (dd/cc/yy)
      const blockText = getBlockText(bi);
      if (op === 'y') {
        setRegister(blockText);
      } else {
        executeBlockDelete(bi);
        // Adjust cursor
        const blocks = getBlocks();
        if (bi >= blocks.length - 1 && bi > 0) {
          setBlockIndex(bi - 1);
        }
        setWordIndex(0);
        if (op === 'c') {
          setSelectWordOnEdit(false);
          toggleEditMode();
        }
      }
    } else if (motion === '$') {
      // To end of block
      const blocks = getBlocks();
      const block = blocks[bi];
      if (!block) return;
      const words = getWordsInBlock(block);
      if (words.length === 0) return;

      if (op === 'y') {
        const text = words.slice(wi).map(w => w.text).join(' ');
        setRegister(text);
      } else {
        const deleted = deleteWordRangeFromMarkdown(bi, wi, words.length - 1);
        if (deleted && op === 'd') setRegister(deleted);
        const newWi = Math.max(0, wi - 1);
        setWordIndex(newWi);
        if (op === 'c') {
          setSelectWordOnEdit(false);
          toggleEditMode();
        }
      }
    } else if (motion === '0') {
      // To start of block
      const blocks = getBlocks();
      const block = blocks[bi];
      if (!block) return;
      const words = getWordsInBlock(block);
      if (words.length === 0) return;

      if (op === 'y') {
        const text = words.slice(0, wi + 1).map(w => w.text).join(' ');
        setRegister(text);
      } else {
        const deleted = deleteWordRangeFromMarkdown(bi, 0, wi);
        if (deleted && op === 'd') setRegister(deleted);
        setWordIndex(0);
        if (op === 'c') {
          setSelectWordOnEdit(false);
          toggleEditMode();
        }
      }
    } else if (motion === 'j') {
      // Delete current block + next block (dj)
      const blockText = getBlockText(bi);
      if (op === 'y') {
        const nextText = getBlockText(bi + 1);
        setRegister(blockText + '\n' + nextText);
      } else {
        executeBlockDelete(bi + 1);
        executeBlockDelete(bi);
        setWordIndex(0);
        if (op === 'c') {
          setSelectWordOnEdit(false);
          toggleEditMode();
        }
      }
    } else if (motion === 'k') {
      // Delete previous block + current block (dk)
      if (bi > 0) {
        const blockText = getBlockText(bi);
        if (op === 'y') {
          const prevText = getBlockText(bi - 1);
          setRegister(prevText + '\n' + blockText);
        } else {
          executeBlockDelete(bi);
          executeBlockDelete(bi - 1);
          setBlockIndex(Math.max(0, bi - 1));
          setWordIndex(0);
          if (op === 'c') {
            setSelectWordOnEdit(false);
            toggleEditMode();
          }
        }
      }
    } else if (motion === 'G') {
      // To end of document (yank only — dG/cG too destructive)
      if (op === 'y') {
        const blocks = getBlocks();
        let text = '';
        for (let i = bi; i < blocks.length; i++) {
          if (text) text += '\n';
          text += getBlockText(i);
        }
        setRegister(text);
      }
    } else if (motion === 'g') {
      // To start of document (ygg)
      if (op === 'y') {
        let text = '';
        for (let i = 0; i <= bi; i++) {
          if (text) text += '\n';
          text += getBlockText(i);
        }
        setRegister(text);
      }
    }
  }, [getBlockText, deleteWordFromMarkdown, deleteWordRangeFromMarkdown, executeBlockDelete, getBlocks, getWordsInBlock, toggleEditMode]);

  // Execute visual mode operator
  const executeVisualOperator = useCallback((op: VimOperator) => {
    if (!op) return;
    const anchor = selectionAnchorRef.current;
    const cursor = blockIndexRef.current;
    if (anchor === null) return;

    const lo = Math.min(anchor, cursor);
    const hi = Math.max(anchor, cursor);

    if (op === 'y') {
      let text = '';
      for (let i = lo; i <= hi; i++) {
        if (text) text += '\n';
        text += getBlockText(i);
      }
      setRegister(text);
    } else {
      // Delete from hi to lo (reverse order to preserve indices)
      for (let i = hi; i >= lo; i--) {
        executeBlockDelete(i);
      }
      setBlockIndex(lo);
      setWordIndex(0);
      if (op === 'c') {
        setSelectWordOnEdit(false);
        toggleEditMode();
      }
    }

    setSelectionAnchor(null);
    setMode('NORMAL');
  }, [getBlockText, executeBlockDelete, toggleEditMode]);

  // --- Navigation helpers ---

  // Debounced state sync — refs update immediately, React state syncs after 80ms idle
  const syncNavState = useCallback(() => {
    if (navSyncTimer.current) clearTimeout(navSyncTimer.current);
    navSyncTimer.current = setTimeout(() => {
      setBlockIndex(blockIndexRef.current);
      setWordIndex(wordIndexRef.current);
    }, 80);
  }, []);

  const moveBlockCursor = useCallback((delta: number) => {
    const blocks = getBlocks();
    if (blocks.length === 0) return;
    const next = Math.max(0, Math.min(blocks.length - 1, blockIndexRef.current + delta));
    blockIndexRef.current = next;
    wordIndexRef.current = 0;
    // Imperative block cursor class swap
    blocks.forEach(b => { b.classList.remove('vim-block-cursor'); b.classList.remove('vim-block-selected'); });
    if (selectionAnchorRef.current !== null) {
      const lo = Math.min(selectionAnchorRef.current, next);
      const hi = Math.max(selectionAnchorRef.current, next);
      for (let i = lo; i <= hi; i++) {
        blocks[i]?.classList.add(i === next ? 'vim-block-cursor' : 'vim-block-selected');
      }
    } else {
      blocks[next]?.classList.add('vim-block-cursor');
    }
    blocks[next]?.scrollIntoView({ block: 'nearest' });
    requestAnimationFrame(() => updateOverlayRef.current());
    syncNavState();
  }, [getBlocks, syncNavState]);

  const moveBlockCursorTo = useCallback((pos: 'start' | 'end') => {
    const blocks = getBlocks();
    if (blocks.length === 0) return;
    const idx = pos === 'start' ? 0 : blocks.length - 1;
    blockIndexRef.current = idx;
    wordIndexRef.current = 0;
    blocks.forEach(b => { b.classList.remove('vim-block-cursor'); b.classList.remove('vim-block-selected'); });
    blocks[idx]?.classList.add('vim-block-cursor');
    blocks[idx]?.scrollIntoView({ block: pos === 'start' ? 'start' : 'end' });
    requestAnimationFrame(() => updateOverlayRef.current());
    syncNavState();
  }, [getBlocks, syncNavState]);

  const moveWordForward = useCallback(() => {
    const blocks = getBlocks();
    const block = blocks[blockIndexRef.current];
    if (!block) return;
    const words = getWordsInBlock(block);
    if (words.length === 0 || wordIndexRef.current >= words.length - 1) {
      if (blockIndexRef.current < blocks.length - 1) {
        blockIndexRef.current = blockIndexRef.current + 1;
        wordIndexRef.current = 0;
        blocks[blockIndexRef.current]?.scrollIntoView({ block: 'nearest' });
      }
    } else {
      wordIndexRef.current = wordIndexRef.current + 1;
    }
    requestAnimationFrame(() => updateOverlayRef.current());
    syncNavState();
  }, [getBlocks, getWordsInBlock, syncNavState]);

  const moveWordBackward = useCallback(() => {
    const blocks = getBlocks();
    if (wordIndexRef.current > 0) {
      wordIndexRef.current = wordIndexRef.current - 1;
    } else if (blockIndexRef.current > 0) {
      const prevIdx = blockIndexRef.current - 1;
      const prevBlock = blocks[prevIdx];
      const prevWords = getWordsInBlock(prevBlock);
      blockIndexRef.current = prevIdx;
      wordIndexRef.current = Math.max(0, prevWords.length - 1);
      prevBlock?.scrollIntoView({ block: 'nearest' });
    }
    requestAnimationFrame(() => updateOverlayRef.current());
    syncNavState();
  }, [getBlocks, getWordsInBlock, syncNavState]);

  // --- exitInsertMode (called when edit mode turns off) ---

  const exitInsertMode = useCallback(() => {
    setMode('NORMAL');
    setSelectWordOnEdit(false);
    setInsertPosition('at');
    setOperator(null);
  }, []);

  // --- Paste operations ---

  const pasteAfter = useCallback(() => {
    const reg = registerRef.current;
    if (!reg) return;
    const bi = blockIndexRef.current;
    const wi = wordIndexRef.current;
    pasteTextInMarkdown(bi, wi, reg, 'after');
  }, [pasteTextInMarkdown]);

  const pasteBefore = useCallback(() => {
    const reg = registerRef.current;
    if (!reg) return;
    const bi = blockIndexRef.current;
    const wi = wordIndexRef.current;
    pasteTextInMarkdown(bi, wi, reg, 'before');
  }, [pasteTextInMarkdown]);

  // --- Main keyboard handler ---

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabledRef.current) return;
    if (isEditModeRef.current) return; // INSERT mode is handled by TipTap/RichEditor

    const tag = (e.target as HTMLElement).tagName;
    const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;
    if (isInput) return;

    const currentMode = modeRef.current;

    // --- OPERATOR_PENDING mode ---
    if (currentMode === 'OPERATOR_PENDING') {
      const op = operatorRef.current;

      if (e.key === 'Escape') {
        e.preventDefault();
        setOperator(null);
        setMode('NORMAL');
        return;
      }

      // Same key = line operation (dd/cc/yy)
      if (e.key === op) {
        e.preventDefault();
        executeOperator(op, op!);
        setOperator(null);
        setMode('NORMAL');
        return;
      }

      // Motion keys
      const motionKeys: Record<string, string> = {
        w: 'w', l: 'l', e: 'e', b: 'b', h: 'h',
        $: '$', '0': '0', j: 'j', k: 'k',
      };

      if (motionKeys[e.key]) {
        e.preventDefault();
        executeOperator(op, motionKeys[e.key]);
        setOperator(null);
        setMode('NORMAL');
        return;
      }

      // G motion
      if (e.key === 'G' && !e.shiftKey) {
        e.preventDefault();
        executeOperator(op, 'G');
        setOperator(null);
        setMode('NORMAL');
        return;
      }

      // gg motion (within operator pending)
      if (e.key === 'g' && !e.shiftKey) {
        const now = Date.now();
        if (now - lastGRef.current < 300) {
          e.preventDefault();
          executeOperator(op, 'g');
          setOperator(null);
          setMode('NORMAL');
          lastGRef.current = 0;
          return;
        }
        lastGRef.current = now;
        return;
      }

      // Any other key cancels operator pending
      e.preventDefault();
      setOperator(null);
      setMode('NORMAL');
      return;
    }

    // --- VISUAL mode ---
    if (currentMode === 'VISUAL') {
      if (e.key === 'Escape') {
        e.preventDefault();
        setSelectionAnchor(null);
        setMode('NORMAL');
        return;
      }

      // Motion keys extend selection
      if (e.key === 'j' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        moveBlockCursor(1);
        return;
      }
      if (e.key === 'k' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        moveBlockCursor(-1);
        return;
      }
      if (e.key === 'G' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        moveBlockCursorTo('end');
        return;
      }
      if (e.key === 'g' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        const now = Date.now();
        if (now - lastGRef.current < 300) {
          e.preventDefault();
          moveBlockCursorTo('start');
          lastGRef.current = 0;
        } else {
          lastGRef.current = now;
        }
        return;
      }

      // Operators on selection
      if (e.key === 'd' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        executeVisualOperator('d');
        return;
      }
      if (e.key === 'c' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        executeVisualOperator('c');
        return;
      }
      if (e.key === 'y' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        executeVisualOperator('y');
        return;
      }

      return;
    }

    // --- NORMAL mode ---

    // Operators: d/c/y enter OPERATOR_PENDING
    if (e.key === 'd' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      setOperator('d');
      setMode('OPERATOR_PENDING');
      return;
    }
    if (e.key === 'c' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      setOperator('c');
      setMode('OPERATOR_PENDING');
      return;
    }
    if (e.key === 'y' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      setOperator('y');
      setMode('OPERATOR_PENDING');
      return;
    }

    // x — delete word under cursor (like dw)
    if (e.key === 'x' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      const deleted = deleteWordFromMarkdown(blockIndexRef.current, wordIndexRef.current);
      if (deleted) setRegister(deleted);
      return;
    }

    // p/P — paste
    if (e.key === 'p' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      pasteAfter();
      return;
    }
    if (e.key === 'P' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      pasteBefore();
      return;
    }

    // u — undo (no-op: ProseMirror undo removed, markdown has no undo stack yet)
    if (e.key === 'u' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      return;
    }

    // Ctrl+R — redo (no-op: ProseMirror redo removed, markdown has no redo stack yet)
    if (e.ctrlKey && e.key === 'r') {
      e.preventDefault();
      return;
    }

    // / — search
    if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      openSearch();
      return;
    }

    // V — visual line mode
    if (e.key === 'V' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      if (selectionAnchorRef.current !== null) {
        // Already in visual — toggle off
        setSelectionAnchor(null);
        setMode('NORMAL');
      } else {
        setSelectionAnchor(blockIndexRef.current);
        setMode('VISUAL');
      }
      return;
    }

    // v — also visual mode (same as V for a doc editor — block-level makes sense)
    if (e.key === 'v' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      if (selectionAnchorRef.current !== null) {
        setSelectionAnchor(null);
        setMode('NORMAL');
      } else {
        setSelectionAnchor(blockIndexRef.current);
        setMode('VISUAL');
      }
      return;
    }

    // --- Navigation ---

    // j/k — move cursor one block; Shift+J/K extends selection
    if ((e.key === 'j' || e.key === 'J') && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      if (e.shiftKey) {
        if (selectionAnchorRef.current === null) {
          setSelectionAnchor(blockIndexRef.current);
          setMode('VISUAL');
        }
      } else {
        setSelectionAnchor(null);
      }
      moveBlockCursor(1);
      return;
    }
    if ((e.key === 'k' || e.key === 'K') && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      if (e.shiftKey) {
        if (selectionAnchorRef.current === null) {
          setSelectionAnchor(blockIndexRef.current);
          setMode('VISUAL');
        }
      } else {
        setSelectionAnchor(null);
      }
      moveBlockCursor(-1);
      return;
    }

    // Ctrl+D/U — half-page
    if (e.ctrlKey && e.key === 'd') {
      e.preventDefault();
      moveBlockCursor(10);
      return;
    }
    if (e.ctrlKey && e.key === 'u') {
      e.preventDefault();
      moveBlockCursor(-10);
      return;
    }

    // Ctrl+F/B — full page
    if (e.ctrlKey && e.key === 'f') {
      e.preventDefault();
      moveBlockCursor(20);
      return;
    }
    if (e.ctrlKey && e.key === 'b') {
      e.preventDefault();
      moveBlockCursor(-20);
      return;
    }

    // G — go to end
    if (e.key === 'G' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      moveBlockCursorTo('end');
      return;
    }

    // gg — go to start (double-g within 300ms)
    if (e.key === 'g' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      const now = Date.now();
      if (now - lastGRef.current < 300) {
        e.preventDefault();
        moveBlockCursorTo('start');
        lastGRef.current = 0;
      } else {
        lastGRef.current = now;
      }
      return;
    }

    // w/l — next word
    if ((e.key === 'w' || e.key === 'l') && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      setSelectionAnchor(null);
      moveWordForward();
      return;
    }

    // b/h — prev word
    if ((e.key === 'b' || e.key === 'h') && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      setSelectionAnchor(null);
      moveWordBackward();
      return;
    }

    // e — end of word (alias for next word in this context)
    if (e.key === 'e' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      setSelectionAnchor(null);
      moveWordForward();
      return;
    }

    // 0 — first word
    if (e.key === '0' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      setSelectionAnchor(null);
      setWordIndex(0);
      return;
    }

    // $ — last word
    if (e.key === '$' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      setSelectionAnchor(null);
      const blocks = getBlocks();
      const block = blocks[blockIndexRef.current];
      if (block) {
        const words = getWordsInBlock(block);
        setWordIndex(Math.max(0, words.length - 1));
      }
      return;
    }

    // --- Insert mode entry ---

    // i — insert at current word
    if (e.key === 'i' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      setSelectWordOnEdit(false);
      setInsertPosition('at');
      toggleEditMode();
      return;
    }

    // a — insert after current word
    if (e.key === 'a' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      setSelectWordOnEdit(false);
      setInsertPosition('after');
      toggleEditMode();
      return;
    }

    // I — insert at start of block
    if (e.key === 'I' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      setWordIndex(0);
      setSelectWordOnEdit(false);
      setInsertPosition('start');
      toggleEditMode();
      return;
    }

    // A — insert at end of block
    if (e.key === 'A' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      const blocks = getBlocks();
      const block = blocks[blockIndexRef.current];
      if (block) {
        const words = getWordsInBlock(block);
        setWordIndex(Math.max(0, words.length - 1));
      }
      setSelectWordOnEdit(false);
      setInsertPosition('end');
      toggleEditMode();
      return;
    }

    // o — open line below
    if (e.key === 'o' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      // Insert a new empty paragraph after the current block in markdown
      const md = markdownRef.current;
      const blocks = getBlocks();
      const block = blocks[blockIndexRef.current];
      if (block) {
        const blockText = block.textContent?.trim() || '';
        if (blockText) {
          // Find this block text in markdown and insert after
          const idx = md.indexOf(blockText.substring(0, Math.min(40, blockText.length)));
          if (idx >= 0) {
            // Find end of current line/paragraph
            let endIdx = md.indexOf('\n\n', idx);
            if (endIdx < 0) endIdx = md.indexOf('\n', idx + blockText.length);
            if (endIdx < 0) endIdx = md.length;
            const newMd = md.slice(0, endIdx) + '\n\n \n' + md.slice(endIdx);
            setMarkdownLocal(newMd);
            // Move to the new block
            setBlockIndex(blockIndexRef.current + 1);
            setWordIndex(0);
          }
        }
      }
      setSelectWordOnEdit(false);
      setInsertPosition('at');
      // Wait for rerender then enter edit mode
      requestAnimationFrame(() => toggleEditMode());
      return;
    }

    // O — open line above
    if (e.key === 'O' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      const md = markdownRef.current;
      const blocks = getBlocks();
      const block = blocks[blockIndexRef.current];
      if (block) {
        const blockText = block.textContent?.trim() || '';
        if (blockText) {
          const idx = md.indexOf(blockText.substring(0, Math.min(40, blockText.length)));
          if (idx >= 0) {
            // Find start of line
            let startIdx = md.lastIndexOf('\n', idx - 1);
            if (startIdx < 0) startIdx = 0;
            const newMd = md.slice(0, startIdx) + '\n\n \n' + md.slice(startIdx);
            setMarkdownLocal(newMd);
            setWordIndex(0);
          }
        }
      }
      setSelectWordOnEdit(false);
      setInsertPosition('at');
      requestAnimationFrame(() => toggleEditMode());
      return;
    }

    // Enter — enter edit mode at current word
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      setSelectWordOnEdit(false);
      setInsertPosition('at');
      toggleEditMode();
      return;
    }

    // Escape — clear selection or cancel operator
    if (e.key === 'Escape') {
      if (selectionAnchorRef.current !== null) {
        e.preventDefault();
        setSelectionAnchor(null);
        setMode('NORMAL');
        return;
      }
      // Don't prevent default — let page.tsx handle other Escape cases
      return;
    }
  }, [
    getBlocks, getWordsInBlock, moveBlockCursor, moveBlockCursorTo,
    moveWordForward, moveWordBackward, toggleEditMode, openSearch,
    executeOperator, executeVisualOperator, deleteWordFromMarkdown,
    pasteAfter, pasteBefore,
  ]);

  // --- Article click handler ---

  const handleArticleClick = useCallback((e: React.MouseEvent) => {
    if (!enabledRef.current) return;
    const target = e.target as HTMLElement;
    const blocks = getBlocks();
    const blockMap = new Map<HTMLElement, number>();
    for (let i = 0; i < blocks.length; i++) blockMap.set(blocks[i], i);

    let el: HTMLElement | null = target;
    while (el && el !== e.currentTarget) {
      const idx = blockMap.get(el);
      if (idx !== undefined) {
        setBlockIndex(idx);
        setSelectionAnchor(null);
        setMode('NORMAL');
        // Find nearest word by click position
        const blockWords = getWordsInBlock(el);
        if (blockWords.length > 0) {
          let closestWordIdx = 0;
          let closestDist = Infinity;
          for (let wi = 0; wi < blockWords.length; wi++) {
            const wordRange = document.createRange();
            wordRange.setStart(blockWords[wi].node, blockWords[wi].startOffset);
            wordRange.setEnd(blockWords[wi].node, blockWords[wi].endOffset);
            const wordRect = wordRange.getBoundingClientRect();
            const dx = e.clientX - (wordRect.left + wordRect.width / 2);
            const dy = e.clientY - (wordRect.top + wordRect.height / 2);
            const dist = dx * dx + dy * dy;
            if (dist < closestDist) {
              closestDist = dist;
              closestWordIdx = wi;
            }
          }
          setWordIndex(closestWordIdx);
        } else {
          setWordIndex(0);
        }
        break;
      }
      el = el.parentElement;
    }
  }, [getBlocks, getWordsInBlock]);

  // --- Block cursor class effect ---
  useEffect(() => {
    if (isEditMode || !enabled) return;
    const blocks = getBlocks();
    // Clean up all
    blocks.forEach(b => {
      b.classList.remove('vim-block-cursor');
      b.classList.remove('vim-block-selected');
    });
    if (selectionAnchor !== null) {
      const lo = Math.min(selectionAnchor, blockIndex);
      const hi = Math.max(selectionAnchor, blockIndex);
      for (let i = lo; i <= hi; i++) {
        if (blocks[i]) {
          blocks[i].classList.add(i === blockIndex ? 'vim-block-cursor' : 'vim-block-selected');
        }
      }
    } else if (blocks[blockIndex]) {
      blocks[blockIndex].classList.add('vim-block-cursor');
    }
    return () => {
      blocks.forEach(b => {
        b.classList.remove('vim-block-cursor');
        b.classList.remove('vim-block-selected');
      });
    };
  }, [blockIndex, selectionAnchor, isEditMode, markdown, getBlocks, enabled]);

  // --- Imperative word cursor overlay (fast — no React re-render needed) ---
  const updateWordOverlay = useCallback(() => {
    const mainEl = mainRef.current;
    if (!mainEl) return;

    // Hide overlay when not applicable
    if (isEditModeRef.current || !enabledRef.current || selectionAnchorRef.current !== null) {
      if (overlayRef.current) overlayRef.current.style.display = 'none';
      return;
    }

    // Ensure overlay div exists
    if (!overlayRef.current) {
      const div = document.createElement('div');
      div.className = 'vim-word-cursor';
      div.style.position = 'absolute';
      div.style.height = '2px';
      div.style.pointerEvents = 'none';
      div.style.zIndex = '10';
      mainEl.appendChild(div);
      overlayRef.current = div;
    }

    const blocks = getBlocks();
    const block = blocks[blockIndexRef.current];
    if (!block) {
      overlayRef.current.style.display = 'none';
      return;
    }

    const words = getWordsInBlock(block);
    if (words.length === 0) {
      overlayRef.current.style.display = 'none';
      return;
    }

    const wi = Math.min(wordIndexRef.current, words.length - 1);
    if (wi !== wordIndexRef.current) {
      wordIndexRef.current = wi;
      setWordIndex(wi);
    }

    const word = words[wi];
    const range = document.createRange();
    range.setStart(word.node, word.startOffset);
    range.setEnd(word.node, word.endOffset);

    const rect = range.getBoundingClientRect();
    const mainRect = mainEl.getBoundingClientRect();
    const ol = overlayRef.current;
    ol.style.display = 'block';
    ol.style.left = `${rect.left - mainRect.left + mainEl.scrollLeft - 1}px`;
    ol.style.top = `${rect.top - mainRect.top + mainEl.scrollTop + rect.height - 2}px`;
    ol.style.width = `${rect.width + 2}px`;
  }, [mainRef, getBlocks, getWordsInBlock]);
  updateOverlayRef.current = updateWordOverlay;

  // Update overlay on state changes that React needs to know about
  useEffect(() => {
    updateWordOverlay();
  }, [blockIndex, wordIndex, selectionAnchor, isEditMode, markdown, enabled, updateWordOverlay]);

  // Cleanup overlay on unmount
  useEffect(() => {
    return () => {
      overlayRef.current?.remove();
      overlayRef.current = null;
    };
  }, []);

  // --- Status bar helpers ---

  const modeLabel = (() => {
    if (!enabled) return '';
    switch (mode) {
      case 'NORMAL': return 'NORMAL';
      case 'INSERT': return '-- INSERT --';
      case 'VISUAL': return '-- VISUAL --';
      case 'OPERATOR_PENDING': return operator ? `${operator}_` : 'NORMAL';
    }
  })();

  const statusText = (() => {
    if (!enabled) return isEditMode ? 'Cmd+E to exit edit' : 'Cmd+E to edit';
    switch (mode) {
      case 'NORMAL': return 'Enter edit  j/k move  w/b word  0/$ ends  gg/G jump  / search';
      case 'INSERT': return 'ESC to save+exit';
      case 'VISUAL': return 'j/k extend  d delete  y yank  ESC cancel';
      case 'OPERATOR_PENDING': return 'w word  $ end  0 start  j/k line  ' + (operator || '') + (operator || '') + ' line  ESC cancel';
    }
  })();

  return {
    mode,
    blockIndex,
    wordIndex,
    operator,
    register,
    selectionAnchor,
    enabled,
    handleKeyDown,
    handleArticleClick,
    setBlockIndex,
    setWordIndex,
    toggleEnabled,
    exitInsertMode,
    statusText,
    modeLabel,
    selectWordOnEdit,
    insertPosition,
  };
}
