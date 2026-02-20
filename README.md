# Helm

A markdown document editor with AI editing, inline diff review, and git history — built with Electron + Next.js.

## Quick Start

### One-liner install

```bash
curl -fsSL https://raw.githubusercontent.com/0xSmick/helm/main/scripts/install.sh | bash
```

This clones the repo to `~/Developer/helm`, installs dependencies, and compiles Electron. Set `HELM_DIR` to change the install location.

### Manual install

```bash
git clone https://github.com/0xSmick/helm.git
cd helm
./scripts/setup.sh    # checks prerequisites, installs deps, compiles
npm run electron:dev   # launch
```

### Prerequisites

- **Node.js v20+** — `node -v`
- **Git** — `git -v`
- **Xcode Command Line Tools** (macOS) — `xcode-select --install`
- **Claude CLI** — AI features require the [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (runs on your Max subscription, no API key):

```bash
npm install -g @anthropic-ai/claude-code
claude   # login (opens browser)
```

## Features

- **Rich markdown editor** with vim keybindings (toggle in status bar)
- **AI edits** — select text, add comments (Cmd+K), send to Claude (Cmd+Enter) for inline diff review with accept/reject per chunk
- **AI chat** — conversational editing with full document context
- **Git history** — sidebar tab showing commit history with read-only inline diffs
- **Auto-commit** — saves are committed as "Manual save", edits as "Applied edit"
- **Google Docs sync** — share documents, pull comments (optional)
- **Split panes** — view two documents side by side (Cmd+\\)
- **Vault references** — `@vault`, `@doc`, `@architecture` for context-aware editing
- **File explorer** — Cmd+B for sidebar tree, Cmd+P for fuzzy finder

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+E | Toggle edit mode |
| Cmd+K | Add comment on selection |
| Cmd+Enter | Send comments to Claude |
| Cmd+P | Open file finder |
| Cmd+B | Toggle file explorer |
| Cmd+Alt+B | Toggle sidebar |
| Cmd+T | New tab |
| Cmd+W | Close tab |
| Cmd+\\ | Toggle split pane |
| Cmd+F | Find and replace |
| Cmd+S | Save (in edit mode) |

## Architecture

```
electron/main.ts       Electron main process — IPC, Claude spawning, git
electron/preload.ts    Context bridge (renderer <-> main)
electron/claude.ts     Spawns claude -p CLI, parses NDJSON stream
src/app/page.tsx       Main React component
src/app/components/    UI components (Sidebar, InlineDiffView, tabs/)
src/app/hooks/         React hooks (useDocument, useClaude, useChat, useVim)
src/lib/db.ts          SQLite database (comments, changelogs, chat)
data/helm.db           Database file (created on first run)
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run electron:dev` | Compile + launch in dev mode |
| `npm run dist` | Build + package as .app/.dmg |
| `npm run build:electron` | Compile Electron TypeScript only |

## Configuration

**Vault root** — set in Settings (gear icon) or place a `.vault` marker file at your documents root directory.

**Settings** are stored at `~/.helm/config.json`.

## Troubleshooting

**"Unable to acquire lock at .next/dev/lock"** — Another dev server is running. Kill it with `ps aux | grep "next dev"` then `kill <PID>`, or `rm .next/dev/lock`.

**better-sqlite3 build failure** — Run `xcode-select --install` then `npm install` again.

**Claude features not working** — Verify `claude --version` succeeds and you're logged in.

See [SETUP.md](./SETUP.md) for the full setup guide with detailed troubleshooting.
