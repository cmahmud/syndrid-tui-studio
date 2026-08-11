import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';

const TOKEN_DIR = join(homedir(), '.syndrid-tui-studio');
const TOKEN_PATH = join(TOKEN_DIR, 'bridge-token');
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://tauri.localhost',
  'https://tauri.localhost',
]);

function validToken(value) {
  return typeof value === 'string' && /^[a-f0-9]{64,}$/i.test(value.trim());
}

function loadOrCreateToken() {
  const fromEnv = process.env.SYNDRID_TUI_BRIDGE_TOKEN?.trim();
  if (validToken(fromEnv)) return fromEnv;

  mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
  if (existsSync(TOKEN_PATH)) {
    const existing = readFileSync(TOKEN_PATH, 'utf8').trim();
    if (validToken(existing)) {
      try { chmodSync(TOKEN_PATH, 0o600); } catch { /* Windows ACLs are managed by the user profile */ }
      return existing;
    }
  }

  const token = randomBytes(32).toString('hex');
  writeFileSync(TOKEN_PATH, `${token}\n`, { encoding: 'utf8', mode: 0o600, flag: 'w' });
  try { chmodSync(TOKEN_PATH, 0o600); } catch { /* best effort on Windows */ }
  return token;
}

const expectedToken = Buffer.from(loadOrCreateToken(), 'utf8');
const originalShouldHandle = WebSocketServer.prototype.shouldHandle;

WebSocketServer.prototype.shouldHandle = function authenticatedShouldHandle(request) {
  if (!originalShouldHandle.call(this, request)) return false;

  const origin = request.headers.origin;
  // Native WebView and local development origins are allowed. Stdio/CLI
  // clients do not connect to this WebSocket at all.
  if (origin && !ALLOWED_ORIGINS.has(origin)) return false;

  let supplied = '';
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    supplied = url.searchParams.get('token') ?? '';
  } catch {
    return false;
  }
  const candidate = Buffer.from(supplied, 'utf8');
  return candidate.length === expectedToken.length && timingSafeEqual(candidate, expectedToken);
};

// Intentionally never print the token. The Tauri process reads the same
// per-user token file through its private command before opening the socket.
