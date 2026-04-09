export {};

interface VaultRefs {
  docs: string[];
  mcps: string[];
  vault?: boolean;
  architecture?: boolean;
  skills?: string[];
}

interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  date: string;
  author: string;
}

declare global {
  interface Window {
    electronAPI?: {
      onMenuAction(callback: (action: string, ...args: unknown[]) => void): () => void;
      getPendingFile(): Promise<string | null>;
      settings: {
        get(): Promise<Record<string, any>>;
        set(key: string, value: any): Promise<Record<string, any>>;
      };
      dialog: {
        openDirectory(): Promise<string | null>;
      };
      file: {
        rename(filePath: string, newName: string): Promise<{ success: boolean; newPath?: string; error?: string }>;
        move(filePath: string, destDir: string): Promise<{ success: boolean; newPath?: string; error?: string }>;
        delete(filePath: string): Promise<{ success: boolean; error?: string }>;
      };
      vault: {
        resolveRoot(fromPath: string): Promise<string | null>;
        getIndex(fromPath: string): Promise<{
          vaultRoot: string;
          files: Array<{ relativePath: string; firstLine: string }>;
        } | null>;
        listFiles(fromPath: string): Promise<string[]>;
        search(fromPath: string, query: string): Promise<Array<{ relativePath: string; line: number; text: string }>>;
        backlinks(fromPath: string, targetFile: string): Promise<Array<{ relativePath: string; line: number; text: string }>>;
        tags(fromPath: string): Promise<Array<{ tag: string; count: number; files: string[] }>>;
      };
      google: {
        checkExisting(docPath: string): Promise<{ url: string; title: string; updatedAt: string } | null>;
        shareDoc(markdown: string, title: string, docPath: string, action?: 'new' | 'update'): Promise<{ success: boolean; url?: string; error?: string }>;
        openUrl(url: string): Promise<void>;
        signOut(): Promise<void>;
        checkConfigured(): Promise<boolean>;
        saveCredentials(clientId: string, clientSecret: string): Promise<boolean>;
        loadCredentials(): Promise<{ clientId: string; clientSecret: string }>;
        pullDoc(localPath: string): Promise<{
          comments: Array<{ googleId: string; selectedText: string; comment: string; createdTime: string }>;
          remoteText: string;
        }>;
      };
      git: {
        commit(filePath: string, message: string): Promise<{ success: boolean; error?: string; sha?: string; skipped?: boolean; noChanges?: boolean }>;
        log(filePath: string, limit?: number): Promise<{ success: boolean; commits?: GitCommit[]; error?: string }>;
        show(filePath: string, sha: string): Promise<{ success: boolean; content?: string; error?: string }>;
        push(filePath: string, message?: string): Promise<{ success: boolean; error?: string; sha?: string; remote?: string; branch?: string; fileUrl?: string }>;
        remoteInfo(filePath: string): Promise<{ success: boolean; remoteUrl?: string | null; remoteName?: string | null; branch?: string | null; error?: string }>;
        createReview(filePath: string, title?: string): Promise<{ success: boolean; error?: string; branchName?: string; prNumber?: number; prUrl?: string }>;
        prComments(filePath: string, prNumber: number): Promise<{ success: boolean; error?: string; comments?: Array<{
          id: string;
          source: 'github';
          author: { name: string; avatar?: string; isMe: boolean };
          body: string;
          quotedText?: string;
          createdAt: string;
          status: 'open' | 'resolved';
          threadId?: string;
          inReplyToId?: string;
        }> }>;
        prStatus(filePath: string): Promise<{ success: boolean; error?: string; pr?: { number: number; title: string; state: string; url: string } | null; branch?: string }>;
        pushReviewUpdate(filePath: string, message?: string): Promise<{ success: boolean; error?: string; branch?: string }>;
      };
      templates: {
        listCustom(): Promise<Array<{
          id: string; name: string; icon: string; description: string;
          promptPrefix: string; sections: string[]; skeleton: string;
          mcpRefs?: string[]; isCustom: boolean;
        }>>;
        saveCustom(template: {
          id: string; name: string; description: string; promptPrefix: string;
          sections: string[]; skeleton: string; mcpRefs?: string[];
        }): Promise<{ success: boolean; error?: string }>;
        deleteCustom(templateId: string): Promise<{ success: boolean; error?: string }>;
      };
      quickCapture: {
        inferTemplate(description: string): Promise<{ templateId: string; folder: string }>;
        getShortcut(): Promise<string>;
        setShortcut(shortcut: string): Promise<{ success: boolean }>;
      };
      claude: {
        sendEdit(prompt: string, filePath: string, model?: string, refs?: VaultRefs): Promise<void>;
        sendChat(
          message: string,
          docPath: string,
          sessionId: number | null,
          contextSelection: string | null,
          history: Array<{ role: string; content: string }>,
          model?: string,
          refs?: VaultRefs,
          images?: Array<{ data: string; mimeType: string; name: string }>
        ): Promise<void>;
        cancel(): Promise<void>;
        reviseChunk(
          chunkId: string,
          beforeText: string,
          currentAfterText: string,
          instruction: string,
          model?: string,
        ): Promise<{ success: boolean; revisedText?: string; error?: string }>;
        listMcps(): Promise<{ name: string; source?: string }[]>;
        listSkills(): Promise<{ name: string; description?: string; source?: string }[]>;
        readSkill(name: string): Promise<string | null>;
        onStream(
          callback: (data: { type: 'edit' | 'chat'; content: string }) => void
        ): () => void;
        onComplete(
          callback: (data: {
            type: 'edit' | 'chat';
            success: boolean;
            content?: string;
            error?: string;
            proposal?: { originalContent: string; proposedContent: string; docPath: string } | null;
          }) => void
        ): () => void;
        multiGenerate(
          sections: Array<{ title: string; prompt: string }>,
          filePath: string,
          outline: string,
          model?: string,
        ): Promise<{ success: boolean; filePath?: string }>;
        multiCancel(): Promise<void>;
        onMultiProgress(
          callback: (data: { sectionIndex: number; status: string; output: string }) => void
        ): () => void;
        onMultiComplete(
          callback: (data: { success: boolean; filePath?: string; cancelled?: boolean }) => void
        ): () => void;
      };
    };
  }
}
