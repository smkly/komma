'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import TurndownService from 'turndown';
import { marked } from 'marked';
import { Comment, ChangelogEntry } from '../types';
import type { ParsedFrontmatter } from '@/lib/documents';

export function useDocument() {
  const [filePath, setFilePathState] = useState('');
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

  // Check for file opened externally (e.g. Finder double-click via IPC)
  // No auto-restore of last document — app starts with no file open
  useEffect(() => {
    (async () => {
      try {
        // Only check for pending Finder open (temp file), don't restore last doc
        const res = await fetch('/api/last-document');
        const data = await res.json();
        if (data.filePath && !externalOpenRef.current && data.filePath.startsWith('/') && data.fromFinder) {
          setFilePathState(data.filePath);
        }
      } catch {
        // DB not ready yet on first launch
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
    // Preserve images — use raw HTML when dimensions are set (to keep width/height from TipTap)
    service.addRule('img', {
      filter: 'img',
      replacement: function(_content, node) {
        const img = node as HTMLImageElement;
        const src = img.getAttribute('src') || '';
        if (!src) return '';
        const alt = img.alt || '';
        const width = img.getAttribute('width') || img.style.width;
        const height = img.getAttribute('height') || img.style.height;
        if (width || height) {
          const w = width ? ` width="${width}"` : '';
          const h = height ? ` height="${height}"` : '';
          return `\n\n<img src="${src}" alt="${alt}"${w}${h} />\n\n`;
        }
        return `![${alt}](${src})`;
      }
    });
    return service;
  });

  // Load the markdown file (returns loaded comments and changelogs for sibling hooks)
  const loadDocument = useCallback(async (): Promise<{
    comments: Comment[];
    changelogs: ChangelogEntry[];
  }> => {
    if (!filePath) {
      setIsLoading(false);
      return { comments: [], changelogs: [] };
    }
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
    if (isSaving) return;
    setIsSaving(true);
    try {
      let html = overrideHtml || editedHtml;

      // Convert API image URLs back to relative paths before saving
      const docDir = filePath.substring(0, filePath.lastIndexOf('/'));
      html = html.replace(/\/api\/image\?path=([^"]+)/g, (_match, encodedPath) => {
        const absPath = decodeURIComponent(encodedPath);
        if (absPath.startsWith(docDir + '/')) {
          return absPath.slice(docDir.length + 1);
        }
        return absPath;
      });

      // Extract data URI images, save as files, replace with relative paths
      const dataUriPattern = /src="(data:image\/[^;]+;base64,[^"]+)"/g;
      const matches = [...html.matchAll(dataUriPattern)];
      for (const match of matches) {
        try {
          const res = await fetch('/api/save-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUri: match[1], docPath: filePath }),
          });
          const data = await res.json();
          if (data.relative) {
            html = html.replace(match[1], data.relative);
          }
        } catch { /* keep data URI if save fails */ }
      }

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
        setEditedHtml('');
        setEditedMarkdown('');
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
      // Resolve relative image paths through the API so TipTap can load them
      let html = marked(bodyMd) as string;
      const docDir = filePath.substring(0, filePath.lastIndexOf('/'));
      html = html.replace(/<img\s+([^>]*?)src="([^"]+)"/gi, (_match, before, src) => {
        if (src.startsWith('http') || src.startsWith('data:') || src.startsWith('/api/')) return _match;
        return `<img ${before}src="/api/image?path=${encodeURIComponent(docDir + '/' + src)}"`;
      });
      setEditedHtml(html);
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
