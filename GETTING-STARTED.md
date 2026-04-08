# Getting Started with Komma

## 1. Install Komma

```bash
brew tap 0xsmick/komma && brew install komma
```

After install, open Komma from your Applications folder. macOS may show a security warning — click **Open** to allow it.

## 2. Clone the vault

The vault is where all our shared docs live. Clone it to your home directory:

```bash
git clone git@github.com:smkly/vault.git ~/vault
```

## 3. Set the vault in Komma

1. Open Komma
2. Click the **gear icon** in the top-right header to open Settings
3. Under **Vault Root**, click **Browse** and select `~/vault` (or paste the path `/Users/YOURUSERNAME/vault`)
4. Click **Save**

Now when you use `@vault:` mentions in comments or chat, Komma will reference docs from the shared vault.

## 4. Using Komma

- **Open a doc**: Use the file explorer on the left sidebar (hamburger icon) to browse and open markdown files from your vault
- **Chat about a doc**: Click the chat icon in the sidebar to ask Claude questions about whatever you're reading
- **Add comments**: Select text in the editor, then click "Add Comment" to give Claude an instruction about that specific passage
- **@ mentions**: Type `@` in chat or comments to reference other docs, MCP tools, or vault files
- **Model selector**: Pick between Haiku (fast), Sonnet (balanced), or Opus (powerful) in the chat input

## Requirements

- macOS Ventura or later
- [Claude Code](https://claude.ai/code) installed and authenticated (`claude` CLI must be available in your terminal)
