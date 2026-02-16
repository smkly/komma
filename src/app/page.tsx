'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import rehypeRaw from 'rehype-raw';
import dynamic from 'next/dynamic';

import { useDocument } from './hooks/useDocument';
import { useComments } from './hooks/useComments';
import { useChangelog } from './hooks/useChangelog';
import { useClaude } from './hooks/useClaude';
import { useChat } from './hooks/useChat';
import { useVim } from './hooks/useVim';

import Header from './components/Header';
import TabBar from './components/TabBar';
import Sidebar from './components/Sidebar';
import CommentsTab from './components/tabs/CommentsTab';
import OutputTab from './components/tabs/OutputTab';
import ChatTab from './components/tabs/ChatTab';
import TableOfContentsTab from './components/tabs/TableOfContentsTab';
import CommentTooltip from './components/CommentTooltip';
import CommentDrawer from './components/CommentDrawer';
import FileBrowser from './components/FileBrowser';
import NewDocumentModal from './components/NewDocumentModal';
import DocumentInfo from './components/DocumentInfo';
import SearchBar from './components/SearchBar';
import DiffView from './components/DiffView';
import FileExplorer from './components/FileExplorer';

const RichEditor = dynamic(() => import('./components/RichEditor'), { ssr: false });

export default function Home() {
  const doc = useDocument();
  const { comments, setComments, addComment, removeComment, patchComments, markApplied } = useComments(doc.filePath);
  const changelog = useChangelog();

  // TipTap editor ref (exposed by RichEditor via onEditorReady callback)
  const editorRef = useRef<any>(null);

  // Thin wrappers for edit mode changes (used in place of doc.* for consistency)
  const toggleEditMode = useCallback(() => doc.toggleEditMode(), [doc.toggleEditMode]);
  const saveDocument = useCallback(() => {
    const html = editorRef.current?.getHTML();
    doc.saveDocument(html);
  }, [doc.saveDocument]);
  const setIsEditMode = useCallback((mode: boolean) => doc.setIsEditMode(mode), [doc.setIsEditMode]);

  const [activeTab, setActiveTab] = useState<'toc' | 'comments' | 'output' | 'chat'>('comments');
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [showNewDocModal, setShowNewDocModal] = useState(false);
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showFileExplorer, setShowFileExplorer] = useState(false);
  const [showAgentTab, setShowAgentTab] = useState(true);
  const [vaultRoot, setVaultRoot] = useState<string | null>(null);

  // Split pane state
  const [splitTabIndex, setSplitTabIndex] = useState<number | null>(null);
  const [activePane, setActivePane] = useState<'primary' | 'split'>('primary');
  const [splitPaneMarkdown, setSplitPaneMarkdown] = useState('');
  const [splitPaneCommentCount, setSplitPaneCommentCount] = useState(0);
  const [splitRatio, setSplitRatio] = useState(0.5);

  // Theme state (persisted to localStorage)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const hour = new Date().getHours();
    return (hour >= 19 || hour < 7) ? 'dark' : 'light';
  });
  useEffect(() => {
    const saved = localStorage.getItem('helm-theme') as 'light' | 'dark' | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute('data-theme', saved === 'dark' ? 'dark' : '');
    } else {
      document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : '');
    }
  }, []);
  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem('helm-theme', next);
      document.documentElement.setAttribute('data-theme', next === 'dark' ? 'dark' : '');
      return next;
    });
  }, []);

  // Document tab state
  const [tabs, setTabs] = useState<{ path: string; title: string }[]>([
    { path: doc.filePath, title: doc.filePath.split('/').pop() || 'Untitled' }
  ]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  // Comment UI state
  const [showMiniTooltip, setShowMiniTooltip] = useState(false);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState('');
  const [newComment, setNewComment] = useState('');

  const mainRef = useRef<HTMLElement>(null);
  const splitMainRef = useRef<HTMLElement>(null);
  const splitArticleRef = useRef<HTMLElement>(null);
  const resizeRef = useRef<{ startX: number; startRatio: number } | null>(null);
  const savedSelectionRef = useRef<{ text: string; range: Range | null }>({ text: '', range: null });

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [searchMatchCount, setSearchMatchCount] = useState(0);
  const [currentSearchMatch, setCurrentSearchMatch] = useState(0);
  const searchMarksRef = useRef<HTMLElement[]>([]);

  const editorBlockRef = useRef(0); // tracks cursor block inside RichEditor

  // Get navigable block elements from the article
  const getBlocks = useCallback((): HTMLElement[] => {
    const article = mainRef.current?.querySelector('article');
    if (!article) return [];
    return Array.from(article.querySelectorAll(
      ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, ' +
      ':scope > p, :scope > ul > li, :scope > ol > li, :scope > blockquote, :scope > pre, ' +
      ':scope > table, :scope > hr, :scope > div'
    )) as HTMLElement[];
  }, []);

  // Vim mode — all vim logic lives in useVim
  const vim = useVim({
    mainRef,
    getBlocks,
    editorRef,
    isEditMode: doc.isEditMode,
    toggleEditMode,
    saveDocument,
    markdown: doc.markdown,
    setMarkdown: doc.setMarkdown,
    filePath: doc.filePath,
    openSearch: () => setShowSearch(true),
  });

  // When exiting edit mode, update vim cursor to match where user was editing
  const prevEditMode = useRef(doc.isEditMode);
  useEffect(() => {
    if (prevEditMode.current && !doc.isEditMode) {
      const idx = editorBlockRef.current;
      vim.setBlockIndex(idx);
      vim.setWordIndex(0);
      vim.exitInsertMode();
      requestAnimationFrame(() => {
        const blocks = getBlocks();
        blocks[idx]?.scrollIntoView({ block: 'nearest' });
      });
    }
    prevEditMode.current = doc.isEditMode;
  }, [doc.isEditMode, getBlocks]);

  // Block cursor and word cursor effects are now handled inside useVim

  // Search: highlight matches in the article DOM
  useEffect(() => {
    // Clean up previous search marks
    searchMarksRef.current.forEach(mark => {
      const parent = mark.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
        parent.normalize();
      }
    });
    searchMarksRef.current = [];

    if (!showSearch || !searchText || doc.isEditMode) {
      setSearchMatchCount(0);
      return;
    }

    const article = articleRef.current;
    if (!article) { setSearchMatchCount(0); return; }

    const lower = searchText.toLowerCase();
    const marks: HTMLElement[] = [];

    // Walk text nodes and find matches
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      textNodes.push(node);
    }

    for (const textNode of textNodes) {
      const text = textNode.textContent || '';
      const textLower = text.toLowerCase();
      let startIdx = 0;
      const positions: number[] = [];

      while (true) {
        const idx = textLower.indexOf(lower, startIdx);
        if (idx < 0) break;
        positions.push(idx);
        startIdx = idx + lower.length;
      }

      if (positions.length === 0) continue;

      // Split this text node and wrap matches
      let currentNode = textNode;
      let offset = 0;

      for (const pos of positions) {
        if (pos > offset) {
          // Text before match
          currentNode = currentNode.splitText(pos - offset);
          offset = pos;
        }
        // Split at end of match
        const afterMatch = currentNode.splitText(searchText.length);
        const mark = document.createElement('mark');
        mark.className = 'search-highlight';
        mark.textContent = currentNode.textContent;
        currentNode.parentNode!.replaceChild(mark, currentNode);
        marks.push(mark);
        currentNode = afterMatch;
        offset = pos + searchText.length;
      }
    }

    searchMarksRef.current = marks;
    setSearchMatchCount(marks.length);
    if (marks.length > 0) {
      setCurrentSearchMatch(prev => Math.min(prev, marks.length - 1));
    }
  }, [showSearch, searchText, doc.markdown, doc.isEditMode]);

  // Search: highlight the current active match
  useEffect(() => {
    searchMarksRef.current.forEach((mark, i) => {
      if (i === currentSearchMatch) {
        mark.classList.add('search-highlight-active');
        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        mark.classList.remove('search-highlight-active');
      }
    });
  }, [currentSearchMatch, searchMatchCount]);

  const searchNext = useCallback(() => {
    if (searchMatchCount === 0) return;
    setCurrentSearchMatch(prev => (prev + 1) % searchMatchCount);
  }, [searchMatchCount]);

  const searchPrev = useCallback(() => {
    if (searchMatchCount === 0) return;
    setCurrentSearchMatch(prev => (prev - 1 + searchMatchCount) % searchMatchCount);
  }, [searchMatchCount]);

  const searchReplace = useCallback(async () => {
    if (searchMatchCount === 0 || !searchText) return;
    // Replace the Nth occurrence in the raw markdown
    let count = 0;
    const idx = doc.markdown.toLowerCase().indexOf(searchText.toLowerCase());
    let searchIdx = 0;
    let targetIdx = -1;
    const lower = doc.markdown.toLowerCase();
    const searchLower = searchText.toLowerCase();

    while (searchIdx < doc.markdown.length) {
      const found = lower.indexOf(searchLower, searchIdx);
      if (found < 0) break;
      if (count === currentSearchMatch) {
        targetIdx = found;
        break;
      }
      count++;
      searchIdx = found + searchLower.length;
    }

    if (targetIdx >= 0) {
      const newMarkdown = doc.markdown.slice(0, targetIdx) + replaceText + doc.markdown.slice(targetIdx + searchText.length);
      try {
        await fetch('/api/file', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: doc.filePath, content: newMarkdown }),
        });
        doc.setMarkdown(newMarkdown);
      } catch (error) {
        console.error('Replace failed:', error);
      }
    }
  }, [searchMatchCount, searchText, replaceText, currentSearchMatch, doc.markdown, doc.filePath, doc.setMarkdown]);

  const searchReplaceAll = useCallback(async () => {
    if (searchMatchCount === 0 || !searchText) return;
    // Case-insensitive replace all
    const regex = new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const newMarkdown = doc.markdown.replace(regex, replaceText);
    try {
      await fetch('/api/file', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: doc.filePath, content: newMarkdown }),
      });
      doc.setMarkdown(newMarkdown);
      setSearchMatchCount(0);
      setCurrentSearchMatch(0);
    } catch (error) {
      console.error('Replace all failed:', error);
    }
  }, [searchMatchCount, searchText, replaceText, doc.markdown, doc.filePath, doc.setMarkdown]);

  const closeSearch = useCallback(() => {
    setShowSearch(false);
    setSearchText('');
    setReplaceText('');
    setSearchMatchCount(0);
    setCurrentSearchMatch(0);
    // Clean up marks
    searchMarksRef.current.forEach(mark => {
      const parent = mark.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
        parent.normalize();
      }
    });
    searchMarksRef.current = [];
  }, []);

  // Wrap loadDocument to also update comments, changelogs, and recent files
  const loadDocument = useCallback(async () => {
    const result = await doc.loadDocument();
    setComments(result.comments);
    changelog.setChangelogs(result.changelogs);
    // Add to recent files
    setRecentFiles(prev => {
      const filtered = prev.filter(f => f !== doc.filePath);
      return [doc.filePath, ...filtered].slice(0, 5);
    });
  }, [doc.loadDocument, doc.filePath, setComments, changelog.setChangelogs]);

  const claude = useClaude({
    filePath: doc.filePath,
    markdown: doc.markdown,
    comments,
    setComments,
    patchComments,
    markApplied,
    createChangelog: changelog.createChangelog,
    updateChangelog: changelog.updateChangelog,
    loadDocument,
    setActiveTab,
  });

  const chat = useChat(doc.filePath, claude.model);
  const [chatDraft, setChatDraft] = useState('');

  // Initial load — wait until path restoration finishes
  // Also sync tab 0 to the restored path (it was initialized with the default before restore)
  const hasRestoredRef = useRef(false);
  useEffect(() => {
    if (!doc.isRestoringPath) {
      if (!hasRestoredRef.current) {
        hasRestoredRef.current = true;
        // Update tab 0 to match the restored path
        setTabs(prev => {
          if (prev.length === 1 && prev[0].path !== doc.filePath) {
            return [{ path: doc.filePath, title: doc.filePath.split('/').pop() || 'Untitled' }];
          }
          return prev;
        });
      }
      loadDocument();
    }
  }, [doc.isRestoringPath, loadDocument]);

  // Resolve vault root when file path changes
  useEffect(() => {
    const resolveVault = async () => {
      try {
        const root = await window.electronAPI?.vault.resolveRoot(doc.filePath);
        setVaultRoot(root ?? null);
      } catch {
        setVaultRoot(null);
      }
    };
    resolveVault();
  }, [doc.filePath]);

  // Load chat sessions when document changes
  useEffect(() => {
    chat.loadSessions(doc.filePath);
  }, [doc.filePath, chat.loadSessions]);

  // Sync active tab → document file path
  useEffect(() => {
    const activeTab = tabs[activeTabIndex];
    if (activeTab && activeTab.path !== doc.filePath) {
      doc.setFilePath(activeTab.path);
    }
  }, [activeTabIndex, tabs, doc.filePath, doc.setFilePath]);

  // Tab handlers
  const handleSelectTab = useCallback((index: number) => {
    setActiveTabIndex(index);
  }, []);

  const handleCloseTab = useCallback((index: number) => {
    if (tabs.length <= 1) return;
    // If closing the tab that's in the split pane, close the split
    if (splitTabIndex === index) {
      setSplitTabIndex(null);
      setActivePane('primary');
    } else if (splitTabIndex !== null && index < splitTabIndex) {
      setSplitTabIndex(splitTabIndex - 1);
    }
    const newTabs = tabs.filter((_, i) => i !== index);
    setTabs(newTabs);
    if (index === activeTabIndex) {
      setActiveTabIndex(Math.min(index, newTabs.length - 1));
    } else if (index < activeTabIndex) {
      setActiveTabIndex(activeTabIndex - 1);
    }
  }, [tabs, activeTabIndex, splitTabIndex]);

  const cancelComment = useCallback(() => {
    setShowCommentInput(false);
    setShowMiniTooltip(false);
    setNewComment('');
    setSelectedText('');
    savedSelectionRef.current = { text: '', range: null };
    window.getSelection()?.removeAllRanges();
  }, []);

  // Split pane helpers
  const fetchSplitPaneContent = useCallback(async (filePath: string) => {
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      if (data.content) {
        setSplitPaneMarkdown(data.content);
      }
    } catch {
      setSplitPaneMarkdown('');
    }
    // Fetch comment count for the split pane
    try {
      const res = await fetch(`/api/comments?document_path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      setSplitPaneCommentCount(Array.isArray(data) ? data.length : 0);
    } catch {
      setSplitPaneCommentCount(0);
    }
  }, []);

  const switchActivePane = useCallback(() => {
    if (splitTabIndex === null) return;

    if (activePane === 'primary') {
      // Primary -> Split: cache primary's markdown, load split's doc
      setSplitPaneMarkdown(doc.markdown);
      setSplitPaneCommentCount(comments.length);
      // Switch doc to split pane's path
      const splitPath = tabs[splitTabIndex].path;
      doc.setFilePath(splitPath);
      setActivePane('split');
    } else {
      // Split -> Primary: cache split's markdown, load primary's doc
      setSplitPaneMarkdown(doc.markdown);
      setSplitPaneCommentCount(comments.length);
      // Switch doc to primary pane's path
      const primaryPath = tabs[activeTabIndex].path;
      doc.setFilePath(primaryPath);
      setActivePane('primary');
    }
  }, [splitTabIndex, activePane, doc.markdown, doc.setFilePath, tabs, activeTabIndex, comments.length]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startRatio: splitRatio };

    const handleResizeMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const container = mainRef.current?.parentElement;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      // Account for file explorer width
      const explorerWidth = showFileExplorer ? 240 : 0;
      const sidebarWidth = showAgentTab ? 380 : 0;
      const availableWidth = containerRect.width - explorerWidth - sidebarWidth;
      const delta = e.clientX - resizeRef.current.startX;
      const newRatio = Math.max(0.25, Math.min(0.75, resizeRef.current.startRatio + delta / availableWidth));
      setSplitRatio(newRatio);
    };

    const handleResizeEnd = () => {
      resizeRef.current = null;
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  }, [splitRatio, showFileExplorer, showAgentTab]);

  // Compute pane header titles
  const primaryTitle = splitTabIndex !== null
    ? (activePane === 'primary' ? tabs[activeTabIndex] : tabs[splitTabIndex])?.title || ''
    : '';
  const splitTitle = splitTabIndex !== null
    ? (activePane === 'primary' ? tabs[splitTabIndex] : tabs[activeTabIndex])?.title || ''
    : '';

  // Keyboard shortcuts: Cmd+K for comment, Cmd+P for file browser, tab shortcuts, etc.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 'k') {
        e.preventDefault();
        const selection = window.getSelection();
        const text = selection?.toString().trim();
        if (text && text.length >= 1) {
          const range = selection?.getRangeAt(0);
          if (range) {
            savedSelectionRef.current = { text, range: range.cloneRange() };
            setSelectedText(text);
            setShowCommentInput(true);
            setShowMiniTooltip(false);
          }
        } else {
          // No mouse selection — use vim cursor block(s)
          const blocks = getBlocks();
          const anchor = vim.selectionAnchor;
          const cursor = vim.blockIndex;
          const lo = anchor !== null ? Math.min(anchor, cursor) : cursor;
          const hi = anchor !== null ? Math.max(anchor, cursor) : cursor;
          const selectedBlocks = blocks.slice(lo, hi + 1);
          if (selectedBlocks.length > 0) {
            const blockText = selectedBlocks.map(b => b.textContent?.trim()).filter(Boolean).join('\n\n');
            if (blockText) {
              const range = document.createRange();
              range.setStartBefore(selectedBlocks[0]);
              range.setEndAfter(selectedBlocks[selectedBlocks.length - 1]);
              savedSelectionRef.current = { text: blockText, range: range.cloneRange() };
              setSelectedText(blockText);
              setShowCommentInput(true);
              setShowMiniTooltip(false);
            }
          }
        }
      }

      if (e.metaKey && e.key === 'p') {
        e.preventDefault();
        setShowFileBrowser(true);
      }

      if (e.metaKey && e.key === 'n') {
        e.preventDefault();
        setShowNewDocModal(true);
      }

      // Cmd+F: search / find and replace
      if (e.metaKey && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
      }

      // Cmd+B: toggle file explorer (left panel) — skip in edit mode so TipTap can handle Bold
      if (e.metaKey && !e.altKey && e.key === 'b' && !doc.isEditMode) {
        e.preventDefault();
        setShowFileExplorer(prev => !prev);
      }

      // Cmd+Option+B: toggle agent tab (right panel)
      if (e.metaKey && e.altKey && (e.key === 'b' || e.key === '∫' || e.code === 'KeyB')) {
        e.preventDefault();
        setShowAgentTab(prev => !prev);
      }

      // Cmd+E: toggle edit mode
      if (e.metaKey && e.key === 'e') {
        e.preventDefault();
        toggleEditMode();
      }

      // Cmd+Enter: send comments to Claude (when on comments tab with pending comments, not in comment drawer)
      if (e.metaKey && e.key === 'Enter' && !showCommentInput) {
        e.preventDefault();
        if (activeTab === 'comments' && comments.filter(c => c.status === 'pending').length > 0 && !claude.isSending) {
          claude.sendToClaude();
        }
      }

      // Cmd+1-9: jump to document tab by number
      if (e.metaKey && !e.shiftKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const tabIndex = parseInt(e.key) - 1;
        if (tabIndex < tabs.length) {
          handleSelectTab(tabIndex);
        }
      }

      // Cmd+W: close current tab
      if (e.metaKey && e.key === 'w') {
        e.preventDefault();
        handleCloseTab(activeTabIndex);
      }

      // Cmd+Shift+[ / Cmd+Shift+]: cycle tabs
      if (e.metaKey && e.shiftKey && e.key === '[') {
        e.preventDefault();
        const prevIndex = activeTabIndex > 0 ? activeTabIndex - 1 : tabs.length - 1;
        handleSelectTab(prevIndex);
      }
      if (e.metaKey && e.shiftKey && e.key === ']') {
        e.preventDefault();
        const nextIndex = activeTabIndex < tabs.length - 1 ? activeTabIndex + 1 : 0;
        handleSelectTab(nextIndex);
      }

      // Cmd+\: toggle split (open split with next tab / close split)
      if (e.metaKey && !e.shiftKey && e.code === 'Backslash') {
        e.preventDefault();
        if (splitTabIndex !== null) {
          // Close split
          setSplitTabIndex(null);
          setActivePane('primary');
        } else {
          // Open split with next tab (or previous if on last)
          const nextIdx = activeTabIndex < tabs.length - 1 ? activeTabIndex + 1 : (activeTabIndex > 0 ? activeTabIndex - 1 : null);
          if (nextIdx !== null && nextIdx !== activeTabIndex) {
            setSplitPaneMarkdown('');
            setSplitTabIndex(nextIdx);
            setActivePane('primary');
            fetchSplitPaneContent(tabs[nextIdx].path);
          }
        }
      }

      // Cmd+Shift+\: switch active pane
      if (e.metaKey && e.shiftKey && e.code === 'Backslash') {
        e.preventDefault();
        if (splitTabIndex !== null) {
          switchActivePane();
        }
      }

      // Escape: close overlays, or exit edit mode, or delegate to vim
      if (e.key === 'Escape') {
        if (showSearch) {
          closeSearch();
        } else if (showNewDocModal) {
          setShowNewDocModal(false);
        } else if (showFileBrowser) {
          setShowFileBrowser(false);
        } else if (showCommentInput) {
          cancelComment();
        } else if (doc.isEditMode) {
          (document.activeElement as HTMLElement)?.blur();
          saveDocument();
        } else {
          // Delegate to vim (clears selection/operator-pending)
          vim.handleKeyDown(e);
        }
        return;
      }

      // Delegate all non-meta vim keys to useVim
      vim.handleKeyDown(e);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [doc.isEditMode, toggleEditMode, saveDocument, activeTabIndex, tabs.length, tabs, handleCloseTab, handleSelectTab, activeTab, comments, claude.isSending, claude.sendToClaude, showFileBrowser, showNewDocModal, showCommentInput, showSearch, cancelComment, closeSearch, vim.handleKeyDown, vim.selectionAnchor, vim.blockIndex, getBlocks, splitTabIndex, fetchSplitPaneContent, switchActivePane]);

  // Electron menu bar actions
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onMenuAction) return;
    const cleanup = api.onMenuAction((action: string, ...args: unknown[]) => {
      switch (action) {
        case 'new-document': setShowNewDocModal(true); break;
        case 'open-file': setShowFileBrowser(true); break;
        case 'open-path':
          if (args[0] && typeof args[0] === 'string') {
            handleSelectFile(args[0] as string);
          }
          break;
        case 'save': if (doc.isEditMode) saveDocument(); break;
        case 'close-tab': handleCloseTab(activeTabIndex); break;
        case 'find': setShowSearch(true); break;
        case 'toggle-edit': toggleEditMode(); break;
        case 'toggle-sidebar': setShowAgentTab(prev => !prev); break;
        case 'toggle-theme': toggleTheme(); break;
        case 'add-comment': setShowCommentInput(true); break;
        case 'send-to-claude':
          if (!claude.isSending && comments.some(c => c.status === 'pending')) {
            claude.sendToClaude();
          }
          break;
        case 'set-model':
          if (args[0] && typeof args[0] === 'string') {
            claude.setModel(args[0] as 'haiku' | 'sonnet' | 'opus');
          }
          break;
        case 'next-tab':
          setActiveTabIndex(prev => prev < tabs.length - 1 ? prev + 1 : 0);
          break;
        case 'prev-tab':
          setActiveTabIndex(prev => prev > 0 ? prev - 1 : tabs.length - 1);
          break;
        case 'toggle-split':
          if (splitTabIndex !== null) {
            setSplitTabIndex(null);
            setActivePane('primary');
          } else {
            const nextIdx = activeTabIndex < tabs.length - 1 ? activeTabIndex + 1 : (activeTabIndex > 0 ? activeTabIndex - 1 : null);
            if (nextIdx !== null && nextIdx !== activeTabIndex) {
              setSplitPaneMarkdown('');
              setSplitTabIndex(nextIdx);
              setActivePane('primary');
              fetchSplitPaneContent(tabs[nextIdx].path);
            }
          }
          break;
        case 'switch-pane':
          if (splitTabIndex !== null) switchActivePane();
          break;
      }
    });
    return cleanup;
  }, [doc.isEditMode, saveDocument, toggleEditMode, activeTabIndex, tabs.length, tabs, handleCloseTab, toggleTheme, claude.isSending, claude.sendToClaude, claude.setModel, comments, splitTabIndex, fetchSplitPaneContent, switchActivePane]);

  // Document-level selection handler
  useEffect(() => {
    const handleSelection = () => {
      setTimeout(() => {
        const selection = window.getSelection();
        const text = selection?.toString().trim();

        if (text && text.length >= 1) {
          try {
            const range = selection?.getRangeAt(0);
            if (!range) return;

            const rect = range.getBoundingClientRect();

            const startContainer = range.startContainer;
            const endContainer = range.endContainer;
            const isInMain = mainRef.current?.contains(startContainer) ||
                            mainRef.current?.contains(endContainer);

            if (rect && rect.width > 0 && rect.height > 0 && isInMain) {
              savedSelectionRef.current = { text, range: range.cloneRange() };
              setSelectedText(text);

              if (text.length >= 3) {
                setTooltipPosition({
                  x: Math.max(80, Math.min(rect.left + rect.width / 2, window.innerWidth - 80)),
                  y: rect.bottom + 10
                });
                setShowMiniTooltip(true);
                setShowCommentInput(false);
              }
            }
          } catch (e) {
            // Selection might be invalid, ignore
          }
        } else {
          setShowMiniTooltip(false);
        }
      }, 10);
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-comment-ui]') && !mainRef.current?.contains(target)) {
        setShowMiniTooltip(false);
        setSelectedText('');
      }
    };

    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mouseup', handleSelection);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [doc.isEditMode]);

  const openCommentInput = () => {
    setShowMiniTooltip(false);
    setShowCommentInput(true);
  };

  const handleAddComment = async (commentText: string, refs?: { docs: string[]; mcps: string[]; vault?: boolean; architecture?: boolean }) => {
    if (commentText.trim() && selectedText) {
      await addComment(selectedText, commentText);
      setNewComment('');
      setShowCommentInput(false);
      setShowMiniTooltip(false);
      setSelectedText('');
      savedSelectionRef.current = { text: '', range: null };
      window.getSelection()?.removeAllRanges();
    }
  };

  const openFileBrowser = useCallback(() => {
    setShowFileBrowser(true);
  }, []);


  const handleSelectFile = useCallback((path: string) => {
    setShowFileBrowser(false);
    const existingIdx = tabs.findIndex(t => t.path === path);
    if (existingIdx >= 0) {
      setActiveTabIndex(existingIdx);
    } else {
      const newTab = { path, title: path.split('/').pop() || 'Untitled' };
      setTabs(prev => {
        const updated = [...prev, newTab];
        setActiveTabIndex(updated.length - 1);
        return updated;
      });
    }
  }, [tabs]);

  const [isCreatingDoc, setIsCreatingDoc] = useState(false);

  const handleNewDocument = useCallback(async (filePath: string, prompt: string) => {
    setShowNewDocModal(false);
    setIsCreatingDoc(true);
    // Send to Claude to write the content — don't open the tab until the file exists
    const isElectron = typeof window !== 'undefined' && !!window.electronAPI;
    if (isElectron) {
      const api = window.electronAPI!;
      const cleanupStream = api.claude.onStream(() => {
        // Could show progress but for now just wait
      });
      const cleanupComplete = api.claude.onComplete(async (data) => {
        cleanupStream();
        cleanupComplete();
        setIsCreatingDoc(false);
        if (data.success) {
          // File now exists — open it in a new tab (this triggers the normal load flow)
          handleSelectFile(filePath);
        }
      });
      await api.claude.sendEdit(
        `Create the file ${filePath} with the following content based on this description: ${prompt}\n\nWrite comprehensive, well-structured markdown content. Include appropriate headers, sections, and formatting.`,
        filePath,
        claude.model
      );
    } else {
      setIsCreatingDoc(false);
    }
  }, [handleSelectFile, claude.model]);

  // Navigate to a related document by name (resolves to sibling .md file)
  const navigateToDocument = useCallback((docName: string) => {
    const dir = doc.filePath.substring(0, doc.filePath.lastIndexOf('/'));
    handleSelectFile(`${dir}/${docName}.md`);
  }, [doc.filePath, handleSelectFile]);

  // Pre-process markdown to convert [[wiki-links]] to clickable spans
  const processWikiLinks = useCallback((md: string): string => {
    return md.replace(/\[\[([^\]]+)\]\]/g, '<a class="wiki-link" data-wiki="$1" href="#">$1</a>');
  }, []);

  const articleRef = useRef<HTMLElement>(null);

  // Highlight text in the rendered DOM for:
  // 1. Saved comments (while they exist)
  // 2. Active selection (while comment drawer is open)
  useEffect(() => {
    const article = articleRef.current;
    if (!article || doc.isEditMode) return;

    // Remove old highlights
    article.querySelectorAll('mark.comment-highlight').forEach((mark) => {
      const parent = mark.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
        parent.normalize();
      }
    });

    // Build list of texts to highlight
    const textsToHighlight: { text: string; tooltip: string; cssClass: string }[] = [];

    // Active selection while drawer is open
    if (showCommentInput && selectedText && selectedText.length >= 3) {
      textsToHighlight.push({ text: selectedText, tooltip: 'Adding comment...', cssClass: 'comment-highlight-active' });
    }

    // Saved comments
    for (const comment of comments) {
      if (comment.selectedText && comment.selectedText.length >= 3) {
        // Don't double-highlight if it's the same as active selection
        if (showCommentInput && comment.selectedText === selectedText) continue;
        const cls = comment.status === 'applied' ? 'comment-highlight-applied' : '';
        textsToHighlight.push({ text: comment.selectedText, tooltip: comment.comment, cssClass: cls });
      }
    }

    if (textsToHighlight.length === 0) return;

    // Build a flat map of text nodes with character offsets for cross-node matching
    const textNodes: { node: Text; start: number; end: number }[] = [];
    let offset = 0;
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
    let tNode: Text | null;
    while ((tNode = walker.nextNode() as Text | null)) {
      const len = tNode.textContent?.length || 0;
      textNodes.push({ node: tNode, start: offset, end: offset + len });
      offset += len;
    }

    const fullText = textNodes.map(tn => tn.node.textContent).join('');
    const matched = new Set<string>();

    for (const { text, tooltip, cssClass } of textsToHighlight) {
      if (matched.has(text)) continue;
      const idx = fullText.indexOf(text);
      if (idx < 0) continue;
      matched.add(text);

      const endIdx = idx + text.length;

      // Find all text nodes that overlap with this range
      for (const tn of textNodes) {
        if (tn.end <= idx || tn.start >= endIdx) continue;

        const markStart = Math.max(0, idx - tn.start);
        const markEnd = Math.min(tn.node.textContent!.length, endIdx - tn.start);

        if (markStart >= markEnd) continue;

        const mark = document.createElement('mark');
        mark.className = 'comment-highlight' + (cssClass ? ' ' + cssClass : '');
        mark.title = tooltip;

        const range = document.createRange();
        range.setStart(tn.node, markStart);
        range.setEnd(tn.node, markEnd);

        try {
          range.surroundContents(mark);
          // surroundContents splits the text node, so update our map
          // Re-walking would be expensive; for now just continue
        } catch {
          // If surroundContents fails (rare), skip this segment
        }
      }
    }
  }, [comments, doc.markdown, doc.isEditMode, showCommentInput, selectedText]);

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden paper-texture"
      style={{ background: 'var(--color-paper)' }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDragOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        const file = e.dataTransfer.files[0];
        if (!file) return;
        // Use Electron's webUtils.getPathForFile (works with sandbox)
        const api = (window as any).electronAPI;
        const filePath = api?.getPathForFile?.(file) || (file as any).path;
        if (filePath) {
          handleSelectFile(filePath);
        } else if (file.name) {
          // Browser fallback: construct from current directory
          const currentDir = doc.filePath.substring(0, doc.filePath.lastIndexOf('/'));
          handleSelectFile(`${currentDir}/${file.name}`);
        }
      }}
    >
      <Header
        isEditMode={doc.isEditMode}
        isSaving={doc.isSaving}
        loadDocument={loadDocument}
        saveDocument={saveDocument}
        toggleEditMode={toggleEditMode}
        setIsEditMode={setIsEditMode}
        openFileBrowser={openFileBrowser}
        onNewDocument={() => setShowNewDocModal(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <TabBar
        tabs={tabs}
        activeIndex={activeTabIndex}
        splitTabIndex={splitTabIndex}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onOpenInSplit={(index) => {
          if (index === activeTabIndex) return;
          setSplitPaneMarkdown('');
          setSplitTabIndex(index);
          setActivePane('primary');
          fetchSplitPaneContent(tabs[index].path);
        }}
        onToggleSplit={() => {
          if (splitTabIndex !== null) {
            setSplitTabIndex(null);
            setActivePane('primary');
          } else {
            const nextIdx = activeTabIndex < tabs.length - 1 ? activeTabIndex + 1 : (activeTabIndex > 0 ? activeTabIndex - 1 : null);
            if (nextIdx !== null && nextIdx !== activeTabIndex) {
              setSplitPaneMarkdown('');
              setSplitTabIndex(nextIdx);
              setActivePane('primary');
              fetchSplitPaneContent(tabs[nextIdx].path);
            }
          }
        }}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* File explorer (left panel) */}
        {showFileExplorer && (
          <div
            style={{
              width: '240px',
              flexShrink: 0,
              borderRight: '1px solid var(--color-border)',
              background: 'var(--color-paper-dark)',
              overflowY: 'auto',
            }}
          >
            <FileExplorer
              show={showFileExplorer}
              currentDir={doc.filePath.substring(0, doc.filePath.lastIndexOf('/'))}
              currentFile={doc.filePath}
              onSelectFile={handleSelectFile}
            />
          </div>
        )}

        {/* Main document area — primary pane */}
        <main
          ref={mainRef}
          className="py-10 px-16 relative overflow-y-auto"
          style={{
            flex: splitTabIndex !== null ? `0 0 ${splitRatio * 100}%` : '1',
            background: 'var(--color-surface)',
            paddingBottom: '48px',
            borderTop: splitTabIndex !== null && activePane === 'primary' ? '2px solid var(--color-accent)' : '2px solid transparent',
            cursor: splitTabIndex !== null ? 'default' : undefined,
          }}
        >
          {/* Pane header when split — click header to switch panes */}
          {splitTabIndex !== null && (
            <div
              className="flex items-center justify-between mb-4 -mt-4 -mx-4 px-4 py-2"
              style={{ background: 'var(--color-paper-dark)', borderBottom: '1px solid var(--color-border)', cursor: activePane !== 'primary' ? 'pointer' : 'default' }}
              onClick={() => { if (activePane !== 'primary') switchActivePane(); }}
            >
              <span className="text-xs font-medium" style={{ color: activePane === 'primary' ? 'var(--color-accent)' : 'var(--color-ink-faded)', fontFamily: 'var(--font-sans)' }}>
                {primaryTitle}
              </span>
              <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--color-paper-dark)', color: 'var(--color-ink-faded)', border: '1px solid var(--color-border)' }}>
                {activePane === 'primary' ? comments.length : splitPaneCommentCount} comments
              </span>
            </div>
          )}

          {showSearch && (
            <SearchBar
              onClose={closeSearch}
              searchText={searchText}
              onSearchChange={(text) => { setSearchText(text); setCurrentSearchMatch(0); }}
              replaceText={replaceText}
              onReplaceChange={setReplaceText}
              currentMatch={currentSearchMatch}
              matchCount={searchMatchCount}
              onNext={searchNext}
              onPrev={searchPrev}
              onReplace={searchReplace}
              onReplaceAll={searchReplaceAll}
            />
          )}
          {isCreatingDoc ? (
            <div
              className="flex flex-col items-center justify-center gap-4 py-20"
              style={{ color: 'var(--color-ink-faded)' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" className="animate-spin">
                <circle cx="12" cy="12" r="10" opacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
              <span className="text-sm">Creating document with Claude...</span>
            </div>
          ) : doc.isLoading ? (
            <div
              className="flex items-center gap-3 animate-pulse-subtle"
              style={{ color: 'var(--color-ink-faded)' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                <circle cx="12" cy="12" r="10" opacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
              Loading document...
            </div>
          ) : (
            <>
              <DocumentInfo
                frontmatter={doc.frontmatter}
                onNavigate={navigateToDocument}
              />
              <div style={{ display: doc.isEditMode ? 'block' : 'none' }}>
                <RichEditor
                  content={doc.editedHtml}
                  onChange={undefined /* HTML read from editorRef on save for perf */}
                  initialBlockIndex={vim.blockIndex}
                  initialWordIndex={vim.wordIndex}
                  isVisible={doc.isEditMode}
                  onCursorBlockChange={(idx) => { editorBlockRef.current = idx; }}
                  onExit={() => {
                    (document.activeElement as HTMLElement)?.blur();
                    saveDocument();
                  }}
                  onEditorReady={(editor) => { editorRef.current = editor; }}
                />
              </div>
              <div style={{ display: doc.isEditMode ? 'none' : 'block' }}>
                {claude.beforeMarkdown && claude.afterMarkdown ? (
                  <DiffView
                    before={claude.beforeMarkdown}
                    after={claude.afterMarkdown}
                    onApprove={() => {
                      claude.approveChanges();
                      comments.filter(c => c.status === 'applied').forEach(c => removeComment(c.id));
                    }}
                    onReject={claude.rejectChanges}
                  />
                ) : (
                  <article
                    ref={articleRef}
                    className="prose prose-editorial max-w-none"
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.classList.contains('wiki-link')) {
                        e.preventDefault();
                        const docName = target.getAttribute('data-wiki');
                        if (docName) navigateToDocument(docName);
                        return;
                      }
                      vim.handleArticleClick(e);
                    }}
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkFrontmatter]} rehypePlugins={[rehypeRaw]}>
                      {processWikiLinks(doc.markdown)}
                    </ReactMarkdown>
                  </article>
                )}
              </div>
            </>
          )}
        </main>

        {/* Resize handle — only when split */}
        {splitTabIndex !== null && (
          <div
            className="split-resize-handle"
            onMouseDown={handleResizeStart}
          />
        )}

        {/* Split pane — read-only view of the other document */}
        {splitTabIndex !== null && (
          <main
            ref={splitMainRef}
            className="py-10 px-16 relative overflow-y-auto"
            style={{
              flex: `0 0 ${(1 - splitRatio) * 100}%`,
              background: 'var(--color-surface)',
              paddingBottom: '48px',
              borderTop: activePane === 'split' ? '2px solid var(--color-accent)' : '2px solid transparent',
              borderLeft: '1px solid var(--color-border)',
            }}
          >
            {/* Pane header — click to switch panes */}
            <div
              className="flex items-center justify-between mb-4 -mt-4 -mx-4 px-4 py-2"
              style={{ background: 'var(--color-paper-dark)', borderBottom: '1px solid var(--color-border)', cursor: activePane !== 'split' ? 'pointer' : 'default' }}
              onClick={() => { if (activePane !== 'split') switchActivePane(); }}
            >
              <span className="text-xs font-medium" style={{ color: activePane === 'split' ? 'var(--color-accent)' : 'var(--color-ink-faded)', fontFamily: 'var(--font-sans)' }}>
                {splitTitle}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--color-paper-dark)', color: 'var(--color-ink-faded)', border: '1px solid var(--color-border)' }}>
                  {activePane === 'split' ? comments.length : splitPaneCommentCount} comments
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); setSplitTabIndex(null); setActivePane('primary'); }}
                  className="p-0.5 rounded hover:bg-black/10 transition-colors"
                  style={{ color: 'var(--color-ink-faded)' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Read-only markdown content */}
            <article
              ref={splitArticleRef}
              className="prose prose-editorial max-w-none"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkFrontmatter]} rehypePlugins={[rehypeRaw]}>
                {processWikiLinks(splitPaneMarkdown)}
              </ReactMarkdown>
            </article>
          </main>
        )}

        {showAgentTab && <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          commentsCount={comments.length}
          isSending={claude.isSending}
          isChatStreaming={chat.isStreaming}
        >
          {activeTab === 'toc' ? (
            <TableOfContentsTab
              markdown={doc.markdown}
              articleRef={articleRef}
              isEditMode={doc.isEditMode}
              editorRef={editorRef}
            />
          ) : activeTab === 'comments' ? (
            <CommentsTab
              comments={comments}
              isSending={claude.isSending}
              selectedText={selectedText}
              savedSelectionRef={savedSelectionRef}
              setSelectedText={setSelectedText}
              setShowCommentInput={setShowCommentInput}
              setShowMiniTooltip={setShowMiniTooltip}
              setTooltipPosition={setTooltipPosition}
              sendToClaude={claude.sendToClaude}
              removeComment={removeComment}
              approveComment={(id) => {
                removeComment(id);
              }}
              onReviseComment={(comment) => {
                setSelectedText(comment.selectedText);
                setShowCommentInput(true);
                removeComment(comment.id);
              }}
              model={claude.model}
              setModel={claude.setModel}
              hasChanges={!!(claude.beforeMarkdown && claude.afterMarkdown)}
            />
          ) : activeTab === 'output' ? (
            <OutputTab
              claudeOutput={claude.claudeOutput}
              streamOutput={claude.streamOutput}
              setStreamOutput={claude.setStreamOutput}
              isStreaming={claude.isStreaming}
              isSending={claude.isSending}
              showLastOutput={claude.showLastOutput}
              setShowLastOutput={claude.setShowLastOutput}
              streamRef={claude.streamRef}
              loadLastOutput={claude.loadLastOutput}
              changelogs={changelog.changelogs}
              expandedEntryId={changelog.expandedEntryId}
              setExpandedEntryId={changelog.setExpandedEntryId}
              onClearChangelogs={() => changelog.clearChangelogs(doc.filePath)}
            />
          ) : (
            <ChatTab
              sessions={chat.sessions}
              activeSessionId={chat.activeSessionId}
              messages={chat.messages}
              streamOutput={chat.streamOutput}
              isStreaming={chat.isStreaming}
              streamRef={chat.streamRef}
              selectedText={selectedText}
              onNewSession={chat.newSession}
              onSelectSession={chat.selectSession}
              onSendMessage={chat.sendMessage}
              onDeleteSession={chat.deleteSession}
              draft={chatDraft}
              onDraftChange={setChatDraft}
              currentDir={doc.filePath.substring(0, doc.filePath.lastIndexOf('/'))}
              vaultRoot={vaultRoot}
            />
          )}
        </Sidebar>}
      </div>

      <CommentTooltip
        show={showMiniTooltip && !showCommentInput && selectedText.length >= 3}
        position={tooltipPosition}
        onAddComment={openCommentInput}
      />

      <CommentDrawer
        show={showCommentInput}
        selectedText={selectedText}
        newComment={newComment}
        setNewComment={setNewComment}
        onSubmit={handleAddComment}
        onCancel={cancelComment}
        currentDir={doc.filePath.substring(0, doc.filePath.lastIndexOf('/'))}
        vaultRoot={vaultRoot}
      />

      <NewDocumentModal
        show={showNewDocModal}
        currentDir={doc.filePath.substring(0, doc.filePath.lastIndexOf('/'))}
        onSubmit={handleNewDocument}
        onCancel={() => setShowNewDocModal(false)}
      />

      <FileBrowser
        show={showFileBrowser}
        filePath={doc.filePath}
        recentFiles={recentFiles}
        onSelectFile={handleSelectFile}
        onClose={() => setShowFileBrowser(false)}
      />

      {/* Status bar */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: '12px',
          paddingRight: '12px',
          fontSize: '11px',
          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          letterSpacing: '0.05em',
          background: vim.enabled
            ? vim.mode === 'INSERT' ? 'var(--color-vim-insert-bg)'
              : vim.mode === 'OPERATOR_PENDING' ? 'var(--color-vim-operator-bg, var(--color-vim-normal-bg))'
              : vim.mode === 'VISUAL' ? 'var(--color-vim-visual-bg, var(--color-vim-normal-bg))'
              : 'var(--color-vim-normal-bg)'
            : 'var(--color-vim-normal-bg)',
          color: vim.enabled
            ? vim.mode === 'INSERT' ? 'var(--color-vim-insert-fg)'
              : vim.mode === 'OPERATOR_PENDING' ? 'var(--color-vim-operator-fg, var(--color-vim-normal-fg))'
              : vim.mode === 'VISUAL' ? 'var(--color-vim-visual-fg, var(--color-vim-normal-fg))'
              : 'var(--color-vim-normal-fg)'
            : 'var(--color-vim-normal-fg)',
          zIndex: 50,
          transition: 'background 0.2s, color 0.2s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {vim.enabled ? (
            <>
              <span style={{ fontWeight: 600 }}>{vim.modeLabel}</span>
              <span style={{ opacity: 0.5 }}>{vim.statusText}</span>
            </>
          ) : (
            <span style={{ opacity: 0.5 }}>
              {doc.isEditMode ? 'Cmd+E to exit edit' : 'Cmd+E to edit'}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', opacity: 0.5 }}>
          {vim.enabled && vim.mode === 'NORMAL' && (
            <span>Ln {vim.blockIndex + 1}:{vim.wordIndex + 1}</span>
          )}
          <span>{doc.filePath.split('/').pop()}</span>
          <span
            onClick={vim.toggleEnabled}
            style={{
              cursor: 'pointer',
              padding: '0 4px',
              borderRadius: '2px',
              background: vim.enabled ? 'var(--color-accent-subtle)' : 'transparent',
              color: vim.enabled ? 'var(--color-accent)' : 'inherit',
              opacity: vim.enabled ? 1 : 0.6,
            }}
          >
            {vim.enabled ? 'VIM' : 'vim'}
          </span>
        </div>
      </div>

      {isDragOver && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--color-accent-subtle)',
            border: '3px dashed var(--color-accent)',
            borderRadius: '8px',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              padding: '16px 32px',
              background: 'var(--color-surface)',
              borderRadius: '8px',
              color: 'var(--color-accent)',
              fontSize: '18px',
              fontWeight: 600,
              boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
            }}
          >
            Drop .md file to open
          </div>
        </div>
      )}
    </div>
  );
}
