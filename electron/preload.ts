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
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (key: string, value: any) => ipcRenderer.invoke('settings:set', key, value),
  },
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
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
  google: {
    checkExisting(docPath: string): Promise<{ url: string; title: string; updatedAt: string } | null> {
      return ipcRenderer.invoke('google:check-existing', docPath);
    },
    shareDoc(markdown: string, title: string, docPath: string, action?: 'new' | 'update'): Promise<{ success: boolean; url?: string; error?: string }> {
      return ipcRenderer.invoke('google:share-doc', markdown, title, docPath, action);
    },
    openUrl(url: string): Promise<void> {
      return ipcRenderer.invoke('google:open-url', url);
    },
    signOut(): Promise<void> {
      return ipcRenderer.invoke('google:sign-out');
    },
    pullDoc(localPath: string): Promise<{
      comments: Array<{ googleId: string; selectedText: string; comment: string; createdTime: string }>;
      remoteText: string;
    }> {
      return ipcRenderer.invoke('google:pull-doc', localPath);
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
      images?: Array<{ data: string; mimeType: string; name: string }>,
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
        images,
      );
    },
    cancel(): Promise<void> {
      return ipcRenderer.invoke('claude:cancel');
    },
    listMcps(): Promise<{ name: string; source?: string }[]> {
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
    multiGenerate(
      sections: Array<{ title: string; prompt: string }>,
      filePath: string,
      outline: string,
      model?: string,
    ): Promise<{ success: boolean; filePath?: string }> {
      return ipcRenderer.invoke('claude:multi-generate', sections, filePath, outline, model);
    },
    multiCancel(): Promise<void> {
      return ipcRenderer.invoke('claude:multi-cancel');
    },
    onMultiProgress(
      callback: (data: { sectionIndex: number; status: string; output: string }) => void,
    ): () => void {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { sectionIndex: number; status: string; output: string },
      ) => {
        callback(data);
      };
      ipcRenderer.on('claude:multi-progress', handler);
      return () => {
        ipcRenderer.removeListener('claude:multi-progress', handler);
      };
    },
    onMultiComplete(
      callback: (data: { success: boolean; filePath?: string; cancelled?: boolean }) => void,
    ): () => void {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { success: boolean; filePath?: string; cancelled?: boolean },
      ) => {
        callback(data);
      };
      ipcRenderer.on('claude:multi-complete', handler);
      return () => {
        ipcRenderer.removeListener('claude:multi-complete', handler);
      };
    },
  },
});
