#!/usr/bin/env node
// Standalone MCP server for Syndrid TUI Studio (AI integration Phase 1 — see todo.md).
//
// Spawned over stdio by an MCP client (Codex, Claude Code, etc.).
// Bridges tool calls to the live Syndrid TUI Studio browser tab over a local WebSocket:
// the tab must have Settings > Agent Bridge enabled. Only one connected tab
// is supported — the most recently connected one wins (see README.md).
//
// IMPORTANT: stdout is the MCP JSON-RPC channel. Never console.log — use
// console.error for anything diagnostic, it goes to stderr instead.

import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const PORT = 5175;

const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT });
let activeSocket = null;
let connectedSince = null;
let lastError = null; // { message, code, at } — last WS-level error, for get_bridge_status
const pending = new Map(); // id -> { resolve, reject, timer }

// A second instance (another MCP client reconnect, a stray health check, a
// manually-started copy per the README) colliding on this port must not take
// the whole MCP stdio connection down with it — an unhandled 'error' event
// on an EventEmitter is fatal by default. Degrade instead: the MCP tools
// still register and respond, they just report "no browser tab connected"
// until the port frees up, since this instance can never receive one.
wss.on('error', (err) => {
  lastError = { message: err.message, code: err.code ?? null, at: new Date().toISOString() };
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Syndrid TUI Studio bridge: port ${PORT} is already in use (likely another mcp-server ` +
        'instance already running) — this MCP connection stays up, but its own ' +
        'bridge can\'t bind, so tool calls will report "no browser tab connected."'
    );
  } else {
    console.error(`Syndrid TUI Studio bridge: WebSocket server error: ${err.message}`);
  }
});

wss.on('connection', (socket) => {
  activeSocket = socket;
  connectedSince = new Date().toISOString();
  console.error(`Syndrid TUI Studio bridge: browser tab connected (${wss.clients.size} total)`);

  socket.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const entry = pending.get(msg.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(msg.id);
    if (msg.ok) entry.resolve(msg.result);
    else entry.reject(new Error(msg.error || 'Unknown browser-side error'));
  });

  socket.on('close', () => {
    if (activeSocket === socket) {
      activeSocket = null;
      connectedSince = null;
    }
    console.error('Syndrid TUI Studio bridge: browser tab disconnected');
  });
});

/** Sends { id, action, payload } to the connected tab and awaits its reply. */
function callBrowser(action, payload, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (!activeSocket || activeSocket.readyState !== activeSocket.OPEN) {
      const message =
        'No Syndrid TUI Studio browser tab connected — open the app and enable Agent Bridge in Settings.';
      lastError = { message, code: 'NOT_CONNECTED', at: new Date().toISOString() };
      reject(new Error(message));
      return;
    }
    const id = randomUUID();
    const timer = setTimeout(() => {
      pending.delete(id);
      const message = 'Browser tab did not respond in time.';
      lastError = { message, code: 'TIMEOUT', at: new Date().toISOString() };
      reject(new Error(message));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    activeSocket.send(JSON.stringify({ id, action, payload }));
  });
}

const server = new McpServer({ name: 'syndrid-tui-studio', version: '2.0.0' });

// Correct MCP annotations matter to Codex's `writes` approval mode: read-only
// inspection stays frictionless while design-changing operations remain visible
// to the user. This server is deliberately closed-world; every tool only talks
// to the local Studio tab over 127.0.0.1.
const READ_ONLY_TOOLS = new Set([
  'get_bridge_status',
  'get_tree',
  'get_project_spec',
  'get_viewports',
  'get_design_tokens',
  'export_motion_plan',
  'render_responsive_matrix',
  'list_reusable_components',
  'get_layout_warnings',
  'list_templates',
  'render_preview',
  'list_component_types',
  'get_component_schema',
]);

const NON_DESTRUCTIVE_WRITE_TOOLS = new Set([
  'set_viewport',
  'set_preview_state',
  'replay_animations',
  'save_reusable_component',
  'insert_reusable_component',
  'add_component',
  'duplicate_component',
]);

/** Wraps a handler so every tool call returns a well-formed result, error or not. */
function tool(name, config, handler) {
  const readOnly = READ_ONLY_TOOLS.has(name);
  const annotations = {
    readOnlyHint: readOnly,
    destructiveHint: readOnly ? false : !NON_DESTRUCTIVE_WRITE_TOOLS.has(name),
    idempotentHint: readOnly,
    openWorldHint: false,
    ...(config.annotations ?? {}),
  };

  server.registerTool(name, { ...config, annotations }, async (args) => {
    try {
      const result = await handler(args ?? {});
      // render_preview returns a raw string meant to be read as-is; everything
      // else is structured data that needs stringifying.
      const text = typeof result === 'string' ? result : JSON.stringify(result ?? null);
      return { content: [{ type: 'text', text }] };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  });
}

const record = () => z.record(z.string(), z.unknown()).optional();
const dryRun = () =>
  z
    .boolean()
    .optional()
    .describe(
      'If true, computes the change but does not commit it — returns a unified diff of the would-be tree instead.'
    );

tool(
  'get_bridge_status',
  {
    title: 'Get bridge status',
    description:
      'Reports the agent bridge\'s own connection health — whether a browser tab is connected, since when, and the last transport-level error (port conflicts, timeouts, disconnects). Answers "why did my last call fail?" without guessing. Handled locally — never fails due to no browser being connected.',
    inputSchema: {},
  },
  () => ({
    connected: !!activeSocket && activeSocket.readyState === activeSocket.OPEN,
    port: PORT,
    connectedSince,
    lastError,
  })
);

tool(
  'get_tree',
  { title: 'Get component tree', description: 'Returns the current full Syndrid TUI Studio component tree as JSON.', inputSchema: {} },
  () => callBrowser('get_tree', {})
);

tool(
  'get_project_spec',
  {
    title: 'Get Syndrid implementation spec',
    description: 'Returns the portable Ratatui-first design specification: tree, responsive previews, design tokens, component states, key bindings and TachyonFX-oriented motion intent. Prefer this when implementing the design in Syndrid.',
    inputSchema: {},
  },
  () => callBrowser('get_project_spec', {}, 10000)
);

tool(
  'get_viewports',
  { title: 'Get responsive viewports', description: 'Lists Wide/Medium/Narrow/Short and any custom terminal breakpoints, including the active preview.', inputSchema: {} },
  () => callBrowser('get_viewports', {})
);

tool(
  'get_design_tokens',
  { title: 'Get Syndrid design tokens', description: 'Returns semantic colors, spacing, borders and motion timing tokens for the current project.', inputSchema: {} },
  () => callBrowser('get_design_tokens', {})
);

tool(
  'update_design_tokens',
  { title: 'Update Syndrid design tokens', description: 'Merges semantic design-token values into the current project so visual and agent-authored screens stay consistent.', inputSchema: { tokens: z.record(z.string(), z.unknown()) } },
  ({ tokens }) => callBrowser('update_design_tokens', { tokens })
);

tool(
  'upsert_viewport',
  {
    title: 'Commit responsive viewport',
    description: 'Adds or replaces a named terminal breakpoint used by the responsive matrix.',
    inputSchema: { viewport: z.object({ id: z.string(), label: z.string(), width: z.number(), height: z.number(), description: z.string().optional(), order: z.number() }) },
  },
  ({ viewport }) => callBrowser('upsert_viewport', { viewport })
);

tool(
  'export_motion_plan',
  { title: 'Export TachyonFX motion plan', description: 'Returns the current authored motion as conservative TachyonFX 0.25.x-oriented Rust expressions plus trigger/delay/reduced-motion metadata.', inputSchema: {} },
  () => callBrowser('export_motion_plan', {})
);

tool(
  'set_viewport',
  { title: 'Set active viewport', description: 'Switches the designer to a committed terminal breakpoint.', inputSchema: { id: z.string() } },
  ({ id }) => callBrowser('set_viewport', { id })
);

tool(
  'render_responsive_matrix',
  { title: 'Render responsive matrix', description: 'Renders plain-text previews plus layout-warning diagnostics for every committed terminal viewport. Use after layout edits to catch overflow or breakpoint regressions.', inputSchema: {} },
  () => callBrowser('render_responsive_matrix', {}, 10000)
);

tool(
  'update_responsive_override',
  {
    title: 'Update responsive override',
    description: 'Sets or clears a component override for one terminal viewport without mutating its base design.',
    inputSchema: { id: z.string(), viewportId: z.string(), override: z.record(z.string(), z.unknown()).nullable() },
  },
  (args) => callBrowser('update_responsive_override', args)
);

tool(
  'update_prototype',
  {
    title: 'Update prototype behavior',
    description: 'Merges focus, states, key bindings, or animation specifications onto a component. Motion is TachyonFX-oriented and previewed in the editor.',
    inputSchema: { id: z.string(), prototype: z.record(z.string(), z.unknown()) },
  },
  (args) => callBrowser('update_prototype', args)
);

tool(
  'set_preview_state',
  { title: 'Set prototype preview state', description: 'Switches the design preview to a named component state such as default, focused, selected, loading, success, warning, or error.', inputSchema: { state: z.string() } },
  ({ state }) => callBrowser('set_preview_state', { state })
);

tool(
  'replay_animations',
  { title: 'Replay authored motion', description: 'Restarts design-time animation previews in the connected Studio tab.', inputSchema: {} },
  () => callBrowser('replay_animations', {})
);

tool(
  'save_reusable_component',
  {
    title: 'Save reusable Syndrid component',
    description: 'Captures an existing component subtree into the project design-system library so humans and Codex can reuse the same canonical component.',
    inputSchema: { componentId: z.string(), name: z.string().optional(), description: z.string().optional(), tags: z.array(z.string()).optional() },
  },
  (args) => callBrowser('save_reusable_component', args)
);

tool(
  'insert_reusable_component',
  {
    title: 'Insert reusable Syndrid component',
    description: 'Instantiates a saved reusable component with fresh IDs under a Screen, Box, Grid, or Modal parent.',
    inputSchema: { reusableId: z.string(), parentId: z.string().optional() },
  },
  (args) => callBrowser('insert_reusable_component', args)
);

tool(
  'list_reusable_components',
  { title: 'List reusable Syndrid components', description: 'Lists saved design-system components available in the current project.', inputSchema: {} },
  () => callBrowser('list_reusable_components', {})
);

tool(
  'get_layout_warnings',
  {
    title: 'Get layout warnings',
    description:
      'Returns every component with a layout warning (overflow past its parent, negative computed space) — the same detection that powers the app\'s own "N Layout Warnings" banner. Check this after a mutation instead of only visually parsing render_preview.',
    inputSchema: {},
  },
  () => callBrowser('get_layout_warnings', {})
);

tool(
  'list_templates',
  {
    title: 'List starter templates',
    description: 'Lists the 7 canonical starter layouts already built into the app\'s "New from Template" gallery.',
    inputSchema: {},
  },
  () => callBrowser('list_templates', {})
);

tool(
  'apply_template',
  {
    title: 'Apply starter template',
    description:
      'Replaces the current tree with a starter template (see list_templates). Supports dryRun.',
    inputSchema: { id: z.string(), dryRun: dryRun() },
  },
  (args) => callBrowser('apply_template', args)
);

tool(
  'render_preview',
  {
    title: 'Render preview',
    description:
      'Renders the current design to text — the same output the app\'s own Export panel Preview/Text tab produces. Call this after making changes to see the actual result and self-correct, instead of relying on get_tree alone.',
    inputSchema: { format: z.enum(['text', 'ansi']).optional() },
  },
  ({ format }) => callBrowser('render_preview', { format: format ?? 'text' })
);

tool(
  'list_component_types',
  {
    title: 'List component types',
    description: 'Lists every available component type with its name, description, and category.',
    inputSchema: {},
  },
  () => callBrowser('list_component_types', {})
);

tool(
  'get_component_schema',
  {
    title: 'Get component schema',
    description: 'Returns the default props/layout/style/events for one component type.',
    inputSchema: { type: z.string() },
  },
  ({ type }) => callBrowser('get_component_schema', { type })
);

tool(
  'add_component',
  {
    title: 'Add component',
    description: 'Adds a new component as a child of an existing node, using its library defaults merged with any overrides. Supports dryRun.',
    inputSchema: {
      parentId: z.string(),
      type: z.string(),
      props: record(),
      layout: record(),
      style: record(),
      events: record(),
      index: z.number().int().min(0).optional(),
      dryRun: dryRun(),
    },
  },
  (args) => callBrowser('add_component', args)
);

tool(
  'update_props',
  {
    title: 'Update component props',
    description: 'Merges the given props into an existing component. Supports dryRun.',
    inputSchema: { id: z.string(), props: z.record(z.string(), z.unknown()), dryRun: dryRun() },
  },
  (args) => callBrowser('update_props', args)
);

tool(
  'update_layout',
  {
    title: 'Update component layout',
    description: 'Merges the given layout fields into an existing component. Supports dryRun.',
    inputSchema: { id: z.string(), layout: z.record(z.string(), z.unknown()), dryRun: dryRun() },
  },
  (args) => callBrowser('update_layout', args)
);

tool(
  'move_component',
  {
    title: 'Move component',
    description: 'Moves an existing component to a new parent, optionally at a specific index. Supports dryRun.',
    inputSchema: {
      id: z.string(),
      newParentId: z.string(),
      index: z.number().int().min(0).optional(),
      dryRun: dryRun(),
    },
  },
  (args) => callBrowser('move_component', args)
);

tool(
  'remove_component',
  {
    title: 'Remove component',
    description: 'Removes a component (and its children) from the tree. Supports dryRun.',
    inputSchema: { id: z.string(), dryRun: dryRun() },
  },
  ({ id, dryRun: isDryRun }) => callBrowser('remove_component', { id, dryRun: isDryRun })
);

tool(
  'duplicate_component',
  {
    title: 'Duplicate component',
    description: 'Duplicates a component (and its children) as a new sibling right after the original. Supports dryRun.',
    inputSchema: { id: z.string(), dryRun: dryRun() },
  },
  (args) => callBrowser('duplicate_component', args)
);

tool(
  'group_components',
  {
    title: 'Group components',
    description:
      'Wraps existing components (which must share the same parent) in a new Box, in their current document order. Supports dryRun.',
    inputSchema: {
      ids: z.array(z.string()).min(1),
      name: z.string().optional(),
      props: record(),
      layout: record(),
      style: record(),
      dryRun: dryRun(),
    },
  },
  (args) => callBrowser('group_components', args)
);

tool(
  'ungroup_components',
  {
    title: 'Ungroup components',
    description: 'Removes the given container(s), promoting their children to the container\'s own parent in place. Supports dryRun.',
    inputSchema: { ids: z.array(z.string()).min(1), dryRun: dryRun() },
  },
  (args) => callBrowser('ungroup_components', args)
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`Syndrid TUI Studio MCP server ready. Bridge listening on ws://127.0.0.1:${PORT}`);
