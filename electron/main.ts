import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell } from 'electron';
import { spawn, execFile, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as http from 'http';
import * as net from 'net';
import { spawnClaude } from './claude';
import { uploadHtmlAsGoogleDoc, updateGoogleDoc, clearTokens, getExistingDoc, fetchDocComments, exportDocAsText, getPulledCommentIds, markCommentsPulled, isGoogleOAuthConfigured, resetGoogleCredsCache } from './google-auth';
import { marked } from 'marked';

const SETTINGS_PATH = path.join(os.homedir(), '.komma', 'config.json');

function readSettings(): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch { return {}; }
}

function writeSettings(settings: Record<string, any>) {
  const dir = path.dirname(SETTINGS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

/**
 * Create a timestamped backup of a file before overwriting.
 * Backups go to .backups/ sibling directory, kept for 30 days.
 * Returns the backup path, or null if file didn't exist.
 */
function backupFile(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) return null;
    const dir = path.dirname(filePath);
    const name = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);
    const backupDir = path.join(dir, '.backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `${name}-${ts}${ext}`);
    fs.copyFileSync(filePath, backupPath);
    // Prune backups older than 30 days
    try {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      for (const f of fs.readdirSync(backupDir)) {
        const fp = path.join(backupDir, f);
        if (fs.statSync(fp).mtimeMs < cutoff) fs.unlinkSync(fp);
      }
    } catch { /* pruning is best-effort */ }
    return backupPath;
  } catch (e) {
    console.error('[backupFile] Failed to backup:', filePath, e);
    return null;
  }
}

let mainWindow: BrowserWindow | null = null;
let nextServer: ChildProcess | null = null;
let currentEdit: ReturnType<typeof spawnClaude> | null = null;
let currentEditDocPath: string | null = null;
let currentChat: ReturnType<typeof spawnClaude> | null = null;
let currentChatDocPath: string | null = null;
let serverPort: number | null = null;
let accumulatedEditText = '';
let accumulatedChatText = '';
let currentChatProposalPath: string | null = null;
let currentChatOriginalContent: string | null = null;
let currentEditProposalPath: string | null = null;
let currentEditOriginalContent: string | null = null;
let pendingOpenFile: string | null = process.env.KOMMA_OPEN_FILE || null;

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Failed to get port')));
      }
    });
    server.on('error', reject);
  });
}

function waitForServer(url: string, timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http
        .get(url, (res) => {
          res.resume();
          if (res.statusCode && res.statusCode < 500) {
            resolve();
          } else if (Date.now() - start > timeoutMs) {
            reject(new Error('Server startup timeout'));
          } else {
            setTimeout(check, 500);
          }
        })
        .on('error', () => {
          if (Date.now() - start > timeoutMs) {
            reject(new Error('Server startup timeout'));
          } else {
            setTimeout(check, 500);
          }
        });
    };
    check();
  });
}

async function startNextServer(port: number): Promise<void> {
  const projectRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'app')
    : path.join(__dirname, '..');

  if (app.isPackaged) {
    // Production: use the Electron Helper binary with ELECTRON_RUN_AS_NODE.
    // The Helper has LSUIElement=true so it won't show a dock icon,
    // unlike spawning the main binary which creates a visible "exec" entry.
    const standaloneDir = path.join(projectRoot, '.next', 'standalone');
    const contentsDir = path.dirname(process.resourcesPath);
    const appName = path.basename(process.execPath);
    const helperBinary = path.join(
      contentsDir, 'Frameworks', `${appName} Helper.app`, 'Contents', 'MacOS', `${appName} Helper`
    );
    const serverBinary = fs.existsSync(helperBinary) ? helperBinary : process.execPath;
    nextServer = spawn(serverBinary, ['server.js'], {
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'production',
        ELECTRON_RUN_AS_NODE: '1',
      },
      cwd: standaloneDir,
      stdio: 'pipe',
    });
  } else {
    // Development: run next dev
    nextServer = spawn('npx', ['next', 'dev', '-p', String(port)], {
      env: { ...process.env, PORT: String(port) },
      cwd: projectRoot,
      stdio: 'pipe',
      shell: true,
    });
  }

  nextServer.stdout?.on('data', (data: Buffer) => {
    console.log('[Next.js]', data.toString().trim());
  });

  nextServer.stderr?.on('data', (data: Buffer) => {
    console.error('[Next.js]', data.toString().trim());
  });

  nextServer.on('error', (err) => {
    console.error('Failed to start Next.js server:', err);
  });

  await waitForServer(`http://localhost:${port}`);

  // In dev mode, warm up API routes so the page doesn't hit cold compilation
  if (!app.isPackaged) {
    console.log('Warming up API routes...');
    const warmupUrls = [
      `http://localhost:${port}/api/file?path=_warmup`,
      `http://localhost:${port}/api/comments?document_path=_warmup`,
      `http://localhost:${port}/api/changelogs?document_path=_warmup`,
      `http://localhost:${port}/api/frontmatter?path=_warmup`,
      `http://localhost:${port}/api/chat?document_path=_warmup`,
    ];
    await Promise.all(warmupUrls.map(url =>
      new Promise<void>((resolve) => {
        http.get(url, (res) => { res.resume(); resolve(); })
            .on('error', () => resolve());
      })
    ));
    console.log('API routes warm.');
  }
}

