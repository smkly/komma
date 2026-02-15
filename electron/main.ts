import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as http from 'http';
import * as net from 'net';
import { spawnClaude } from './claude';

let mainWindow: BrowserWindow | null = null;
let nextServer: ChildProcess | null = null;
let currentClaude: ReturnType<typeof spawnClaude> | null = null;
let serverPort: number | null = null;
let accumulatedStreamText = '';

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
    width: 1200,
    height: 800,
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

function registerIpcHandlers() {
  ipcMain.handle(
    'claude:send-edit',
    async (_event, prompt: string, filePath: string, model?: string) => {
      if (currentClaude) {
        currentClaude.kill();
        currentClaude = null;
      }

      const useModel = model || 'sonnet';
      const isFast = useModel !== 'opus';
      const fullPrompt = isFast
        ? `Edit the file at ${filePath}. Read it, apply the changes, and stop. Do not explain.\n\n${prompt}`
        : `Edit the file at ${filePath}:\n\n${prompt}`;
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
      });

      currentClaude.onError((error) => {
        mainWindow?.webContents.send('claude:complete', {
          type: 'edit',
          success: false,
          error,
        });
        currentClaude = null;
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
    ) => {
      if (currentClaude) {
        currentClaude.kill();
        currentClaude = null;
      }

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

      const useModel = model || 'sonnet';
      const fullPrompt = promptParts.join('\n\n---\n\n');
      accumulatedStreamText = '';
      currentClaude = spawnClaude(fullPrompt, {
        maxTurns: useModel === 'opus' ? undefined : 3,
        model: useModel,
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
      });

      currentClaude.onError((error) => {
        mainWindow?.webContents.send('claude:complete', {
          type: 'chat',
          success: false,
          error,
        });
        currentClaude = null;
      });
    },
  );

  ipcMain.handle('claude:list-mcps', async () => {
    try {
      const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      return Object.keys(settings.mcpServers || {}).map(name => ({ name }));
    } catch {
      return [];
    }
  });

  ipcMain.handle('claude:cancel', async () => {
    if (currentClaude) {
      currentClaude.kill();
      currentClaude = null;
    }
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

app.whenReady().then(async () => {
  try {
    serverPort = await findFreePort();
    console.log(`Starting Next.js on port ${serverPort}...`);
    await startNextServer(serverPort);
    console.log('Next.js server ready.');

    registerIpcHandlers();
    buildAppMenu();
    createWindow(serverPort);

  } catch (err) {
    console.error('Failed to start application:', err);
    app.quit();
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
  if (nextServer && !nextServer.killed) {
    nextServer.kill('SIGTERM');
  }
  if (currentClaude) {
    currentClaude.kill();
  }
});
