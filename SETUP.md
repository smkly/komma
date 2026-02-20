# Helm — Local Setup Guide

## Prerequisites

| Requirement | Why | Check |
|------------|-----|-------|
| **Node.js v20+** | Runtime | `node -v` |
| **npm** | Package manager | `npm -v` |
| **Git** | History viewer, auto-commit | `git -v` |
| **Xcode CLI Tools** | Native module compilation (better-sqlite3) | `xcode-select -p` |
| **Claude CLI** | AI editing & chat (uses Max subscription) | `claude --version` |

### Installing Claude CLI

Helm uses the [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) to power AI edits and chat. It runs via your personal Claude Max subscription — no API key needed.

```bash
# Install Claude CLI
npm install -g @anthropic-ai/claude-code

# Verify it's accessible
claude --version

# Login (opens browser for authentication)
claude
```

The CLI should be at `~/.local/bin/claude`, `/usr/local/bin/claude`, or `/opt/homebrew/bin/claude`. Helm's Electron main process searches these paths automatically.

## Setup

```bash
# 1. Clone the repo
git clone https://github.com/0xSmick/helm.git
cd helm

# 2. Install dependencies (includes native module compilation)
npm install

# 3. Start the app in dev mode
npm run electron:dev
```

That's it. The Electron app compiles TypeScript, starts a Next.js dev server on a random port, and opens the window.

## How It Works

Helm is an **Electron + Next.js** app for editing markdown documents with AI assistance.

```
electron/main.ts     → Electron main process (IPC handlers, Claude spawning, git ops)
electron/preload.ts  → Context bridge (renderer ↔ main process)
electron/claude.ts   → Spawns `claude -p` CLI, parses NDJSON stream
src/app/page.tsx     → Main React page (sidebar, editor, diff viewer)
src/lib/db.ts        → SQLite database for comments, changelogs, chat sessions
data/helm.db         → SQLite database file (created on first run)
```

### Key features

- **Markdown editor** — TipTap rich text editor with vim keybindings
- **AI edits** — Select text, add comments, send to Claude → get inline diff review
- **AI chat** — Conversational editing with document context
- **Git history** — View commit history and read-only inline diffs per commit
- **Google Docs sync** — Share/pull documents and comments (optional, see below)
- **Vault system** — Organize documents with `@vault`, `@doc`, `@architecture` references

## Configuration

### Vault root (optional)

To use `@vault` references, either:

1. Place a `.vault` marker file at the root of your documents directory, **or**
2. Set it in the app: click the gear icon → Settings → Vault Root

Config is stored at `~/.helm/config.json`.

### Google Docs integration (optional)

Google Docs sharing works out of the box with the bundled OAuth credentials. On first use, the app opens a browser window for Google sign-in. Tokens are encrypted and stored in the Electron app data directory.

To sign out: use the Google menu in the app header.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run electron:dev` | Compile Electron TS + launch app in dev mode |
| `npm run dist` | Build Next.js + compile Electron + package .app/.dmg |
| `npm run build:electron` | Compile only the Electron TypeScript |
| `npm run dev` | Next.js dev server only (no Electron, limited features) |

## Troubleshooting

### `Unable to acquire lock at .next/dev/lock`

Another Next.js dev server is running. Kill it:

```bash
ps aux | grep "next dev" | grep -v grep
kill <PID>
```

Or delete the lock file: `rm .next/dev/lock`

### `better-sqlite3` build failure

Install Xcode Command Line Tools:

```bash
xcode-select --install
```

Then re-run `npm install`.

### Claude features don't work

1. Verify CLI is installed: `claude --version`
2. Verify you're logged in: `claude` (should open interactive session, not error)
3. Check Electron console (View → Toggle DevTools) for spawn errors

### App icon shows as default Electron

The postinstall script patches the Electron bundle. If it didn't run:

```bash
node scripts/patch-electron.js
```

## macOS File Associations (optional)

To open `.md` files from Finder by double-clicking:

1. An AppleScript wrapper lives at `scripts/Helm.applescript`
2. It gets installed to `~/Applications/Helm.app`
3. Right-click a `.md` file → Open With → Helm → "Always Open With"

This is optional — you can always open files from within the app using Cmd+O or Cmd+P.
