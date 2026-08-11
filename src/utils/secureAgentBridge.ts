import { useUIStore } from '../stores/uiStore';
import { connectAgentBridge, disconnectAgentBridge } from './mcpBridge';
import { getNativeAgentBridgeToken, nativePtyAvailable } from './nativePty';

const BRIDGE_HOST = '127.0.0.1:5175';
let installedToken: string | null = null;
let originalWebSocket: typeof WebSocket | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;
let unsubscribe: (() => void) | null = null;

function authenticatedUrl(input: string | URL, token: string): string | URL {
  try {
    const url = new URL(String(input));
    if (url.protocol === 'ws:' && url.host === BRIDGE_HOST) {
      url.searchParams.set('token', token);
      return url.toString();
    }
  } catch {
    // Preserve URLs the native constructor understands if URL parsing fails.
  }
  return input;
}

function installWebSocketToken(token: string): void {
  if (installedToken === token) return;
  installedToken = token;
  originalWebSocket ??= window.WebSocket;
  const NativeWebSocket = originalWebSocket;

  class AuthenticatedStudioWebSocket extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      const secured = authenticatedUrl(url, token);
      if (protocols === undefined) super(secured);
      else super(secured, protocols);
    }
  }

  // Preserve standard ready-state constants consumers sometimes read from the constructor.
  Object.defineProperties(AuthenticatedStudioWebSocket, {
    CONNECTING: { value: NativeWebSocket.CONNECTING },
    OPEN: { value: NativeWebSocket.OPEN },
    CLOSING: { value: NativeWebSocket.CLOSING },
    CLOSED: { value: NativeWebSocket.CLOSED },
  });
  window.WebSocket = AuthenticatedStudioWebSocket as typeof WebSocket;
}

function scheduleRetry(): void {
  if (stopped || retryTimer || !useUIStore.getState().agentBridgeEnabled) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void ensureSecureTransport();
  }, 1500);
}

async function ensureSecureTransport(): Promise<void> {
  if (stopped || !useUIStore.getState().agentBridgeEnabled) return;
  if (!nativePtyAvailable()) {
    // The authenticated bridge is intentionally desktop-only. Browser builds
    // remain useful for design work but cannot read the private token file.
    useUIStore.getState().setAgentBridgeStatus('disconnected');
    return;
  }
  try {
    const token = await getNativeAgentBridgeToken();
    if (stopped || !useUIStore.getState().agentBridgeEnabled) return;
    const changed = installedToken !== token;
    installWebSocketToken(token);
    if (changed) {
      // Replace any unauthenticated connection attempt immediately instead of
      // waiting for its normal reconnect timer.
      disconnectAgentBridge();
      connectAgentBridge();
    }
  } catch {
    // The MCP server creates the token file when it starts. Studio may open
    // first, so missing-token is an expected transient startup state.
    scheduleRetry();
  }
}

/**
 * Install the authenticated local bridge transport for the lifetime of the app.
 * Existing mcpBridge reconnect/enable logic remains the single connection owner.
 */
export function initSecureAgentBridgeTransport(): () => void {
  stopped = false;
  unsubscribe?.();
  unsubscribe = useUIStore.subscribe((state, previous) => {
    if (state.agentBridgeEnabled === previous.agentBridgeEnabled) return;
    if (state.agentBridgeEnabled) void ensureSecureTransport();
    else if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  });
  if (useUIStore.getState().agentBridgeEnabled) void ensureSecureTransport();
  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    unsubscribe?.();
    unsubscribe = null;
    // Do not restore window.WebSocket while the app is alive: mcpBridge can
    // reconnect after this cleanup during React development remounts.
  };
}
