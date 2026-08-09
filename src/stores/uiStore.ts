// Shared UI state that used to be scattered across window CustomEvents —
// toolbar dock state (producer: ComponentToolbar, consumers: Toolbar/Canvas),
// the command palette open flag, and which top-level dialog (if any) is open.

import { create } from 'zustand';

export type DialogName = 'save' | 'export' | 'about' | 'help' | 'changelog' | 'settings' | 'templates';

interface UIState {
  toolbarDocked: boolean;
  setToolbarDocked: (docked: boolean) => void;

  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  activeDialog: DialogName | null;
  openDialog: (name: DialogName) => void;
  closeDialog: () => void;

  // AI integration Phase 1 — MCP agent bridge (src/utils/mcpBridge.ts)
  agentBridgeEnabled: boolean;
  setAgentBridgeEnabled: (enabled: boolean) => void;
  agentBridgeStatus: 'disconnected' | 'connecting' | 'connected';
  setAgentBridgeStatus: (status: 'disconnected' | 'connecting' | 'connected') => void;

  // AI integration Phase 5 — conflict surfacing: last-write-wins, made visible.
  // The agent bridge has no live push feed and no locking (see todo.md's Phase
  // 5 note), so a human editing at the same time as an agent's turn can have
  // their change overwritten. This doesn't prevent that — it just makes an
  // agent-driven commit visible the moment it happens, the same way a human
  // collaborator's cursor would be in a live-collab tool.
  agentActivity: { message: string; at: number } | null;
  setAgentActivity: (message: string) => void;
  clearAgentActivity: () => void;
}

const savedDocked =
  typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('toolbar-docked') || 'false') : false;
const savedAgentBridgeEnabled =
  typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('agent-bridge-enabled') || 'false')
    : false;

export const useUIStore = create<UIState>((set) => ({
  toolbarDocked: savedDocked,
  setToolbarDocked: (docked) => {
    localStorage.setItem('toolbar-docked', JSON.stringify(docked));
    set({ toolbarDocked: docked });
  },

  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  activeDialog: null,
  openDialog: (name) => set({ activeDialog: name }),
  closeDialog: () => set({ activeDialog: null }),

  agentBridgeEnabled: savedAgentBridgeEnabled,
  setAgentBridgeEnabled: (enabled) => {
    localStorage.setItem('agent-bridge-enabled', JSON.stringify(enabled));
    set({ agentBridgeEnabled: enabled });
  },
  agentBridgeStatus: 'disconnected',
  setAgentBridgeStatus: (status) => set({ agentBridgeStatus: status }),

  agentActivity: null,
  setAgentActivity: (message) => set({ agentActivity: { message, at: Date.now() } }),
  clearAgentActivity: () => set({ agentActivity: null }),
}));
