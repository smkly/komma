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
  file: {
    rename(filePath: string, newName: string): Promise<{ success: boolean; newPath?: string; error?: string }> {
      return ipcRenderer.invoke('file:rename', filePath, newName);
    },
    move(filePath: string, destDir: string): Promise<{ success: boolean; newPath?: string; error?: string }> {
      return ipcRenderer.invoke('file:move', filePath, destDir);
    },
    delete(filePath: string): Promise<{ success: boolean; error?: string }> {
      return ipcRenderer.invoke('file:delete', filePath);
    },
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
    search(fromPath: string, query: string): Promise<Array<{ relativePath: string; line: number; text: string }>> {
      return ipcRenderer.invoke('vault:search', fromPath, query);
    },
    backlinks(fromPath: string, targetFile: string): Promise<Array<{ relativePath: string; line: number; text: string }>> {
      return ipcRenderer.invoke('vault:backlinks', fromPath, targetFile);
    },
    tags(fromPath: string): Promise<Array<{ tag: string; count: number; files: string[] }>> {
      return ipcRenderer.invoke('vault:tags', fromPath);
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
    checkConfigured(): Promise<boolean> {
      return ipcRenderer.invoke('google:check-configured');
    },
    saveCredentials(clientId: string, clientSecret: string): Promise<boolean> {
      return ipcRenderer.invoke('google:save-credentials', clientId, clientSecret);
    },
    loadCredentials(): Promise<{ clientId: string; clientSecret: string }> {
      return ipcRenderer.invoke('google:load-credentials');
    },
    pullDoc(localPath: string): Promise<{
      comments: Array<{ googleId: string; selectedText: string; comment: string; createdTime: string }>;
      remoteText: string;
    }> {
      return ipcRenderer.invoke('google:pull-doc', localPath);
    },
  },
  git: {
    commit(filePath: string, message: string): Promise<{ success: boolean; error?: string; sha?: string; skipped?: boolean; noChanges?: boolean }> {
      return ipcRenderer.invoke('git:commit', filePath, message);
    },
    log(filePath: string, limit?: number): Promise<{ success: boolean; commits?: Array<{ hash: string; shortHash: string; message: string; date: string; author: string }>; error?: string }> {
      return ipcRenderer.invoke('git:log', filePath, limit);
    },
    show(filePath: string, sha: string): Promise<{ success: boolean; content?: string; error?: string }> {
      return ipcRenderer.invoke('git:show', filePath, sha);
    },
    push(filePath: string, message?: string): Promise<{ success: boolean; error?: string; sha?: string; remote?: string; branch?: string }> {
      return ipcRenderer.invoke('git:push', filePath, message);
    },
    remoteInfo(filePath: string): Promise<{ success: boolean; remoteUrl?: string | null; remoteName?: string | null; branch?: string | null; error?: string }> {
      return ipcRenderer.invoke('git:remote-info', filePath);
    },
    createReview(filePath: string, title?: string): Promise<{ success: boolean; error?: string; branchName?: string; prNumber?: number; prUrl?: string }> {
      return ipcRenderer.invoke('git:create-review', filePath, title);
    },
    prComments(filePath: string, prNumber: number): Promise<{ success: boolean; error?: string; comments?: any[] }> {
      return ipcRenderer.invoke('git:pr-comments', filePath, prNumber);
    },
    prStatus(filePath: string): Promise<{ success: boolean; error?: string; pr?: { number: number; title: string; state: string; url: string } | null; branch?: string }> {
      return ipcRenderer.invoke('git:pr-status', filePath);
    },
    pushReviewUpdate(filePath: string, message?: string): Promise<{ success: boolean; error?: string; branch?: string }> {
      return ipcRenderer.invoke('git:push-review-update', filePath, message);
    },
  },
  templates: {
    listCustom(): Promise<any[]> {
      return ipcRenderer.invoke('templates:list-custom');
    },
    saveCustom(template: {
      id: string; name: string; description: string; promptPrefix: string;
      sections: string[]; skeleton: string; mcpRefs?: string[];
    }): Promise<{ success: boolean; error?: string }> {
      return ipcRenderer.invoke('templates:save-custom', template);
    },
    deleteCustom(templateId: string): Promise<{ success: boolean; error?: string }> {
      return ipcRenderer.invoke('templates:delete-custom', templateId);
    },
  },
  quickCapture: {
    inferTemplate(description: string): Promise<{ templateId: string; folder: string }> {
      return ipcRenderer.invoke('quick-capture:infer-template', description);
    },
    getShortcut(): Promise<string> {
      return ipcRenderer.invoke('quick-capture:get-shortcut');
    },
    setShortcut(shortcut: string): Promise<{ success: boolean }> {
      return ipcRenderer.invoke('quick-capture:set-shortcut', shortcut);
    },
  },
  claude: {
    sendEdit(prompt: string, filePath: string, model?: string, refs?: { docs: string[]; mcps: string[]; vault?: boolean; architecture?: boolean; skills?: string[] }): Promise<void> {
      return ipcRenderer.invoke('claude:send-edit', prompt, filePath, model, refs);
    },
    sendChat(
      message: string,
      docPath: string,
      sessionId: number | null,
      contextSelection: string | null,
      history: Array<{ role: string; content: string }>,
      model?: string,
      refs?: { docs: string[]; mcps: string[]; vault?: boolean; architecture?: boolean; skills?: string[] },
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
    reviseChunk(chunkId: string, beforeText: string, currentAfterText: string, instruction: string, model?: string):
      Promise<{ success: boolean; revisedText?: string; error?: string }> {
      return ipcRenderer.invoke('claude:revise-chunk', chunkId, beforeText, currentAfterText, instruction, model);
    },
    listMcps(): Promise<{ name: string; source?: string }[]> {
      return ipcRenderer.invoke('claude:list-mcps');
    },
    listSkills(): Promise<{ name: string; description?: string; source?: string }[]> {
      return ipcRenderer.invoke('claude:list-skills');
    },
    readSkill(name: string): Promise<string | null> {
      return ipcRenderer.invoke('claude:read-skill', name);
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
        proposal?: { originalContent: string; proposedContent: string; docPath: string } | null;
      }) => void,
    ): () => void {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: {
          type: 'edit' | 'chat';
          success: boolean;
          content?: string;
          error?: string;
          proposal?: { originalContent: string; proposedContent: string; docPath: string } | null;
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
