# Komma

**A markdown editor with a built-in writing partner.**

Komma is a native macOS editor for people who write in markdown. Leave comments on your own text, and Claude will suggest edits you can accept or reject line-by-line — like track changes with a co-editor who actually reads the whole document.

## Why Komma

Writing tools either do too much or too little. Komma stays out of your way until you ask for help.

- Highlight text, leave a note, get a rewrite suggestion — accept or reject each change
- Ask questions about your document in the chat tab
- Every save is versioned — roll back to any point
- It's just markdown files on your filesystem

## Install

```bash
brew tap 0xSmick/komma
brew install --cask komma
```

Requires the [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) for editing features (uses your Claude Max subscription — no API key needed):

```bash
npm install -g @anthropic-ai/claude-code
claude   # login once
```

## How It Works

1. **Write** in a clean markdown editor (vim keybindings optional)
2. **Comment** — select text, hit `Cmd+K`, leave a note like "make this clearer"
3. **Send** — `Cmd+Enter` sends your comments to Claude
4. **Review** — suggested edits appear inline as diffs, accept or reject each one
5. **Chat** — ask questions or discuss edits in the sidebar

## Features

| Feature | Details |
|---------|---------|
| Inline editing | Leave comments, get suggested rewrites, accept/reject each change |
| Chat | Ask questions or discuss your document in the sidebar |
| Version history | Every save tracked with timestamps, restore any version |
| Git built in | Auto-commits on save, push to GitHub from the app |
| Vault context | `@vault` gives Claude awareness of all your documents |
| Google Docs | Share documents and pull comments back (optional) |
| Split panes | View two documents side by side |
| File explorer | Sidebar tree + fuzzy finder (`Cmd+P`) |
| Vim mode | Toggle in status bar |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+E` | Toggle edit mode |
| `Cmd+K` | Comment on selection |
| `Cmd+Enter` | Send to Claude |
| `Cmd+P` | Fuzzy file finder |
| `Cmd+B` | File explorer |
| `Cmd+\` | Split pane |
| `Cmd+S` | Save |
| `Cmd+T` / `Cmd+W` | New / close tab |

## Building from Source

```bash
git clone https://github.com/0xSmick/komma.git
cd komma && npm install
npm run electron:dev     # dev mode
npm run dist             # package .app + .dmg
```

## Configuration

- **Vault** — place a `.vault` file at your documents root, or set in Settings
- **Google OAuth** — configure in Settings with your own Client ID/Secret ([setup guide](./SETUP.md))
- **Settings** stored at `~/.komma/config.json`

## Architecture

```
electron/main.ts       Main process — IPC, Claude, git, Google auth
electron/claude.ts     Spawns claude -p, streams NDJSON
src/app/page.tsx       Main editor component
src/app/hooks/         useDocument, useClaude, useChat, useVim
src/lib/db.ts          SQLite (sql.js) — comments, history, chat
```

## License

AGPL-3.0
