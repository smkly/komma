import { BrowserWindow, safeStorage, app } from 'electron';
import * as crypto from 'crypto';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

// Google OAuth credentials — loaded from env vars or ~/.helm/google-oauth.json
// See SETUP.md for how to obtain your own credentials
let _googleCreds: { clientId: string; clientSecret: string } | null = null;
function getGoogleCreds() {
  if (_googleCreds) return _googleCreds;
  // 1. Environment variables
  const envId = process.env.HELM_GOOGLE_CLIENT_ID;
  const envSecret = process.env.HELM_GOOGLE_CLIENT_SECRET;
  if (envId && envSecret) {
    _googleCreds = { clientId: envId, clientSecret: envSecret };
    return _googleCreds;
  }
  // 2. Config file at ~/.helm/google-oauth.json
  try {
    const configPath = path.join(require('os').homedir(), '.helm', 'google-oauth.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (config.clientId && config.clientSecret) {
      _googleCreds = { clientId: config.clientId, clientSecret: config.clientSecret };
      return _googleCreds;
    }
  } catch { /* not configured */ }
  _googleCreds = { clientId: '', clientSecret: '' };
  return _googleCreds;
}

const REDIRECT_URI = 'http://localhost:19837/callback';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

interface TokenData {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
}

// --- PKCE helpers ---

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// --- Token storage (encrypted via safeStorage) ---

function getTokenPath(): string {
  return path.join(app.getPath('userData'), 'google-tokens.enc');
}

function storeTokens(tokens: TokenData): void {
  const json = JSON.stringify(tokens);
  const encrypted = safeStorage.encryptString(json);
  fs.writeFileSync(getTokenPath(), encrypted);
}

function getStoredTokens(): TokenData | null {
  const tokenPath = getTokenPath();
  if (!fs.existsSync(tokenPath)) return null;
  try {
    const encrypted = fs.readFileSync(tokenPath);
    const json = safeStorage.decryptString(encrypted);
    return JSON.parse(json) as TokenData;
  } catch {
    return null;
  }
}

export function clearTokens(): void {
  const tokenPath = getTokenPath();
  try {
    fs.unlinkSync(tokenPath);
  } catch {
    // File doesn't exist, nothing to clear
  }
}

// --- HTTPS request helper ---

function httpsRequest(
  url: string,
  options: https.RequestOptions,
  body?: string | Buffer,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          body: Buffer.concat(chunks).toString('utf-8'),
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// --- Token exchange & refresh ---

async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<TokenData> {
  const params = new URLSearchParams({
    client_id: getGoogleCreds().clientId,
    client_secret: getGoogleCreds().clientSecret,
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
  });

  const postBody = params.toString();
  const res = await httpsRequest(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postBody),
    },
  }, postBody);

  if (res.statusCode !== 200) {
    throw new Error(`Token exchange failed (${res.statusCode}): ${res.body}`);
  }

  const data = JSON.parse(res.body);
  const tokens: TokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  storeTokens(tokens);
  return tokens;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenData> {
  const params = new URLSearchParams({
    client_id: getGoogleCreds().clientId,
    client_secret: getGoogleCreds().clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const postBody = params.toString();
  const res = await httpsRequest(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postBody),
    },
  }, postBody);

  if (res.statusCode !== 200) {
    throw new Error(`Token refresh failed (${res.statusCode}): ${res.body}`);
  }

  const data = JSON.parse(res.body);
  const tokens: TokenData = {
    access_token: data.access_token,
    refresh_token: refreshToken,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  storeTokens(tokens);
  return tokens;
}

// --- OAuth2 PKCE flow ---

export function startOAuthFlow(): Promise<TokenData> {
  return new Promise((resolve, reject) => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    let callbackServer: http.Server | null = null;
    let authWindow: BrowserWindow | null = null;
    let settled = false;

    const cleanup = () => {
      if (callbackServer) {
        callbackServer.close();
        callbackServer = null;
      }
      if (authWindow && !authWindow.isDestroyed()) {
        authWindow.close();
        authWindow = null;
      }
    };

    const settle = (error: Error | null, tokens?: TokenData) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(tokens!);
    };

    // Start local callback server
    callbackServer = http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://localhost:19837`);
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Authorization denied.</h2><p>You can close this window.</p></body></html>');
        settle(new Error(`OAuth denied: ${error}`));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Missing authorization code.</h2></body></html>');
        settle(new Error('Missing authorization code in callback'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h2>Authorized!</h2><p>You can close this window and return to Helm.</p></body></html>');

      try {
        const tokens = await exchangeCodeForTokens(code, codeVerifier);
        settle(null, tokens);
      } catch (err) {
        settle(err instanceof Error ? err : new Error(String(err)));
      }
    });

    callbackServer.listen(19837, () => {
      const authUrl =
        `${AUTH_ENDPOINT}?` +
        new URLSearchParams({
          client_id: getGoogleCreds().clientId,
          redirect_uri: REDIRECT_URI,
          response_type: 'code',
          scope: SCOPES,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
          access_type: 'offline',
          prompt: 'consent',
        }).toString();

      authWindow = new BrowserWindow({
        width: 600,
        height: 700,
        title: 'Sign in with Google',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      authWindow.loadURL(authUrl);

      authWindow.on('closed', () => {
        authWindow = null;
        settle(new Error('Authentication window was closed'));
      });
    });

    callbackServer.on('error', (err) => {
      settle(new Error(`Failed to start callback server: ${err.message}`));
    });
  });
}

// --- Get a valid access token (refresh or re-auth as needed) ---

