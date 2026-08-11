type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

declare global {
  interface Window {
    __TAURI__?: {
      core?: {
        invoke?: Invoke;
      };
    };
  }
}

function nativeInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return Promise.reject(new Error('Native Tauri runtime is not available.'));
  return invoke<T>(command, args);
}

export function nativePtyAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.__TAURI__?.core?.invoke === 'function';
}

export function startNativePty(
  sessionId: string,
  command: string,
  cwd?: string,
  cols = 100,
  rows = 30
): Promise<void> {
  return nativeInvoke<void>('pty_start', {
    sessionId,
    command,
    cwd: cwd?.trim() ? cwd.trim() : null,
    cols,
    rows,
  });
}

export function readNativePty(sessionId: string): Promise<string> {
  return nativeInvoke<string>('pty_read', { sessionId });
}

export function writeNativePty(sessionId: string, data: string): Promise<void> {
  return nativeInvoke<void>('pty_write', { sessionId, data });
}

export function resizeNativePty(sessionId: string, cols: number, rows: number): Promise<void> {
  return nativeInvoke<void>('pty_resize', {
    sessionId,
    cols: Math.max(1, Math.floor(cols)),
    rows: Math.max(1, Math.floor(rows)),
  });
}

export function nativePtyStatus(sessionId: string): Promise<string> {
  return nativeInvoke<string>('pty_status', { sessionId });
}

export function stopNativePty(sessionId: string): Promise<void> {
  return nativeInvoke<void>('pty_stop', { sessionId });
}
