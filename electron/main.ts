import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as http from 'http';
import * as net from 'net';
import { spawnClaude } from './claude';
import { uploadHtmlAsGoogleDoc, updateGoogleDoc, clearTokens, getExistingDoc, fetchDocComments, exportDocAsText, getPulledCommentIds, markCommentsPulled } from './google-auth';
import { marked } from 'marked';

const SETTINGS_PATH = path.join(os.homedir(), '.helm', 'config.json');

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

let mainWindow: BrowserWindow | null = null;
let nextServer: ChildProcess | null = null;
let currentClaude: ReturnType<typeof spawnClaude> | null = null;
let currentClaudeDocPath: string | null = null;
let serverPort: number | null = null;
let accumulatedStreamText = '';
let pendingOpenFile: string | null = process.env.HELM_OPEN_FILE || null;

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
    // Production: use Next.js standalone server
    const serverPath = path.join(projectRoot, '.next', 'standalone', 'server.js');
    nextServer = spawn(process.execPath, [serverPath], {
      env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
      cwd: projectRoot,
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
    title: 'Helm',
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
        } else if (entry.name.endsWith('.md')) {
          const relativePath = path.relative(vaultRoot, fullPath);
          let firstLine = '';
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            // Get first heading or first non-empty line
            const lines = content.split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed) {
                firstLine = trimmed.replace(/^#+\s*/, '');
                break;
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

function registerIpcHandlers() {
  // Renderer calls this on mount to get any file that triggered the app launch
  ipcMain.handle('app:get-pending-file', () => {
    const file = pendingOpenFile;
    pendingOpenFile = null;
    return file;
  });

  ipcMain.handle(
    'claude:send-edit',
    async (_event, prompt: string, filePath: string, model?: string, refs?: { docs: string[]; mcps: string[]; vault?: boolean; architecture?: boolean }) => {
      if (currentClaude) {
        if (currentClaudeDocPath && currentClaudeDocPath !== filePath) {
          throw new Error(`Claude is currently working on ${currentClaudeDocPath.split('/').pop()}. Please wait or cancel first.`);
        }
        currentClaude.kill();
        currentClaude = null;
      }
      currentClaudeDocPath = filePath;

      const useModel = model || 'sonnet';
      const isFast = useModel !== 'opus';

      const vaultRoot = resolveVaultRoot(filePath);
      let refContext = '';
      if (refs) {
        refContext = resolveRefsToContext(refs, filePath, vaultRoot);
      }

      const fileExists = fs.existsSync(filePath);
      const fullPrompt = isFast
        ? (fileExists
            ? `Edit the file at ${filePath}. Read it, apply the changes, and stop. Do not explain.\n\n${prompt}${refContext}`
            : `${prompt}${refContext}`)
        : (fileExists
            ? `Edit the file at ${filePath}:\n\n${prompt}${refContext}`
            : `${prompt}${refContext}`);
      accumulatedStreamText = '';
      currentClaude = spawnClaude(fullPrompt, {
        allowedTools: isFast ? ['Read', 'Edit', 'Write'] : undefined,
        maxTurns: isFast ? 5 : undefined,
        model: useModel,
      });

      currentClaude.onData((text) => {
        accumulatedStreamText += text;
        mainWindow?.webContents.send('claude:stream', {
          type: 'edit',
          content: accumulatedStreamText,
        });
      });

      currentClaude.onComplete((result) => {
        mainWindow?.webContents.send('claude:complete', {
          type: 'edit',
          success: true,
          content: result,
        });
        currentClaude = null;
        currentClaudeDocPath = null;
      });

      currentClaude.onError((error) => {
        mainWindow?.webContents.send('claude:complete', {
          type: 'edit',
          success: false,
          error,
        });
        currentClaude = null;
        currentClaudeDocPath = null;
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
      if (currentClaude) {
        if (currentClaudeDocPath && currentClaudeDocPath !== docPath) {
          throw new Error(`Claude is currently working on ${currentClaudeDocPath.split('/').pop()}. Please wait or cancel first.`);
        }
        currentClaude.kill();
        currentClaude = null;
      }
      currentClaudeDocPath = docPath;

      let promptParts: string[] = [];

      // Include document content if available
      if (docPath) {
        try {
          const docContent = fs.readFileSync(docPath, 'utf-8');
          promptParts.push(`The user is working on a document at ${docPath}. Here is its current content:\n\n${docContent}`);
        } catch {
          promptParts.push(`The user is working on a document at ${docPath} (could not read file).`);
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
        const tmpDir = path.join(os.tmpdir(), 'helm-chat-images');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        for (const img of images) {
          const ext = img.mimeType.split('/')[1] || 'png';
          const tmpPath = path.join(tmpDir, `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
          fs.writeFileSync(tmpPath, Buffer.from(img.data, 'base64'));
          tempImagePaths.push(tmpPath);
        }
        promptParts.push(`The user has attached ${images.length} image(s) for you to look at.`);
      }

      const useModel = model || 'sonnet';
      const fullPrompt = promptParts.join('\n\n---\n\n');
      accumulatedStreamText = '';
      currentClaude = spawnClaude(fullPrompt, {
        maxTurns: useModel === 'opus' ? undefined : 3,
        model: useModel,
        files: tempImagePaths.length > 0 ? tempImagePaths : undefined,
      });

      currentClaude.onData((text) => {
        accumulatedStreamText += text;
        mainWindow?.webContents.send('claude:stream', {
          type: 'chat',
          content: accumulatedStreamText,
        });
      });

      currentClaude.onComplete((result) => {
        mainWindow?.webContents.send('claude:complete', {
          type: 'chat',
          success: true,
          content: result,
        });
        currentClaude = null;
        currentClaudeDocPath = null;
      });

      currentClaude.onError((error) => {
        mainWindow?.webContents.send('claude:complete', {
          type: 'chat',
          success: false,
          error,
        });
        currentClaude = null;
        currentClaudeDocPath = null;
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
    if (currentClaude) {
      currentClaude.kill();
      currentClaude = null;
      currentClaudeDocPath = null;
    }
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

      // Write to file
      fs.writeFileSync(filePath, combinedContent, 'utf-8');

      mainWindow?.webContents.send('claude:multi-complete', {
        success: !cancelled,
        filePath,
        sectionCount: sections.length,
        errorCount: results.filter(r => r.error).length,
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
}

function buildAppMenu() {
  const send = (channel: string, ...args: unknown[]) => {
    mainWindow?.webContents.send(channel, ...args);
  };

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Helm',
      submenu: [
        { role: 'about', label: 'About Helm' },
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

app.name = 'Helm';

const PENDING_FILE = '/tmp/helm-open-file';

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
  if (currentClaude) {
    currentClaude.kill();
    currentClaudeDocPath = null;
  }
});
