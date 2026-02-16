export {};

interface VaultRefs {
  docs: string[];
  mcps: string[];
  vault?: boolean;
  architecture?: boolean;
}

declare global {
  interface Window {
    electronAPI?: {
      onMenuAction(callback: (action: string, ...args: unknown[]) => void): () => void;
      getPendingFile(): Promise<string | null>;
      vault: {
        resolveRoot(fromPath: string): Promise<string | null>;
        getIndex(fromPath: string): Promise<{
          vaultRoot: string;
          files: Array<{ relativePath: string; firstLine: string }>;
        } | null>;
        listFiles(fromPath: string): Promise<string[]>;
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
          refs?: VaultRefs
        ): Promise<void>;
        cancel(): Promise<void>;
        listMcps(): Promise<{ name: string }[]>;
        onStream(
          callback: (data: { type: 'edit' | 'chat'; content: string }) => void
        ): () => void;
        onComplete(
          callback: (data: {
            type: 'edit' | 'chat';
            success: boolean;
            content?: string;
            error?: string;
          }) => void
        ): () => void;
      };
    };
  }
}
