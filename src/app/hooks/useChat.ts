'use client';

import { useState, useRef, useCallback } from 'react';

interface ChatSession {
  id: number;
  document_id: number;
  created_at: string;
  updated_at: string;
}

interface ChatMessage {
  id: number;
  session_id: number;
  role: 'user' | 'assistant';
  content: string;
  context_selection: string | null;
  created_at: string;
}

export type { ChatSession, ChatMessage };

export function useChat(documentPath: string, model?: string) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamOutput, setStreamOutput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(async (docPath: string) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`/api/chat?document_path=${encodeURIComponent(docPath)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.sessions) setSessions(data.sessions);
          return;
        }
      } catch {
        if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }, []);

  const loadMessages = useCallback(async (sessionId: number) => {
    try {
      const res = await fetch(`/api/chat?session_id=${sessionId}`);
      const data = await res.json();
      if (data.messages) {
        setMessages(data.messages);
      }
    } catch (error) {
      console.error('Failed to load chat messages:', error);
    }
  }, []);

  const newSession = useCallback(() => {
    setActiveSessionId(null);
    setMessages([]);
    setStreamOutput('');
  }, []);

  const selectSession = useCallback(async (sessionId: number) => {
    setActiveSessionId(sessionId);
    setStreamOutput('');
    await loadMessages(sessionId);
  }, [loadMessages]);

  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

  const sendMessage = useCallback(async (message: string, contextSelection?: string) => {
    setIsStreaming(true);
    setStreamOutput('');

    // Clear stream file (only needed for file-based flow)
    if (!isElectron) {
      try {
        await fetch('/api/chat/stream', { method: 'DELETE' });
      } catch (e) {
        // Ignore
      }
    }

    // Optimistically add user message to local state
    const tempId = -Date.now();
    const tempUserMsg: ChatMessage = {
      id: tempId,
      session_id: activeSessionId || 0,
      role: 'user',
      content: message,
      context_selection: contextSelection || null,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      // DB operations still go through API routes (Next.js server runs locally)
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_path: documentPath,
          message,
          session_id: activeSessionId,
          context_selection: contextSelection,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        setMessages(prev => prev.filter(m => m.id !== tempId));
        setIsStreaming(false);
        return;
      }

      const sessionId = data.session_id;

      // Update session ID if new session was created
      if (!activeSessionId) {
        setActiveSessionId(sessionId);
        await loadSessions(documentPath);
      }

      // Replace temp message with real one from DB
      if (data.message) {
        setMessages(prev => prev.map(m => m.id === tempId ? data.message : m));
      }

      if (isElectron) {
        // Electron IPC flow - spawn Claude CLI directly via main process
        const api = window.electronAPI!;

        // Build history from current messages for context
        const history = messages.map(m => ({ role: m.role, content: m.content }));

        const cleanupStream = api.claude.onStream((streamData) => {
          if (streamData.type === 'chat') {
            setStreamOutput(streamData.content);
            if (streamRef.current) {
              streamRef.current.scrollTop = streamRef.current.scrollHeight;
            }
          }
        });

        const cleanupComplete = api.claude.onComplete(async (completeData) => {
          if (completeData.type === 'chat') {
            cleanupStream();
            cleanupComplete();

            if (completeData.success && completeData.content) {
              // Save assistant response to DB
              await fetch('/api/chat', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId, content: completeData.content }),
              });

              setMessages(prev => [...prev, {
                id: Date.now(),
                session_id: sessionId,
                role: 'assistant' as const,
                content: completeData.content!,
                context_selection: null,
                created_at: new Date().toISOString(),
              }]);
            } else {
              setMessages(prev => [...prev, {
                id: Date.now(),
                session_id: sessionId,
                role: 'assistant' as const,
                content: `Error: ${completeData.error || 'Failed to get response'}`,
                context_selection: null,
                created_at: new Date().toISOString(),
              }]);
            }

            setIsStreaming(false);
            setStreamOutput('');
          }
        });

        await api.claude.sendChat(
          message,
          documentPath,
          activeSessionId,
          contextSelection || null,
          history,
          model
        );
      } else {
        // Fetch-based flow (Next.js API routes + file watcher)
        const poll = async () => {
          // Poll stream output
          try {
            const streamRes = await fetch('/api/chat/stream');
            const streamData = await streamRes.json();
            if (streamData.content) {
              setStreamOutput(streamData.content);
              if (streamRef.current) {
                streamRef.current.scrollTop = streamRef.current.scrollHeight;
              }
            }
          } catch (e) {
            // Ignore
          }

          // Check response status
          try {
            const statusRes = await fetch('/api/chat/status');
            const status = await statusRes.json();

            if (status.status === 'complete' && status.content) {
              // Save assistant response to DB
              await fetch('/api/chat', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId, content: status.content }),
              });

              setMessages(prev => [...prev, {
                id: Date.now(),
                session_id: sessionId,
                role: 'assistant' as const,
                content: status.content,
                context_selection: null,
                created_at: new Date().toISOString(),
              }]);
              setIsStreaming(false);
              setStreamOutput('');
              return;
            }

            if (status.status === 'error') {
              setMessages(prev => [...prev, {
                id: Date.now(),
                session_id: sessionId,
                role: 'assistant' as const,
                content: `Error: ${status.content || 'Failed to get response'}`,
                context_selection: null,
                created_at: new Date().toISOString(),
              }]);
              setIsStreaming(false);
              setStreamOutput('');
              return;
            }
          } catch (e) {
            // Ignore
          }

          setTimeout(poll, 500);
        };

        poll();
      }
    } catch (error) {
      console.error('Failed to send chat message:', error);
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setIsStreaming(false);
    }
  }, [activeSessionId, documentPath, loadSessions, messages, isElectron, model]);

  const deleteSession = useCallback(async (sessionId: number) => {
    try {
      await fetch(`/api/chat?session_id=${sessionId}`, { method: 'DELETE' });
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to delete chat session:', error);
    }
  }, [activeSessionId]);

  return {
    sessions,
    activeSessionId,
    messages,
    streamOutput,
    isStreaming,
    streamRef,
    loadSessions,
    loadMessages,
    newSession,
    selectSession,
    sendMessage,
    deleteSession,
  };
}