function createWindow(port: number) {
  mainWindow = new BrowserWindow({
    title: 'Komma',
    width: 1200,
    height: 800,
    icon: path.join(__dirname, '..', 'build', 'icon.iconset', 'icon_256x256.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://localhost:${port}`);

  // Prevent Electron from navigating to dropped files
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) {
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function resolveVaultRoot(fromPath: string): string | null {
  // Settings-configured vault root takes priority
  const settings = readSettings();
  if (settings.vaultRoot && fs.existsSync(settings.vaultRoot)) {
    return settings.vaultRoot;
  }

  // Fall back to .vault marker detection
  let dir = fromPath;
  // If fromPath is a file, start from its directory
  if (fs.existsSync(dir) && fs.statSync(dir).isFile()) {
    dir = path.dirname(dir);
  }
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.vault'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

function scanVaultFiles(vaultRoot: string): Array<{ relativePath: string; firstLine: string }> {
  const results: Array<{ relativePath: string; firstLine: string }> = [];

  function walk(dir: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.name.endsWith('.md') || entry.name.endsWith('.html') || entry.name.endsWith('.htm')) {
          const relativePath = path.relative(vaultRoot, fullPath);
          let firstLine = '';
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            if (entry.name.endsWith('.html') || entry.name.endsWith('.htm')) {
              // Extract <title> for HTML files
              const titleMatch = content.match(/<title[^>]*>(.*?)<\/title>/i);
              if (titleMatch) firstLine = titleMatch[1].trim();
            } else {
              // Get first heading or first non-empty line for markdown
              const lines = content.split('\n');
              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed) {
                  firstLine = trimmed.replace(/^#+\s*/, '');
                  break;
                }
              }
            }
          } catch { /* skip unreadable */ }
          results.push({ relativePath, firstLine });
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  walk(vaultRoot);
  return results;
}

function resolveRefsToContext(
  refs: { docs: string[]; mcps: string[]; vault?: boolean; architecture?: boolean },
  filePath: string,
  vaultRoot: string | null,
): string {
  let context = '';
  const dir = path.dirname(filePath);

  // @vault — generate vault index
  if (refs.vault && vaultRoot) {
    const files = scanVaultFiles(vaultRoot);
    const index = files.map(f => `- ${f.relativePath}${f.firstLine ? ': ' + f.firstLine : ''}`).join('\n');
    context += `\n\nVault index (${vaultRoot}):\n${index}`;
  }

  // @architecture — read known architecture files
  if (refs.architecture && vaultRoot) {
    const archFiles = ['ARCHITECTURE.md', 'PRODUCT_FEATURES.md', 'README.md'];
    for (const name of archFiles) {
      const archPath = path.join(vaultRoot, name);
      try {
        const content = fs.readFileSync(archPath, 'utf-8');
        context += `\n\nArchitecture document (${name}):\n\`\`\`\n${content}\n\`\`\``;
      } catch { /* skip missing */ }
    }
  }

  // @doc references — resolve relative to dir first, then vault root
  for (const docRef of refs.docs) {
    let resolved = false;
    // Try relative to current file's directory
    const localPath = path.join(dir, docRef);
    try {
      const content = fs.readFileSync(localPath, 'utf-8');
      context += `\n\nReference document (${docRef}):\n\`\`\`\n${content}\n\`\`\``;
      resolved = true;
    } catch { /* not found locally */ }

    // Try relative to vault root
    if (!resolved && vaultRoot) {
      const vaultPath = path.join(vaultRoot, docRef);
      try {
        const content = fs.readFileSync(vaultPath, 'utf-8');
        context += `\n\nReference document (${docRef}):\n\`\`\`\n${content}\n\`\`\``;
      } catch { /* not found in vault either */ }
    }
  }

  return context;
}

function gitExec(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message));
      else resolve(stdout.trim());
    });
  });
}

