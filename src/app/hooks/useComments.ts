'use client';

import { useState, useEffect } from 'react';
import { Comment } from '../types';

export function useComments(filePath: string) {
  const [comments, setComments] = useState<Comment[]>([]);

  // Clear stale comments immediately on doc switch; loadDocument will repopulate
  useEffect(() => { setComments([]); }, [filePath]);

  const addComment = async (selectedText: string, instruction: string) => {
    const lineHint = selectedText.substring(0, 50) + (selectedText.length > 50 ? '...' : '');

    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_path: filePath,
          selected_text: selectedText,
          instruction,
          line_hint: lineHint
        })
      });
      const data = await res.json();
      if (data.comment) {
        setComments(prev => [...prev, {
          id: data.comment.id,
          selectedText: data.comment.selected_text,
          comment: data.comment.instruction,
          lineHint: data.comment.line_hint || lineHint,
          timestamp: new Date(data.comment.created_at),
          status: 'pending' as const,
        }]);
      }
    } catch (error) {
      console.error('Failed to create comment:', error);
    }
  };

  const removeComment = async (id: number) => {
    try {
      await fetch(`/api/comments?id=${id}`, { method: 'DELETE' });
      setComments(comments.filter(c => c.id !== id));
    } catch (error) {
      console.error('Failed to delete comment:', error);
    }
  };

  const patchComments = async (requestId: string) => {
    try {
      await Promise.all(comments.map(c =>
        fetch('/api/comments', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: c.id, status: 'sent', request_id: requestId })
        })
      ));
    } catch (error) {
      console.error('Failed to update comment statuses:', error);
    }
  };

  const markApplied = () => {
    setComments(prev => prev.map(c =>
      c.status === 'pending' ? { ...c, status: 'applied' as const } : c
    ));
  };

  return {
    comments,
    setComments,
    addComment,
    removeComment,
    patchComments,
    markApplied,
  };
}
