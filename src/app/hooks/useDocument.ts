'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import TurndownService from 'turndown';
import { marked } from 'marked';
import { Comment, ChangelogEntry } from '../types';
import type { ParsedFrontmatter } from '@/lib/documents';

export function useDocument() {
  const DEFAULT_PATH = '/Users/sheldon/Developer/torque/vault/PRODUCT_FEATURES.md';
  const [filePath, setFilePathState] = useState(DEFAULT_PATH);
  const [markdown, setMarkdownState] = useState<string>('');
  const [editedMarkdown, setEditedMarkdown] = useState<string>('');
  const [editedHtml, setEditedHtml] = useState<string>('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRestoringPath, setIsRestoringPath] = useState(true);
  const [frontmatter, setFrontmatter] = useState<ParsedFrontmatter | null>(null);
  const rawFrontmatterRef = useRef<string | null>(null);

  // Track whether an external open (IPC) changed the path before restore finished
  const externalOpenRef = useRef(false);
  const setFilePath = useCallback((path: string) => {
    if (isRestoringPath) {
      externalOpenRef.current = true;
    }
    setFilePathState(path);
  }, [isRestoringPath]);

  // Restore last document before initial load — blocks loadDocument until resolved
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/last-document');
        const data = await res.json();
        // Skip restore if an IPC open-path already set the file
        // Validate path looks like an actual file path (not a warmup artifact)
        if (data.filePath && !externalOpenRef.current && data.filePath.startsWith('/')) {
          setFilePathState(data.filePath);
        }
      } catch {
        // DB not ready yet on first launch — use default
      }
      setIsRestoringPath(false);
    })();
  }, []);

  // Ref tracks latest markdown synchronously (for toggleEditMode to read after setMarkdown)
  const markdownRef = useRef<string>('');
  markdownRef.current = markdown;
  const setMarkdown = useCallback((md: string) => {
    markdownRef.current = md;
    setMarkdownState(md);
  }, []);

  // Turndown service for HTML to Markdown
  const turndownService = useRef(() => {
    const service = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
    });
    // Add table support
    service.addRule('table', {
      filter: 'table',
      replacement: function(content, node) {
        const table = node as HTMLTableElement;
        const rows = Array.from(table.querySelectorAll('tr'));
        if (rows.length === 0) return content;

        const result: string[] = [];
        rows.forEach((row, i) => {
          const cells = Array.from(row.querySelectorAll('th, td'));
          const cellTexts = cells.map(cell => cell.textContent?.trim() || '');
          result.push('| ' + cellTexts.join(' | ') + ' |');
          if (i === 0) {
            result.push('|' + cells.map(() => '------').join('|') + '|');
          }
        });
        return '\n' + result.join('\n') + '\n';
      }
    });
    return service;
  });

  // Load the markdown file (returns loaded comments and changelogs for sibling hooks)
  const loadDocument = useCallback(async (): Promise<{
    comments: Comment[];
    changelogs: ChangelogEntry[];
  }> => {
    setIsLoading(true);
    setMarkdown('');
    let loadedComments: Comment[] = [];
    let loadedChangelogs: ChangelogEntry[] = [];
    const fetchWithRetry = async (url: string, retries = 5): Promise<Response> => {
      for (let i = 0; i < retries; i++) {
        try {
          const res = await fetch(url);
          if (res.ok) return res;
        } catch {
          if (i === retries - 1) throw new Error(`Failed to fetch ${url}`);
        }
        await new Promise(r => setTimeout(r, 1500 * (i + 1)));
      }
      throw new Error(`Failed to fetch after ${retries} retries`);
    };
    try {
      const [fileRes, commentsRes, changelogsRes, frontmatterRes] = await Promise.all([
        fetchWithRetry(`/api/file?path=${encodeURIComponent(filePath)}`),
        fetchWithRetry(`/api/comments?document_path=${encodeURIComponent(filePath)}`),
        fetchWithRetry(`/api/changelogs?document_path=${encodeURIComponent(filePath)}`),
        fetchWithRetry(`/api/frontmatter?path=${encodeURIComponent(filePath)}`)
      ]);
      const data = await fileRes.json();
      setMarkdown(data.content || '');
      const fmData = await frontmatterRes.json();
      setFrontmatter(fmData.frontmatter || null);
      rawFrontmatterRef.current = fmData.rawFrontmatter || null;
      const commentsData = await commentsRes.json();
      if (commentsData.comments) {
        loadedComments = commentsData.comments.map((c: { id: number; selected_text: string; instruction: string; line_hint: string | null; created_at: string; status: string }) => ({
          id: c.id,
          selectedText: c.selected_text,
          comment: c.instruction,
          lineHint: c.line_hint || c.selected_text.substring(0, 50) + (c.selected_text.length > 50 ? '...' : ''),
          timestamp: new Date(c.created_at),
          status: (c.status === 'applied' ? 'applied' : 'pending') as 'pending' | 'applied',
        }));
      }
      const changelogsData = await changelogsRes.json();
      if (changelogsData.changelogs) {
        loadedChangelogs = changelogsData.changelogs;
      }
    } catch (error) {
      console.error('Failed to load document:', error);
    }
    setIsLoading(false);
    return { comments: loadedComments, changelogs: loadedChangelogs };
  }, [filePath]);

  // Initialize edit mode with current markdown (strip frontmatter)
  useEffect(() => {
    if (isEditMode && editedMarkdown === '') {
      let bodyMd = markdown;
      if (rawFrontmatterRef.current && bodyMd.startsWith(rawFrontmatterRef.current)) {
        bodyMd = bodyMd.slice(rawFrontmatterRef.current.length);
      }
      setEditedMarkdown(bodyMd);
    }
  }, [isEditMode, markdown, editedMarkdown]);

  // Save edited markdown, preserving frontmatter
  // overrideHtml: pass editor HTML directly to avoid stale state from debounced updates
  const saveDocument = async (overrideHtml?: string) => {
    setIsSaving(true);
    try {
      const html = overrideHtml || editedHtml;
      let contentToSave = turndownService.current().turndown(html);

      // Re-prepend original frontmatter if it existed
      if (rawFrontmatterRef.current) {
        contentToSave = rawFrontmatterRef.current + contentToSave;
      }

      const res = await fetch('/api/file', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content: contentToSave })
      });
      if (res.ok) {
        setMarkdown(contentToSave);
        setIsEditMode(false);
      }
    } catch (error) {
      console.error('Failed to save document:', error);
    }
    setIsSaving(false);
  };

  const toggleEditMode = () => {
    if (!isEditMode) {
      // Read from ref (not state) so callers can setMarkdown + toggleEditMode in same tick
      let bodyMd = markdownRef.current;
      if (rawFrontmatterRef.current && bodyMd.startsWith(rawFrontmatterRef.current)) {
        bodyMd = bodyMd.slice(rawFrontmatterRef.current.length);
      }
      setEditedMarkdown(bodyMd);
      setEditedHtml(marked(bodyMd) as string);
    }
    setIsEditMode(!isEditMode);
  };

  return {
    filePath,
    setFilePath,
    markdown,
    setMarkdown,
    editedMarkdown,
    setEditedMarkdown,
    editedHtml,
    setEditedHtml,
    isEditMode,
    setIsEditMode,
    isLoading,
    isRestoringPath,
    isSaving,
    frontmatter,
    loadDocument,
    saveDocument,
    toggleEditMode,
  };
}
