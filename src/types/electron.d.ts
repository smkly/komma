export {};

declare global {
  interface Window {
    electronAPI?: {
      onMenuAction(callback: (action: string, ...args: unknown[]) => void): () => void;
      claude: {
        sendEdit(prompt: string, filePath: string, model?: string): Promise<void>;
        sendChat(
          message: string,
          docPath: string,
          sessionId: number | null,
          contextSelection: string | null,
          history: Array<{ role: string; content: string }>,
          model?: string
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
