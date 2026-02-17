import { spawn, ChildProcess, execSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

interface SpawnClaudeOpts {
  allowedTools?: string[];
  maxTurns?: number;
  model?: string;
  mcpConfig?: string;
}

export interface ClaudeProcess {
  onData: (cb: (text: string) => void) => void;
  onComplete: (cb: (result: string) => void) => void;
  onError: (cb: (error: string) => void) => void;
  kill: () => void;
}

function findClaudePath(): string {
  const home = os.homedir();
  const candidates = [
    path.join(home, '.local', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
  ];
  for (const p of candidates) {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch {
      // continue
    }
  }
  try {
    return execSync('which claude', { encoding: 'utf-8' }).trim();
  } catch {
    return 'claude';
  }
}

const claudePath = findClaudePath();
console.log('[claude.ts] Claude CLI path:', claudePath);

export function spawnClaude(
  prompt: string,
  opts?: SpawnClaudeOpts,
): ClaudeProcess {
  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions'];

  if (opts?.allowedTools) {
    for (const tool of opts.allowedTools) {
      args.push('--allowedTools', tool);
    }
  }

  if (opts?.maxTurns) {
    args.push('--max-turns', String(opts.maxTurns));
  }

  if (opts?.model) {
    args.push('--model', opts.model);
  }

  if (opts?.mcpConfig) {
    args.push('--mcp-config', opts.mcpConfig);
  }

  // Buffer events until callbacks are registered
  const pendingData: string[] = [];
  let pendingComplete: string | null = null;
  let pendingError: string | null = null;
  let dataCallback: ((text: string) => void) | null = null;
  let completeCallback: ((result: string) => void) | null = null;
  let errorCallback: ((error: string) => void) | null = null;
  let completeFired = false;
  let buffer = '';

  // Build env without CLAUDECODE (must delete, not set empty)
  const env = { ...process.env };
  delete env.CLAUDECODE;
  env.PATH = `${path.join(os.homedir(), '.local', 'bin')}:/usr/local/bin:/opt/homebrew/bin:${env.PATH || ''}`;


  let proc: ChildProcess | null = spawn(claudePath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });

  proc.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);

        if (parsed.type === 'assistant' && parsed.message?.content) {
          for (const block of parsed.message.content) {
            if (block.type === 'text' && block.text) {
              if (dataCallback) {
                dataCallback(block.text);
              } else {
                pendingData.push(block.text);
              }
            }
          }
        } else if (parsed.type === 'result') {
          completeFired = true;
          const result = parsed.result != null
            ? (typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed.result))
            : '';
          if (completeCallback) {
            completeCallback(result);
          } else {
            pendingComplete = result;
          }
        }
        // Skip system/hook messages silently
      } catch {
        // Skip non-JSON lines
      }
    }
  });

  proc.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    console.error('[claude stderr]', text);
    if (errorCallback) {
      errorCallback(text);
    } else {
      pendingError = (pendingError || '') + text;
    }
  });

  proc.on('error', (err) => {
    if (errorCallback) {
      errorCallback(err.message);
    } else {
      pendingError = err.message;
    }
  });

  proc.on('close', (code) => {
    console.log(`[claude] process exited with code ${code}, completeFired=${completeFired}`);
    // Flush remaining buffer
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer);
        if (parsed.type === 'result') {
          completeFired = true;
          const result = parsed.result != null
            ? (typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed.result))
            : '';
          if (completeCallback) {
            completeCallback(result);
          } else {
            pendingComplete = result;
          }
        }
      } catch {
        // ignore
      }
    }

    if (code !== 0 && code !== null) {
      const errMsg = `Claude process exited with code ${code}`;
      if (errorCallback) {
        errorCallback(errMsg);
      } else {
        pendingError = (pendingError || '') + errMsg;
      }
    } else if (pendingComplete === null && !completeFired) {
      // Process exited cleanly but no result message was emitted — signal completion
      if (completeCallback) {
        completeCallback('');
      } else {
        pendingComplete = '';
      }
    }
  });

  return {
    onData: (cb) => {
      dataCallback = cb;
      // Flush buffered data
      for (const text of pendingData) {
        cb(text);
      }
      pendingData.length = 0;
    },
    onComplete: (cb) => {
      completeCallback = cb;
      if (pendingComplete !== null) {
        cb(pendingComplete);
        pendingComplete = null;
      }
    },
    onError: (cb) => {
      errorCallback = cb;
      if (pendingError !== null) {
        cb(pendingError);
        pendingError = null;
      }
    },
    kill: () => {
      if (proc && !proc.killed) {
        proc.kill('SIGTERM');
        proc = null;
      }
    },
  };
}