function registerIpcHandlers() {
  ipcMain.handle('git:log', async (_event, filePath: string, limit = 50) => {
    try {
      const dir = path.dirname(filePath);
      let repoRoot: string;
      try {
        repoRoot = await gitExec(['-C', dir, 'rev-parse', '--show-toplevel'], dir);
      } catch {
        return { success: true, commits: [] };
      }
      const realFilePath = fs.realpathSync(filePath);
      const realRepoRoot = fs.realpathSync(repoRoot);
      const relativePath = path.relative(realRepoRoot, realFilePath);
      const raw = await gitExec(
        ['-C', repoRoot, 'log', '--follow', '--format=%H%n%h%n%s%n%ai%n%an', `-n`, String(limit), '--', relativePath],
        repoRoot,
      );
      if (!raw) return { success: true, commits: [] };
      const lines = raw.split('\n');
      const commits: Array<{ hash: string; shortHash: string; message: string; date: string; author: string }> = [];
      for (let i = 0; i + 4 < lines.length; i += 5) {
        commits.push({
          hash: lines[i],
          shortHash: lines[i + 1],
          message: lines[i + 2],
          date: lines[i + 3],
          author: lines[i + 4],
        });
      }
      return { success: true, commits };
    } catch (err: any) {
      return { success: false, error: err.message || 'Git log failed', commits: [] };
    }
  });

  ipcMain.handle('git:show', async (_event, filePath: string, sha: string) => {
    try {
      const dir = path.dirname(filePath);
      let repoRoot: string;
      try {
        repoRoot = await gitExec(['-C', dir, 'rev-parse', '--show-toplevel'], dir);
      } catch {
        return { success: false, error: 'Not a git repository' };
      }
      const relativePath = path.relative(repoRoot, filePath);
      const content = await gitExec(['-C', repoRoot, 'show', `${sha}:${relativePath}`], repoRoot);
      return { success: true, content };
    } catch (err: any) {
      return { success: false, error: err.message || 'Git show failed' };
    }
  });

  ipcMain.handle('git:commit', async (_event, filePath: string, message: string) => {
    try {
      const dir = path.dirname(filePath);

      // 1. Find git root — if not in a repo, silent no-op
      let repoRoot: string;
      try {
        repoRoot = await gitExec(['-C', dir, 'rev-parse', '--show-toplevel'], dir);
      } catch {
        return { success: true, skipped: true };
      }

      // 2. Get relative path from repo root
      const relativePath = path.relative(repoRoot, filePath);

      // 3. Stage the file
      await gitExec(['-C', repoRoot, 'add', relativePath], repoRoot);

      // 4. Check if anything is staged
      try {
        await gitExec(['-C', repoRoot, 'diff', '--cached', '--quiet'], repoRoot);
        // Exit code 0 means nothing staged
        return { success: true, noChanges: true };
      } catch {
        // Exit code 1 means there are staged changes — proceed to commit
      }

      // 5. Commit
      const result = await gitExec(['-C', repoRoot, 'commit', '-m', message], repoRoot);
      const shaMatch = result.match(/\[[\w-]+ ([a-f0-9]+)\]/);
      return { success: true, sha: shaMatch?.[1] };
    } catch (err: any) {
      return { success: false, error: err.message || 'Git commit failed' };
    }
  });

  ipcMain.handle('git:push', async (_event, filePath: string, message?: string) => {
    try {
      const dir = path.dirname(filePath);

      // Find repo root — try vault root first, then git detection
      let repoRoot: string;
      const vRoot = resolveVaultRoot(filePath);
      if (vRoot) {
        try {
          await gitExec(['-C', vRoot, 'rev-parse', '--show-toplevel'], vRoot);
          repoRoot = vRoot;
        } catch {
          return { success: false, error: 'Vault directory is not a git repository' };
        }
      } else {
        try {
          repoRoot = await gitExec(['-C', dir, 'rev-parse', '--show-toplevel'], dir);
        } catch {
          return { success: false, error: 'Not a git repository' };
        }
      }

      const settings = readSettings();
      const remote = settings.githubRemote || 'origin';

      // Verify remote exists
      try {
        await gitExec(['-C', repoRoot, 'remote', 'get-url', remote], repoRoot);
      } catch {
        return { success: false, error: `Git remote "${remote}" not configured` };
      }

      const branch = await gitExec(['-C', repoRoot, 'rev-parse', '--abbrev-ref', 'HEAD'], repoRoot);
      const relativePath = path.relative(repoRoot, filePath);

      // Stage the file
      await gitExec(['-C', repoRoot, 'add', relativePath], repoRoot);

      // Check if anything staged
      let hasChanges = false;
      try {
        await gitExec(['-C', repoRoot, 'diff', '--cached', '--quiet'], repoRoot);
      } catch {
        hasChanges = true;
      }

      let sha: string | undefined;
      if (hasChanges) {
        const commitMsg = message || `Update ${path.basename(filePath)}`;
        const result = await gitExec(['-C', repoRoot, 'commit', '-m', commitMsg], repoRoot);
        const shaMatch = result.match(/\[[\w-]+ ([a-f0-9]+)\]/);
        sha = shaMatch?.[1];
      }

      // Push
      await gitExec(['-C', repoRoot, 'push', remote, branch], repoRoot);

      // Build GitHub web URL for the file
      let fileUrl: string | undefined;
      try {
        const remoteUrl = await gitExec(['-C', repoRoot, 'remote', 'get-url', remote], repoRoot);
        // Convert git@github.com:user/repo.git or https://github.com/user/repo.git to https://github.com/user/repo
        const webUrl = remoteUrl
          .replace(/\.git$/, '')
          .replace(/^git@github\.com:/, 'https://github.com/')
          .replace(/^ssh:\/\/git@github\.com\//, 'https://github.com/');
        fileUrl = `${webUrl}/blob/${branch}/${relativePath}`;
      } catch { /* remote URL parsing failed, skip */ }

      return { success: true, sha, remote, branch, fileUrl };
    } catch (err: any) {
      return { success: false, error: err.message || 'Git push failed' };
    }
  });

  ipcMain.handle('git:remote-info', async (_event, filePath: string) => {
    try {
      const dir = path.dirname(filePath);
      let repoRoot: string;
      const vRoot = resolveVaultRoot(filePath);
      if (vRoot) {
        try {
          await gitExec(['-C', vRoot, 'rev-parse', '--show-toplevel'], vRoot);
          repoRoot = vRoot;
        } catch {
          return { success: false, error: 'Not a git repository' };
        }
      } else {
        try {
          repoRoot = await gitExec(['-C', dir, 'rev-parse', '--show-toplevel'], dir);
        } catch {
          return { success: false, error: 'Not a git repository' };
        }
      }

      const settings = readSettings();
      const remoteName = settings.githubRemote || 'origin';

      try {
        const remoteUrl = await gitExec(['-C', repoRoot, 'remote', 'get-url', remoteName], repoRoot);
        const branch = await gitExec(['-C', repoRoot, 'rev-parse', '--abbrev-ref', 'HEAD'], repoRoot);
        return { success: true, remoteUrl, remoteName, branch };
      } catch {
        return { success: true, remoteUrl: null, remoteName: null, branch: null };
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get remote info' };
    }
  });

  // File operations
  ipcMain.handle('file:rename', async (_event, filePath: string, newName: string) => {
    try {
      const dir = path.dirname(filePath);
      const newPath = path.join(dir, newName);
      if (fs.existsSync(newPath)) {
        return { success: false, error: 'A file with that name already exists' };
      }
      fs.renameSync(filePath, newPath);
      return { success: true, newPath };
    } catch (err: any) {
      return { success: false, error: err.message || 'Rename failed' };
    }
  });

  ipcMain.handle('file:move', async (_event, filePath: string, destDir: string) => {
    try {
      const fileName = path.basename(filePath);
      const newPath = path.join(destDir, fileName);
      if (fs.existsSync(newPath)) {
        return { success: false, error: 'A file with that name already exists in the destination' };
      }
      if (!fs.existsSync(destDir)) {
        return { success: false, error: 'Destination directory does not exist' };
      }
      fs.renameSync(filePath, newPath);
      return { success: true, newPath };
    } catch (err: any) {
      return { success: false, error: err.message || 'Move failed' };
    }
  });

  ipcMain.handle('file:delete', async (_event, filePath: string) => {
    try {
      await shell.trashItem(filePath);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Delete failed' };
    }
  });

  // Renderer calls this on mount to get any file that triggered the app launch
  ipcMain.handle('app:get-pending-file', () => {
    const file = pendingOpenFile;
    pendingOpenFile = null;
    return file;
  });

  ipcMain.handle(
    'claude:send-edit',
    async (_event, prompt: string, filePath: string, model?: string, refs?: { docs: string[]; mcps: string[]; vault?: boolean; architecture?: boolean }) => {
      if (currentEdit) {
        currentEdit.onData(() => {});
        currentEdit.onComplete(() => {});
        currentEdit.onError(() => {});
        currentEdit.kill();
        currentEdit = null;
      }
      currentEditDocPath = filePath;

      const useModel = model || readSettings().defaultModel || 'sonnet';
      const isFast = useModel !== 'opus';

      const vaultRoot = resolveVaultRoot(filePath);
      let refContext = '';
      if (refs) {
        refContext = resolveRefsToContext(refs, filePath, vaultRoot);
      }

      const fileExists = fs.existsSync(filePath) && fs.statSync(filePath).size > 0;

      // Backup existing file
      if (fileExists) {
        backupFile(filePath);
      }

      // For existing files: snapshot original and create temp proposal copy
      let editTarget = filePath;
      if (fileExists) {
        try {
          const originalContent = fs.readFileSync(filePath, 'utf-8');
          const tmpDir = path.join(os.tmpdir(), 'komma-proposals');
          if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
          const proposalPath = path.join(tmpDir, `edit-proposal-${Date.now()}.md`);
          fs.writeFileSync(proposalPath, originalContent);
          currentEditProposalPath = proposalPath;
          currentEditOriginalContent = originalContent;
          editTarget = proposalPath;
        } catch {
          currentEditProposalPath = null;
          currentEditOriginalContent = null;
        }
      } else {
        currentEditProposalPath = null;
        currentEditOriginalContent = null;
      }

      // Replace real file path with edit target in the prompt to prevent
      // Claude from editing the original file instead of the temp proposal copy
      const adjustedPrompt = editTarget !== filePath
        ? prompt.split(filePath).join(editTarget)
        : prompt;

      const fullPrompt = isFast
        ? (fileExists
            ? `Edit the file at ${editTarget}. Read it, apply the changes, and stop. Do not explain.\n\n${adjustedPrompt}${refContext}`
            : `${adjustedPrompt}${refContext}`)
        : (fileExists
            ? `Edit the file at ${editTarget}:\n\n${adjustedPrompt}${refContext}`
            : `${adjustedPrompt}${refContext}`);
      accumulatedEditText = '';
      currentEdit = spawnClaude(fullPrompt, {
        allowedTools: ['Read', 'Edit', 'Write'],
        maxTurns: isFast ? 5 : 10,
        model: useModel,
      });

      currentEdit.onData((text) => {
        accumulatedEditText += text;
        mainWindow?.webContents.send('claude:stream', {
          type: 'edit',
          content: accumulatedEditText,
        });
      });

      currentEdit.onComplete((result) => {
        if (fileExists && currentEditProposalPath && currentEditOriginalContent) {
          // Read proposed content from temp file
          let proposedContent = currentEditOriginalContent;
          try { proposedContent = fs.readFileSync(currentEditProposalPath, 'utf-8'); } catch {}
          try { fs.unlinkSync(currentEditProposalPath); } catch {}

          // Safety: restore original if the real file was somehow modified
          let realFileWasModified = false;
          try {
            const current = fs.readFileSync(filePath, 'utf-8');
            if (current !== currentEditOriginalContent) {
              realFileWasModified = true;
              fs.writeFileSync(filePath, currentEditOriginalContent);
            }
          } catch {}

          const hasEdits = proposedContent !== currentEditOriginalContent;
          console.log(`[claude:send-edit] complete: hasEdits=${hasEdits}, realFileWasModified=${realFileWasModified}, proposalPath=${currentEditProposalPath}`);
          if (!hasEdits && realFileWasModified) {
            console.warn('[claude:send-edit] Claude edited the real file instead of the proposal file — changes were reverted');
          }
          mainWindow?.webContents.send('claude:complete', {
            type: 'edit',
            success: true,
            content: result,
            proposal: hasEdits ? { originalContent: currentEditOriginalContent, proposedContent, docPath: filePath } : null,
          });
        } else {
          // New file creation — verify it was written
          const fileWritten = !fileExists ? fs.existsSync(filePath) : true;
          mainWindow?.webContents.send('claude:complete', {
            type: 'edit',
            success: fileWritten,
            content: result,
            error: fileWritten ? undefined : 'Claude completed but did not create the file',
          });
        }
        currentEdit = null;
        currentEditDocPath = null;
        currentEditProposalPath = null;
        currentEditOriginalContent = null;
      });

      currentEdit.onError((error) => {
        if (currentEditProposalPath) {
          try { fs.unlinkSync(currentEditProposalPath); } catch {}
        }
        mainWindow?.webContents.send('claude:complete', {
          type: 'edit',
          success: false,
          error,
        });
        currentEdit = null;
        currentEditDocPath = null;
        currentEditProposalPath = null;
        currentEditOriginalContent = null;
      });
    },
  );

  ipcMain.handle(
    'claude:send-chat',
    async (
      _event,
      message: string,
      docPath: string,
      sessionId: number | null,
      contextSelection: string | null,
      history: Array<{ role: string; content: string }>,
      model?: string,
      refs?: { docs: string[]; mcps: string[]; vault?: boolean; architecture?: boolean },
      images?: Array<{ data: string; mimeType: string; name: string }>,
    ) => {
      if (currentChat) {
        currentChat.onData(() => {});
        currentChat.onComplete(() => {});
        currentChat.onError(() => {});
        currentChat.kill();
        currentChat = null;
      }
      currentChatDocPath = docPath;

      // Backup original before any chat editing
      backupFile(docPath);

      // Snapshot original content and create temp copy for proposal-based editing
      let originalContent = '';
      let proposalPath = '';
      try {
        originalContent = fs.readFileSync(docPath, 'utf-8');
        const tmpDir = path.join(os.tmpdir(), 'komma-proposals');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        proposalPath = path.join(tmpDir, `proposal-${Date.now()}.md`);
        fs.writeFileSync(proposalPath, originalContent);
        currentChatProposalPath = proposalPath;
        currentChatOriginalContent = originalContent;
      } catch {
        proposalPath = '';
        currentChatProposalPath = null;
        currentChatOriginalContent = null;
      }

      const editTarget = proposalPath || docPath;

      let promptParts: string[] = [];

      // System framing — tell the agent what actions it can take
      promptParts.push(
        `You are a writing assistant for this document. You can:\n` +
        `1. Edit sections of the current document at ${editTarget} — when the user asks you to change, improve, rewrite, or fix something, edit the file directly.\n` +
        `2. Create a new document in the same directory — when the user asks for a new document, summary, or derivative work, create a new file in ${path.dirname(docPath)}.\n` +
        `3. Answer questions about the document — when the user asks about content, structure, or meaning, respond conversationally.\n\n` +
        `Be explicit about which action you're taking. Prefer editing the existing file over creating new ones unless a new document is specifically requested.`
      );

      // Include document content if available
      if (docPath) {
        try {
          const docContent = originalContent || fs.readFileSync(docPath, 'utf-8');
          promptParts.push(`The user is working on a document at ${editTarget}. Here is its current content:\n\n${docContent}`);
        } catch {
          promptParts.push(`The user is working on a document at ${editTarget} (could not read file).`);
        }
      }

      // Include context selection
      if (contextSelection) {
        promptParts.push(`The user has selected this text for context:\n\n${contextSelection}`);
      }

      // Include conversation history
      if (history && history.length > 0) {
        const historyText = history
          .map((msg) => `${msg.role}: ${msg.content}`)
          .join('\n\n');
        promptParts.push(`Previous conversation:\n\n${historyText}`);
      }

      promptParts.push(`User message: ${message}`);

      // Resolve vault refs
      const vaultRoot = resolveVaultRoot(docPath);
      if (refs) {
        const refContext = resolveRefsToContext(refs, docPath, vaultRoot);
        if (refContext) {
          promptParts.push(`Additional context from referenced documents:${refContext}`);
        }
      }

      // Save attached images to temp files
      const tempImagePaths: string[] = [];
      if (images && images.length > 0) {
        const tmpDir = path.join(os.tmpdir(), 'komma-chat-images');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        for (const img of images) {
          const ext = img.mimeType.split('/')[1] || 'png';
          const tmpPath = path.join(tmpDir, `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
          fs.writeFileSync(tmpPath, Buffer.from(img.data, 'base64'));
          tempImagePaths.push(tmpPath);
        }
        promptParts.push(`The user has attached ${images.length} image(s). Read each image file to view them:\n${tempImagePaths.map(p => `- ${p}`).join('\n')}`);
      }

      const useModel = model || readSettings().defaultModel || 'sonnet';
      const fullPrompt = promptParts.join('\n\n---\n\n');
      accumulatedChatText = '';
      currentChat = spawnClaude(fullPrompt, {
        allowedTools: ['Read', 'Edit', 'Write'],
        maxTurns: useModel === 'opus' ? 15 : 10,
        model: useModel,
      });

      currentChat.onData((text) => {
        accumulatedChatText += text;
        mainWindow?.webContents.send('claude:stream', {
          type: 'chat',
          content: accumulatedChatText,
        });
      });

      currentChat.onComplete((result) => {
        // Read proposed content from temp file, then diff against original
        let proposedContent = currentChatOriginalContent || '';
        if (currentChatProposalPath) {
          try { proposedContent = fs.readFileSync(currentChatProposalPath, 'utf-8'); } catch {}
          try { fs.unlinkSync(currentChatProposalPath); } catch {}
        }

        // Safety: restore original if the real file was somehow modified
        if (currentChatOriginalContent) {
          try {
            const current = fs.readFileSync(docPath, 'utf-8');
            if (current !== currentChatOriginalContent) {
              fs.writeFileSync(docPath, currentChatOriginalContent);
            }
          } catch {}
        }

        const hasEdits = currentChatOriginalContent && proposedContent !== currentChatOriginalContent;
        mainWindow?.webContents.send('claude:complete', {
          type: 'chat',
          success: true,
          content: result || accumulatedChatText || '(No response)',
          proposal: hasEdits ? { originalContent: currentChatOriginalContent, proposedContent, docPath } : null,
        });
        currentChat = null;
        currentChatDocPath = null;
        currentChatProposalPath = null;
        currentChatOriginalContent = null;
      });

      currentChat.onError((error) => {
        // Clean up temp file on error
        if (currentChatProposalPath) {
          try { fs.unlinkSync(currentChatProposalPath); } catch {}
        }
        mainWindow?.webContents.send('claude:complete', {
          type: 'chat',
          success: false,
          error,
        });
        currentChat = null;
        currentChatDocPath = null;
        currentChatProposalPath = null;
        currentChatOriginalContent = null;
      });
    },
  );

  ipcMain.handle('claude:list-mcps', async () => {
    const mcps: { name: string; source?: string }[] = [];
    const seen = new Set<string>();

    // 1. ~/.claude.json (primary MCP config location)
    try {
      const claudeJson = path.join(os.homedir(), '.claude.json');
      const config = JSON.parse(fs.readFileSync(claudeJson, 'utf-8'));
      for (const name of Object.keys(config.mcpServers || {})) {
        if (!seen.has(name)) { seen.add(name); mcps.push({ name, source: 'global' }); }
      }
    } catch { /* ignore */ }

    // 2. ~/.claude/settings.json mcpServers (legacy/fallback)
    try {
      const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      for (const name of Object.keys(settings.mcpServers || {})) {
        if (!seen.has(name)) { seen.add(name); mcps.push({ name, source: 'global' }); }
      }
    } catch { /* ignore */ }

    // 2. Installed plugin .mcp.json files
    try {
      const cachePath = path.join(os.homedir(), '.claude', 'plugins', 'cache');
      if (fs.existsSync(cachePath)) {
        for (const marketplace of fs.readdirSync(cachePath)) {
          const mpDir = path.join(cachePath, marketplace);
          if (!fs.statSync(mpDir).isDirectory()) continue;
          for (const plugin of fs.readdirSync(mpDir)) {
            const pluginDir = path.join(mpDir, plugin);
            if (!fs.statSync(pluginDir).isDirectory()) continue;
            // Find versioned subdirectory
            for (const version of fs.readdirSync(pluginDir)) {
              const mcpFile = path.join(pluginDir, version, '.mcp.json');
              if (fs.existsSync(mcpFile)) {
                try {
                  const mcpConfig = JSON.parse(fs.readFileSync(mcpFile, 'utf-8'));
                  for (const name of Object.keys(mcpConfig)) {
                    if (!seen.has(name)) { seen.add(name); mcps.push({ name, source: plugin }); }
                  }
                } catch { /* ignore malformed */ }
              }
            }
          }
        }
      }
    } catch { /* ignore */ }

    return mcps;
  });

  ipcMain.handle('claude:cancel', async () => {
    if (currentEdit) {
      currentEdit.kill();
      currentEdit = null;
      currentEditDocPath = null;
    }
    if (currentChat) {
      currentChat.kill();
      currentChat = null;
      currentChatDocPath = null;
      if (currentChatProposalPath) {
        try { fs.unlinkSync(currentChatProposalPath); } catch {}
        currentChatProposalPath = null;
        currentChatOriginalContent = null;
      }
    }
  });

  ipcMain.handle('claude:revise-chunk', async (
    _event,
    chunkId: string,
    beforeText: string,
    currentAfterText: string,
    instruction: string,
    model?: string,
  ) => {
    const prompt = [
      'You are revising a proposed change to a document.',
      '', 'ORIGINAL TEXT (before):', '```', beforeText, '```',
      '', 'CURRENT PROPOSAL (after):', '```', currentAfterText, '```',
      '', `USER'S REVISION REQUEST: ${instruction}`,
      '', 'Return ONLY the revised text. No explanations, no code fences, no preamble.',
    ].join('\n');

    return new Promise((resolve) => {
      const revision = spawnClaude(prompt, {
        model: model || 'sonnet',
        maxTurns: 1,
        allowedTools: ['Read'],  // No Edit/Write — just text output
      });
      let result = '';
      let hasError = false;
      revision.onData((text) => { result += text; });
      revision.onComplete((final) => {
        const text = (final || result).trim();
        if (text) {
          resolve({ success: true, revisedText: text });
        } else {
          resolve({ success: false, error: 'Claude returned an empty response' });
        }
      });
      revision.onError((error) => {
        if (!hasError) {
          hasError = true;
          resolve({ success: false, error: error || 'Revision failed' });
        }
      });
    });
  });

  ipcMain.handle(
    'claude:multi-generate',
    async (
      _event,
      sections: Array<{ title: string; prompt: string }>,
      filePath: string,
      outline: string,
      model?: string,
    ) => {
      const useModel = model || 'sonnet';
      const maxConcurrent = 3;
      const results: Array<{ title: string; content: string; error?: string }> = [];
      let cancelled = false;
      const activeProcesses: ReturnType<typeof spawnClaude>[] = [];

      // Process sections with concurrency limit
      const processSections = async () => {
        let nextIndex = 0;
        const running = new Set<Promise<void>>();

        const processOne = async (index: number) => {
          const section = sections[index];

          // Notify renderer of section start
          mainWindow?.webContents.send('claude:multi-progress', {
            sectionIndex: index,
            status: 'streaming',
            output: '',
          });

          return new Promise<void>((resolve) => {
            if (cancelled) {
              results[index] = { title: section.title, content: '', error: 'Cancelled' };
              mainWindow?.webContents.send('claude:multi-progress', {
                sectionIndex: index,
                status: 'error',
                output: 'Cancelled',
              });
              resolve();
              return;
            }

            const sectionPrompt = `You are writing one section of a larger document. Here is the full outline:\n\n${outline}\n\n---\n\nWrite ONLY the following section: "${section.title}"\n\n${section.prompt}\n\nWrite well-structured markdown content for this section only. Do not include a title heading — it will be added automatically.`;

            let sectionOutput = '';
            const proc = spawnClaude(sectionPrompt, {
              allowedTools: ['Read', 'Edit', 'Write'],
              model: useModel,
              maxTurns: 3,
            });
            activeProcesses.push(proc);

            proc.onData((text) => {
              sectionOutput += text;
              mainWindow?.webContents.send('claude:multi-progress', {
                sectionIndex: index,
                status: 'streaming',
                output: sectionOutput,
              });
            });

            proc.onComplete((content) => {
              results[index] = { title: section.title, content };
              mainWindow?.webContents.send('claude:multi-progress', {
                sectionIndex: index,
                status: 'complete',
                output: content,
              });
              resolve();
            });

            proc.onError((error) => {
              results[index] = { title: section.title, content: '', error };
              mainWindow?.webContents.send('claude:multi-progress', {
                sectionIndex: index,
                status: 'error',
                output: error,
              });
              resolve();
            });
          });
        };

        while (nextIndex < sections.length && !cancelled) {
          while (running.size < maxConcurrent && nextIndex < sections.length) {
            const idx = nextIndex++;
            const promise = processOne(idx).then(() => { running.delete(promise); });
            running.add(promise);
          }
          if (running.size > 0) {
            await Promise.race(running);
          }
        }

        // Wait for remaining
        await Promise.all(running);
      };

      await processSections();

      // Combine results
      const combinedContent = results
        .map(r => r.error ? `## ${r.title}\n\n*Error generating this section: ${r.error}*` : `## ${r.title}\n\n${r.content}`)
        .join('\n\n---\n\n');

      // Backup before overwriting with generated content
      backupFile(filePath);

      // Send combined content as proposal — don't write directly
      mainWindow?.webContents.send('claude:multi-complete', {
        success: !cancelled,
        filePath,
        sectionCount: sections.length,
        errorCount: results.filter(r => r.error).length,
        proposedContent: combinedContent,
      });

      return { success: true, filePath };
    },
  );

  ipcMain.handle('claude:multi-cancel', async () => {
    // Kill all active processes — the multi-generate handler checks the cancelled flag
    mainWindow?.webContents.send('claude:multi-complete', {
      success: false,
      cancelled: true,
    });
  });

  ipcMain.handle('settings:get', async () => readSettings());
  ipcMain.handle('settings:set', async (_event, key: string, value: any) => {
    const settings = readSettings();
    settings[key] = value;
    writeSettings(settings);
    return settings;
  });

  ipcMain.handle('dialog:open-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: 'Select Vault Directory',
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('vault:resolve-root', async (_event, fromPath: string) => {
    return resolveVaultRoot(fromPath);
  });

  ipcMain.handle('vault:get-index', async (_event, fromPath: string) => {
    const vaultRoot = resolveVaultRoot(fromPath);
    if (!vaultRoot) return null;
    return { vaultRoot, files: scanVaultFiles(vaultRoot) };
  });

  ipcMain.handle('vault:list-files', async (_event, fromPath: string) => {
    const vaultRoot = resolveVaultRoot(fromPath);
    if (!vaultRoot) return [];
    return scanVaultFiles(vaultRoot).map(f => f.relativePath);
  });

  ipcMain.handle('google:check-existing', async (_event, docPath: string) => {
    const existing = getExistingDoc(docPath);
    if (!existing) return null;
    return { url: existing.url, title: existing.title, updatedAt: existing.updatedAt };
  });

  ipcMain.handle('google:share-doc', async (_event, markdown: string, title: string, docPath: string, action?: 'new' | 'update') => {
    try {
      // Strip YAML frontmatter
      let md = markdown.replace(/^---\n[\s\S]*?\n---\n*/, '');
      // Inline local images as base64 data URIs before converting to HTML
      const docDir = docPath ? path.dirname(docPath) : '';
      md = md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
        if (src.startsWith('data:') || src.startsWith('http')) return _match;
        const imgPath = path.resolve(docDir, src);
        try {
          const imgData = fs.readFileSync(imgPath);
          const ext = path.extname(imgPath).toLowerCase();
          const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/png';
          return `![${alt}](data:${mime};base64,${imgData.toString('base64')})`;
        } catch {
          console.error(`[google:share-doc] Image not found: ${imgPath}`);
          return _match;
        }
      });
      // Convert markdown to HTML and strip <hr> tags (Google Docs renders them as ugly thick colored rules)
      let html = await marked.parse(md);
      html = html.replace(/<hr\s*\/?>/gi, '');
      // Inline any remaining local image paths in HTML (from raw <img> tags in markdown)
      html = html.replace(/(<img\s[^>]*?)src="([^"]+)"/gi, (_match, before, src) => {
        if (src.startsWith('data:') || src.startsWith('http')) return _match;
        const imgPath = path.resolve(docDir, src);
        try {
          const imgData = fs.readFileSync(imgPath);
          const ext = path.extname(imgPath).toLowerCase();
          const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/png';
          return `${before}src="data:${mime};base64,${imgData.toString('base64')}"`;
        } catch {
          console.error(`[google:share-doc] Image not found in HTML: ${imgPath}`);
          return _match;
        }
      });
      // Constrain images without explicit width — Google Docs ignores CSS
      html = html.replace(/<img(?![^>]*\bwidth\b)/gi, '<img width="500" ');
      // Inline styles on table elements — Google Docs ignores CSS for tables
      const cellStyle = 'style="padding:1pt 4pt;font-size:10pt;line-height:1.15;vertical-align:top"';
      html = html.replace(/<table>/gi, '<table style="border-collapse:collapse;font-size:10pt" cellpadding="0" cellspacing="0">');
      html = html.replace(/<th(?=[\s>])/gi, `<th ${cellStyle}`);
      html = html.replace(/<td(?=[\s>])/gi, `<td ${cellStyle}`);
      // Wrap in styled HTML template
      const wrappedHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.3; color: #222; }
h1 { font-size: 17pt; font-weight: bold; margin: 14pt 0 4pt; }
h2 { font-size: 14pt; font-weight: bold; margin: 12pt 0 3pt; }
h3 { font-size: 12pt; font-weight: bold; margin: 10pt 0 2pt; }
h4, h5, h6 { font-size: 11pt; font-weight: bold; margin: 8pt 0 2pt; }
p { margin: 0 0 4pt; }
ul, ol { margin: 2pt 0 6pt; padding-left: 20pt; }
li { margin: 1pt 0; }
code { font-family: 'Courier New', monospace; font-size: 9pt; background-color: #f3f3f3; }
pre { font-family: 'Courier New', monospace; font-size: 9pt; background-color: #f3f3f3; padding: 6pt; margin: 4pt 0; }
pre code { background: none; }
blockquote { border-left: 2px solid #ccc; margin: 4pt 0; padding: 2pt 0 2pt 10pt; color: #444; }
table { border-collapse: collapse; margin: 4pt 0; }
th, td { border: 1px solid #bbb; padding: 2pt 6pt; font-size: 10pt; }
th { background-color: #f0f0f0; font-weight: bold; }
</style></head><body>${html}</body></html>`;
      let url: string;
      const existing = getExistingDoc(docPath);
      if (action === 'update' && existing) {
        url = await updateGoogleDoc(existing.docId, wrappedHtml, title, docPath);
      } else {
        url = await uploadHtmlAsGoogleDoc(wrappedHtml, title, docPath);
      }
      return { success: true, url };
    } catch (err: any) {
      return { success: false, error: err.message || 'Upload failed' };
    }
  });

  ipcMain.handle('google:pull-doc', async (_event, localPath: string) => {
    try {
      const existing = getExistingDoc(localPath);
      if (!existing) throw new Error('No linked Google Doc found');

      // Fetch comments + export text in parallel
      const [rawComments, remoteText] = await Promise.all([
        fetchDocComments(existing.docId),
        exportDocAsText(existing.docId),
      ]);

      // Filter out already-pulled comment IDs
      const pulledIds = getPulledCommentIds(localPath);
      const newComments = rawComments.filter(c => !pulledIds.includes(c.id));

      // Mark new comments as pulled
      if (newComments.length > 0) {
        markCommentsPulled(localPath, newComments.map(c => c.id));
      }

      // Shape comments for the renderer
      const comments = newComments.map(c => ({
        googleId: c.id,
        selectedText: c.quotedFileContent?.value || '',
        comment: `[${c.author.displayName}]: ${c.content}`,
        createdTime: c.createdTime,
      }));

      return { comments, remoteText };
    } catch (err: any) {
      throw new Error(err.message || 'Failed to pull comments');
    }
  });

  ipcMain.handle('google:open-url', async (_event, url: string) => {
    shell.openExternal(url);
  });

  ipcMain.handle('google:sign-out', async () => {
    clearTokens();
  });

  ipcMain.handle('google:check-configured', async () => {
    return isGoogleOAuthConfigured();
  });

  ipcMain.handle('google:save-credentials', async (_event, clientId: string, clientSecret: string) => {
    const oauthPath = path.join(os.homedir(), '.komma', 'google-oauth.json');
    const dir = path.dirname(oauthPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(oauthPath, JSON.stringify({ clientId, clientSecret }, null, 2));
    resetGoogleCredsCache();
    return isGoogleOAuthConfigured();
  });

  ipcMain.handle('google:load-credentials', async () => {
    try {
      const oauthPath = path.join(os.homedir(), '.komma', 'google-oauth.json');
      const config = JSON.parse(fs.readFileSync(oauthPath, 'utf-8'));
      return { clientId: config.clientId || '', clientSecret: config.clientSecret || '' };
    } catch {
      return { clientId: '', clientSecret: '' };
    }
  });
}

function buildAppMenu() {
  const send = (channel: string, ...args: unknown[]) => {
    mainWindow?.webContents.send(channel, ...args);
  };

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Komma',
      submenu: [
        { role: 'about', label: 'About Komma' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => send('menu:action', 'new-tab'),
        },
        {
          label: 'New Document',
          accelerator: 'CmdOrCtrl+N',
          click: () => send('menu:action', 'new-document'),
        },
        {
          label: 'Open File...',
          accelerator: 'CmdOrCtrl+O',
          click: () => send('menu:action', 'open-file'),
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => send('menu:action', 'save'),
        },
        { type: 'separator' },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => send('menu:action', 'close-tab'),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find',
          accelerator: 'CmdOrCtrl+F',
          click: () => send('menu:action', 'find'),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Edit Mode',
          accelerator: 'CmdOrCtrl+E',
          click: () => send('menu:action', 'toggle-edit'),
        },
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+Alt+B',
          click: () => send('menu:action', 'toggle-sidebar'),
        },
        {
          label: 'Toggle Dark Mode',
          accelerator: 'CmdOrCtrl+Alt+T',
          click: () => send('menu:action', 'toggle-theme'),
        },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Selection',
      submenu: [
        {
          label: 'Add Comment',
          accelerator: 'CmdOrCtrl+K',
          click: () => send('menu:action', 'add-comment'),
        },
      ],
    },
    {
      label: 'AI',
      submenu: [
        {
          label: 'Send Comments to Claude',
          accelerator: 'CmdOrCtrl+Enter',
          click: () => send('menu:action', 'send-to-claude'),
        },
        { type: 'separator' },
        {
          label: 'Model: Haiku',
          click: () => send('menu:action', 'set-model', 'haiku'),
        },
        {
          label: 'Model: Sonnet',
          click: () => send('menu:action', 'set-model', 'sonnet'),
        },
        {
          label: 'Model: Opus',
          click: () => send('menu:action', 'set-model', 'opus'),
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        {
          label: 'Next Tab',
          accelerator: 'Ctrl+Tab',
          click: () => send('menu:action', 'next-tab'),
        },
        {
          label: 'Previous Tab',
          accelerator: 'Ctrl+Shift+Tab',
          click: () => send('menu:action', 'prev-tab'),
        },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.name = 'Komma';

const PENDING_FILE = '/tmp/komma-open-file';

app.whenReady().then(async () => {
  // Set dock icon in dev mode (production uses the bundled icon)
  if (!app.isPackaged && process.platform === 'darwin') {
    const iconPath = path.join(__dirname, '..', 'build', 'icon.iconset', 'icon_256x256.png');
    if (fs.existsSync(iconPath)) {
      const icon = nativeImage.createFromPath(iconPath);
      if (!icon.isEmpty()) {
        app.dock.setIcon(icon);
      }
    }
  }
  try {
    serverPort = await findFreePort();
    console.log(`Starting Next.js on port ${serverPort}...`);
    await startNextServer(serverPort);
    console.log('Next.js server ready.');

    registerIpcHandlers();
    buildAppMenu();
    createWindow(serverPort);

    // Watch for file-open requests from the AppleScript wrapper
    // (handles the case when Electron is already running and user double-clicks a .md)
    const consumePendingFile = () => {
      try {
        if (fs.existsSync(PENDING_FILE)) {
          const openPath = fs.readFileSync(PENDING_FILE, 'utf-8').trim();
          fs.unlinkSync(PENDING_FILE);
          if (openPath && mainWindow) {
            mainWindow.webContents.send('menu:action', 'open-path', openPath);
          }
        }
      } catch { /* ignore race */ }
    };

    // Poll for the temp file — fs.watch on /tmp is unreliable on macOS
    // (symlink to /private/tmp breaks it). 200ms polling is fast enough to feel instant.
    setInterval(consumePendingFile, 200);

  } catch (err) {
    console.error('Failed to start application:', err);
    app.quit();
  }
});

// macOS: handle file open events (double-click .md in Finder)
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow && serverPort) {
    mainWindow.webContents.send('menu:action', 'open-path', filePath);
  } else {
    pendingOpenFile = filePath;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null && serverPort !== null) {
    createWindow(serverPort);
  }
});

app.on('before-quit', () => {
  try { fs.unwatchFile(PENDING_FILE); } catch { /* noop */ }
  if (nextServer && !nextServer.killed) {
    nextServer.kill('SIGTERM');
  }
  if (currentEdit) {
    currentEdit.kill();
    currentEditDocPath = null;
  }
  if (currentChat) {
    currentChat.kill();
    currentChatDocPath = null;
    if (currentChatProposalPath) {
      try { fs.unlinkSync(currentChatProposalPath); } catch {}
      currentChatProposalPath = null;
      currentChatOriginalContent = null;
    }
  }
});
