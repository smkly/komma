import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getPathForFile(file: File): string {
    return webUtils.getPathForFile(file);
  },
  onMenuAction(callback: (action: string, ...args: unknown[]) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, action: string, ...args: unknown[]) => {
      callback(action, ...args);
    };
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  },
  getPendingFile(): Promise<string | null> {
    return ipcRenderer.invoke('app:get-pending-file');
  },
  vault: {
    resolveRoot(fromPath: string): Promise<string | null> {
      return ipcRenderer.invoke('vault:resolve-root', fromPath);
    },
    getIndex(fromPath: string): Promise<{ vaultRoot: string; files: Array<{ relativePath: string; firstLine: string }> } | null> {
      return ipcRenderer.invoke('vault:get-index', fromPath);
    },
    listFiles(fromPath: string): Promise<string[]> {
      return ipcRenderer.invoke('vault:list-files', fromPath);
    },
  },
  claude: {
    sendEdit(prompt: string, filePath: string, model?: string, refs?: { docs: string[]; mcps: string[]; vault?: boolean; architecture?: boolean }): Promise<void> {
      return ipcRenderer.invoke('claude:send-edit', prompt, filePath, model, refs);
    },
    sendChat(
      message: string,
      docPath: string,
      sessionId: number | null,
      contextSelection: string | null,
      history: Array<{ role: string; content: string }>,
      model?: string,
      refs?: { docs: string[]; mcps: string[]; vault?: boolean; architecture?: boolean },
    ): Promise<void> {
      return ipcRenderer.invoke(
        'claude:send-chat',
        message,
        docPath,
        sessionId,
        contextSelection,
        history,
        model,
        refs,
      );
    },
    cancel(): Promise<void> {
      return ipcRenderer.invoke('claude:cancel');
    },
    listMcps(): Promise<{ name: string }[]> {
      return ipcRenderer.invoke('claude:list-mcps');
    },
    onStream(
      callback: (data: { type: 'edit' | 'chat'; content: string }) => void,
    ): () => void {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { type: 'edit' | 'chat'; content: string },
      ) => {
        callback(data);
      };
      ipcRenderer.on('claude:stream', handler);
      return () => {
        ipcRenderer.removeListener('claude:stream', handler);
      };
    },
    onComplete(
      callback: (data: {
        type: 'edit' | 'chat';
        success: boolean;
        content?: string;
        error?: string;
      }) => void,
    ): () => void {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: {
          type: 'edit' | 'chat';
          success: boolean;
          content?: string;
          error?: string;
        },
      ) => {
        callback(data);
      };
      ipcRenderer.on('claude:complete', handler);
      return () => {
        ipcRenderer.removeListener('claude:complete', handler);
      };
    },
  },
});