export async function getValidToken(): Promise<string> {
  const stored = getStoredTokens();

  if (!stored) {
    const tokens = await startOAuthFlow();
    return tokens.access_token;
  }

  // Refresh 60 seconds before expiry
  if (Date.now() < stored.expires_at - 60_000) {
    return stored.access_token;
  }

  if (stored.refresh_token) {
    try {
      const tokens = await refreshAccessToken(stored.refresh_token);
      return tokens.access_token;
    } catch {
      // Refresh failed — full re-auth
      const tokens = await startOAuthFlow();
      return tokens.access_token;
    }
  }

  const tokens = await startOAuthFlow();
  return tokens.access_token;
}

// --- Doc ID mapping (local file path -> Google Doc ID) ---

function getDocMapPath(): string {
  return path.join(app.getPath('userData'), 'google-doc-map.json');
}

interface DocMapEntry {
  docId: string;
  url: string;
  title: string;
  updatedAt: string;
  pulledCommentIds?: string[];
}

function getDocMap(): Record<string, DocMapEntry> {
  try {
    return JSON.parse(fs.readFileSync(getDocMapPath(), 'utf-8'));
  } catch {
    return {};
  }
}

function saveDocMap(map: Record<string, DocMapEntry>): void {
  fs.writeFileSync(getDocMapPath(), JSON.stringify(map, null, 2));
}

export function getExistingDoc(localPath: string): DocMapEntry | null {
  const map = getDocMap();
  return map[localPath] || null;
}

// --- Google Drive upload (HTML -> Google Doc) ---

export async function uploadHtmlAsGoogleDoc(html: string, title: string, localPath?: string): Promise<string> {
  const accessToken = await getValidToken();

  const boundary = `helm_boundary_${crypto.randomBytes(16).toString('hex')}`;
  const metadata = JSON.stringify({
    name: title,
    mimeType: 'application/vnd.google-apps.document',
  });

  const bodyParts = [
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    metadata,
    `\r\n--${boundary}\r\n`,
    'Content-Type: text/html; charset=UTF-8\r\n\r\n',
    html,
    `\r\n--${boundary}--`,
  ];
  const body = bodyParts.join('');

  const res = await httpsRequest(DRIVE_UPLOAD_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': Buffer.byteLength(body, 'utf-8'),
    },
  }, body);

  if (res.statusCode !== 200) {
    throw new Error(`Drive upload failed (${res.statusCode}): ${res.body}`);
  }

  const data = JSON.parse(res.body);
  const url = `https://docs.google.com/document/d/${data.id}/edit`;

  // Store mapping
  if (localPath) {
    const map = getDocMap();
    map[localPath] = { docId: data.id, url, title, updatedAt: new Date().toISOString() };
    saveDocMap(map);
  }

  return url;
}

export async function updateGoogleDoc(docId: string, html: string, title: string, localPath?: string): Promise<string> {
  const accessToken = await getValidToken();

  const boundary = `helm_boundary_${crypto.randomBytes(16).toString('hex')}`;
  const metadata = JSON.stringify({ name: title });

  const bodyParts = [
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    metadata,
    `\r\n--${boundary}\r\n`,
    'Content-Type: text/html; charset=UTF-8\r\n\r\n',
    html,
    `\r\n--${boundary}--`,
  ];
  const body = bodyParts.join('');

  const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${docId}?uploadType=multipart`;
  const res = await httpsRequest(updateUrl, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': Buffer.byteLength(body, 'utf-8'),
    },
  }, body);

  if (res.statusCode !== 200) {
    throw new Error(`Drive update failed (${res.statusCode}): ${res.body}`);
  }

  const url = `https://docs.google.com/document/d/${docId}/edit`;

  // Update mapping
  if (localPath) {
    const map = getDocMap();
    map[localPath] = { docId, url, title, updatedAt: new Date().toISOString() };
    saveDocMap(map);
  }

  return url;
}

// --- Fetch comments from a Google Doc ---

export async function fetchDocComments(docId: string): Promise<
  Array<{ id: string; content: string; author: { displayName: string }; quotedFileContent?: { value: string }; createdTime: string }>
> {
  const accessToken = await getValidToken();
  const url = `https://www.googleapis.com/drive/v3/files/${docId}/comments?fields=comments(id,content,resolved,author,quotedFileContent,createdTime)&includeDeleted=false`;

  const res = await httpsRequest(url, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (res.statusCode !== 200) {
    throw new Error(`Failed to fetch comments (${res.statusCode}): ${res.body}`);
  }

  const data = JSON.parse(res.body);
  const comments: Array<any> = data.comments || [];
  return comments.filter((c: any) => c.resolved !== true);
}

// --- Export Google Doc as plain text ---

export async function exportDocAsText(docId: string): Promise<string> {
  const accessToken = await getValidToken();
  const url = `https://www.googleapis.com/drive/v3/files/${docId}/export?mimeType=text/plain`;

  const res = await httpsRequest(url, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (res.statusCode !== 200) {
    throw new Error(`Failed to export doc as text (${res.statusCode}): ${res.body}`);
  }

  return res.body;
}

// --- Dedup helpers for pulled comment IDs ---

export function getPulledCommentIds(localPath: string): string[] {
  const map = getDocMap();
  const entry = map[localPath];
  return entry?.pulledCommentIds || [];
}

export function markCommentsPulled(localPath: string, commentIds: string[]): void {
  const map = getDocMap();
  const entry = map[localPath];
  if (!entry) return;
  const existing = new Set(entry.pulledCommentIds || []);
  for (const id of commentIds) existing.add(id);
  entry.pulledCommentIds = Array.from(existing);
  saveDocMap(map);
}
