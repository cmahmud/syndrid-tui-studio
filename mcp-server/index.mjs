#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const PORT = 5175;
const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT });
let activeSocket = null;
let connectedSince = null;
let lastError = null;
const pending = new Map();

wss.on('error', (err) => {
  lastError = { message: err.message, code: err.code ?? null, at: new Date().toISOString() };
  console.error(`Syndrid TUI Studio bridge error: ${err.message}`);
});
wss.on('connection', (socket) => {
  activeSocket = socket;
  connectedSince = new Date().toISOString();
  console.error(`Syndrid TUI Studio bridge: browser tab connected (${wss.clients.size} total)`);
  socket.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
    const entry = pending.get(msg.id); if (!entry) return;
    clearTimeout(entry.timer); pending.delete(msg.id);
    if (msg.ok) entry.resolve(msg.result); else entry.reject(new Error(msg.error || 'Unknown browser-side error'));
  });
  socket.on('close', () => { if (activeSocket === socket) { activeSocket = null; connectedSince = null; } });
});

function callBrowser(action, payload = {}, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (!activeSocket || activeSocket.readyState !== activeSocket.OPEN) {
      const message = 'No Syndrid TUI Studio browser tab connected — open the app and enable Agent Bridge in Settings.';
      lastError = { message, code: 'NOT_CONNECTED', at: new Date().toISOString() };
      reject(new Error(message)); return;
    }
    const id = randomUUID();
    const timer = setTimeout(() => { pending.delete(id); const message = 'Browser tab did not respond in time.'; lastError = { message, code: 'TIMEOUT', at: new Date().toISOString() }; reject(new Error(message)); }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    activeSocket.send(JSON.stringify({ id, action, payload }));
  });
}

const server = new McpServer({ name: 'syndrid-tui-studio', version: '3.0.0' });
const READ_ONLY = new Set([
  'get_bridge_status','get_tree','get_project_spec','get_viewports','get_design_tokens','export_motion_plan','export_tachyonfx_rust',
  'render_responsive_matrix','list_reusable_components','get_layout_warnings','list_templates','render_preview','list_component_types',
  'get_component_schema','list_effect_catalog','list_effects','get_effect','get_effect_dsl','validate_effect_dsl','get_effect_playback',
  'render_effect_frame','list_image_assets',
]);
const NON_DESTRUCTIVE = new Set(['set_viewport','set_preview_state','replay_animations','effect_playback','save_reusable_component','insert_reusable_component','add_component','duplicate_component','duplicate_effect','create_effect','upsert_image_asset']);
function tool(name, config, handler) {
  const readOnly = READ_ONLY.has(name);
  server.registerTool(name, {
    ...config,
    annotations: {
      readOnlyHint: readOnly,
      destructiveHint: readOnly ? false : !NON_DESTRUCTIVE.has(name),
      idempotentHint: readOnly,
      openWorldHint: false,
      ...(config.annotations ?? {}),
    },
  }, async (args) => {
    try {
      const result = await handler(args ?? {});
      const text = typeof result === 'string' ? result : JSON.stringify(result ?? null);
      return { content: [{ type: 'text', text }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  });
}
const record = () => z.record(z.string(), z.unknown()).optional();
const dryRun = () => z.boolean().optional().describe('Compute the change without committing it.');

// Health + project inspection
tool('get_bridge_status', { title: 'Get bridge status', description: 'Reports live Studio bridge health and last transport error.', inputSchema: {} }, () => ({ connected: !!activeSocket && activeSocket.readyState === activeSocket.OPEN, port: PORT, connectedSince, lastError }));
tool('get_tree', { title: 'Get component tree', description: 'Returns the complete current component tree.', inputSchema: {} }, () => callBrowser('get_tree'));
tool('get_project_spec', { title: 'Get Syndrid implementation spec', description: 'Returns the portable v3 Ratatui design spec including responsive previews, effect graphs, TachyonFX DSL/Rust projections, image assets and runtime-library intent.', inputSchema: {} }, () => callBrowser('get_project_spec', {}, 10000));
tool('get_viewports', { title: 'Get responsive viewports', description: 'Lists Wide/Medium/Narrow/Short and custom terminal breakpoints.', inputSchema: {} }, () => callBrowser('get_viewports'));
tool('get_design_tokens', { title: 'Get design tokens', description: 'Returns semantic colors, spacing, borders and motion tokens.', inputSchema: {} }, () => callBrowser('get_design_tokens'));
tool('update_design_tokens', { title: 'Update design tokens', description: 'Merges validated semantic design tokens into the project.', inputSchema: { tokens: z.record(z.string(), z.unknown()) } }, ({ tokens }) => callBrowser('update_design_tokens', { tokens }));
tool('upsert_viewport', { title: 'Commit responsive viewport', description: 'Adds or replaces a terminal breakpoint.', inputSchema: { viewport: z.object({ id: z.string(), label: z.string(), width: z.number(), height: z.number(), description: z.string().optional(), order: z.number() }) } }, ({ viewport }) => callBrowser('upsert_viewport', { viewport }));
tool('set_viewport', { title: 'Set active viewport', description: 'Switches the live designer to a committed breakpoint.', inputSchema: { id: z.string() } }, ({ id }) => callBrowser('set_viewport', { id }));
tool('render_responsive_matrix', { title: 'Render responsive matrix', description: 'Renders text previews and layout diagnostics for every breakpoint.', inputSchema: {} }, () => callBrowser('render_responsive_matrix', {}, 10000));
tool('update_responsive_override', { title: 'Update responsive override', description: 'Sets or clears a component override for one viewport.', inputSchema: { id: z.string(), viewportId: z.string(), override: z.record(z.string(), z.unknown()).nullable() } }, (args) => callBrowser('update_responsive_override', args));
tool('set_preview_state', { title: 'Set prototype preview state', description: 'Switches component-state preview.', inputSchema: { state: z.string() } }, ({ state }) => callBrowser('set_preview_state', { state }));
tool('render_preview', { title: 'Render preview', description: 'Renders the current terminal design as text or ANSI.', inputSchema: { format: z.enum(['text','ansi']).optional() } }, ({ format }) => callBrowser('render_preview', { format: format ?? 'text' }));
tool('get_layout_warnings', { title: 'Get layout warnings', description: 'Returns overflow and negative-space diagnostics.', inputSchema: {} }, () => callBrowser('get_layout_warnings'));

// TachyonFX v3
tool('list_effect_catalog', { title: 'List TachyonFX effects', description: 'Returns the Studio effect library with category, parameter schema, defaults, spatial-pattern support and composition metadata.', inputSchema: {} }, () => callBrowser('list_effect_catalog'));
tool('list_effects', { title: 'List authored effects', description: 'Lists v3 EffectDefinition graphs, optionally scoped to one component.', inputSchema: { componentId: z.string().optional() } }, (args) => callBrowser('list_effects', args));
tool('get_effect', { title: 'Get effect', description: 'Returns one structured effect plus generated normal/reduced DSL and duration.', inputSchema: { componentId: z.string(), effectId: z.string() } }, (args) => callBrowser('get_effect', args));
tool('create_effect', { title: 'Create TachyonFX effect', description: 'Adds a catalog primitive to a component as a canonical structured effect.', inputSchema: { componentId: z.string(), primitive: z.string().optional(), name: z.string().optional() } }, (args) => callBrowser('create_effect', args));
tool('update_effect', { title: 'Update effect', description: 'Merges effect metadata such as name, enabled state or structured graph.', inputSchema: { componentId: z.string(), effectId: z.string(), patch: z.record(z.string(), z.unknown()) } }, (args) => callBrowser('update_effect', args));
tool('delete_effect', { title: 'Delete effect', description: 'Deletes an authored effect from a component.', inputSchema: { componentId: z.string(), effectId: z.string() } }, (args) => callBrowser('delete_effect', args));
tool('duplicate_effect', { title: 'Duplicate effect', description: 'Duplicates an effect graph with a fresh effect id.', inputSchema: { componentId: z.string(), effectId: z.string() } }, (args) => callBrowser('duplicate_effect', args));
tool('set_effect_graph', { title: 'Set effect composition graph', description: 'Replaces the canonical primitive/sequence/parallel/delay/repeat graph.', inputSchema: { componentId: z.string(), effectId: z.string(), graph: z.record(z.string(), z.unknown()) } }, (args) => callBrowser('set_effect_graph', args));
tool('get_effect_dsl', { title: 'Get TachyonFX DSL', description: 'Generates editable TachyonFX DSL from the canonical graph.', inputSchema: { componentId: z.string(), effectId: z.string(), reducedMotion: z.boolean().optional() } }, (args) => callBrowser('get_effect_dsl', args));
tool('validate_effect_dsl', { title: 'Validate TachyonFX DSL', description: 'Runs bounded Studio-side syntax validation before applying DSL.', inputSchema: { dsl: z.string() } }, (args) => callBrowser('validate_effect_dsl', args));
tool('set_effect_dsl', { title: 'Apply TachyonFX DSL', description: 'Validates DSL and imports the supported subset into the canonical graph; unknown valid expressions are preserved as a custom DSL primitive.', inputSchema: { componentId: z.string(), effectId: z.string(), dsl: z.string() } }, (args) => callBrowser('set_effect_dsl', args));
tool('set_effect_target', { title: 'Set effect target', description: 'Targets a whole component, region, explicit rect, or filtered cells.', inputSchema: { componentId: z.string(), effectId: z.string(), target: z.record(z.string(), z.unknown()) } }, (args) => callBrowser('set_effect_target', args));
tool('set_effect_trigger', { title: 'Set effect trigger', description: 'Sets mount/show/focus/blur/select/deselect/state/key/event/manual trigger metadata.', inputSchema: { componentId: z.string(), effectId: z.string(), trigger: z.record(z.string(), z.unknown()) } }, (args) => callBrowser('set_effect_trigger', args));
tool('set_reduced_motion', { title: 'Set reduced-motion variant', description: 'Sets inherit/replace/disable accessibility behavior and optional replacement graph.', inputSchema: { componentId: z.string(), effectId: z.string(), reducedMotion: z.record(z.string(), z.unknown()) } }, (args) => callBrowser('set_reduced_motion', args));
tool('effect_playback', { title: 'Control effect playback', description: 'Play, pause, replay, reset, scrub, change speed, or switch normal/reduced preview mode.', inputSchema: { operation: z.enum(['play','pause','replay','reset','scrub','speed','mode']), elapsedMs: z.number().optional(), speed: z.number().optional(), mode: z.enum(['normal','reduced']).optional() } }, (args) => callBrowser('effect_playback', args));
tool('get_effect_playback', { title: 'Inspect effect playback', description: 'Returns current playback state, elapsed time, speed and accessibility mode.', inputSchema: {} }, () => callBrowser('get_effect_playback'));
tool('render_effect_frame', { title: 'Evaluate effect frame', description: 'Deterministically evaluates the active primitive nodes at a requested elapsed time.', inputSchema: { componentId: z.string(), effectId: z.string(), elapsedMs: z.number().optional(), reducedMotion: z.boolean().optional() } }, (args) => callBrowser('render_effect_frame', args));
tool('replay_animations', { title: 'Replay authored motion', description: 'Restarts both legacy Canvas compatibility previews and the v3 effect preview controller.', inputSchema: {} }, () => callBrowser('replay_animations'));
tool('export_motion_plan', { title: 'Export TachyonFX motion plan', description: 'Returns production-oriented Rust for all enabled v3 effects.', inputSchema: {} }, () => callBrowser('export_motion_plan'));
tool('export_tachyonfx_rust', { title: 'Export TachyonFX Rust', description: 'Returns production-oriented effect Rust plus Cargo dependency guidance.', inputSchema: {} }, () => callBrowser('export_tachyonfx_rust'));

// ratatui-image asset authoring
tool('list_image_assets', { title: 'List image assets', description: 'Lists ratatui-image-oriented assets and protocol/fallback policies stored in the project spec.', inputSchema: {} }, () => callBrowser('list_image_assets'));
tool('upsert_image_asset', { title: 'Create or update image asset', description: 'Stores an image source with fit, alignment, terminal protocol and fallback policy.', inputSchema: { asset: z.object({ id: z.string(), name: z.string(), source: z.string(), alt: z.string().optional(), fit: z.enum(['contain','cover','stretch','original']), alignment: z.enum(['start','center','end']), protocol: z.enum(['auto','kitty','sixel','iterm2','halfblocks']), fallback: z.enum(['placeholder','alt-text','hidden']) }) } }, ({ asset }) => callBrowser('upsert_image_asset', { asset }));
tool('remove_image_asset', { title: 'Remove image asset', description: 'Removes an image asset from the portable project spec.', inputSchema: { id: z.string() } }, ({ id }) => callBrowser('remove_image_asset', { id }));

// Existing component/design-system surface
tool('update_prototype', { title: 'Update prototype behavior', description: 'Merges focus/state/keybinding/legacy compatibility fields on a component.', inputSchema: { id: z.string(), prototype: z.record(z.string(), z.unknown()) } }, (args) => callBrowser('update_prototype', args));
tool('save_reusable_component', { title: 'Save reusable component', description: 'Captures a subtree into the project design-system library.', inputSchema: { componentId: z.string(), name: z.string().optional(), description: z.string().optional(), tags: z.array(z.string()).optional() } }, (args) => callBrowser('save_reusable_component', args));
tool('insert_reusable_component', { title: 'Insert reusable component', description: 'Instantiates a saved reusable component with fresh IDs.', inputSchema: { reusableId: z.string(), parentId: z.string().optional() } }, (args) => callBrowser('insert_reusable_component', args));
tool('list_reusable_components', { title: 'List reusable components', description: 'Lists project design-system components.', inputSchema: {} }, () => callBrowser('list_reusable_components'));
tool('list_templates', { title: 'List starter templates', description: 'Lists canonical starter layouts.', inputSchema: {} }, () => callBrowser('list_templates'));
tool('apply_template', { title: 'Apply starter template', description: 'Replaces the tree with a starter template; supports dryRun.', inputSchema: { id: z.string(), dryRun: dryRun() } }, (args) => callBrowser('apply_template', args));
tool('list_component_types', { title: 'List component types', description: 'Lists available component types.', inputSchema: {} }, () => callBrowser('list_component_types'));
tool('get_component_schema', { title: 'Get component schema', description: 'Returns defaults for one component type.', inputSchema: { type: z.string() } }, ({ type }) => callBrowser('get_component_schema', { type }));
tool('add_component', { title: 'Add component', description: 'Adds a component using library defaults. Supports dryRun.', inputSchema: { parentId: z.string(), type: z.string(), props: record(), layout: record(), style: record(), events: record(), index: z.number().int().min(0).optional(), dryRun: dryRun() } }, (args) => callBrowser('add_component', args));
tool('update_props', { title: 'Update component props', description: 'Merges props into a component. Supports dryRun.', inputSchema: { id: z.string(), props: z.record(z.string(), z.unknown()), dryRun: dryRun() } }, (args) => callBrowser('update_props', args));
tool('update_layout', { title: 'Update component layout', description: 'Merges layout fields. Supports dryRun.', inputSchema: { id: z.string(), layout: z.record(z.string(), z.unknown()), dryRun: dryRun() } }, (args) => callBrowser('update_layout', args));
tool('move_component', { title: 'Move component', description: 'Moves a component under a new parent. Supports dryRun.', inputSchema: { id: z.string(), newParentId: z.string(), index: z.number().int().min(0).optional(), dryRun: dryRun() } }, (args) => callBrowser('move_component', args));
tool('remove_component', { title: 'Remove component', description: 'Removes a component subtree. Supports dryRun.', inputSchema: { id: z.string(), dryRun: dryRun() } }, (args) => callBrowser('remove_component', args));
tool('duplicate_component', { title: 'Duplicate component', description: 'Duplicates a component subtree. Supports dryRun.', inputSchema: { id: z.string(), dryRun: dryRun() } }, (args) => callBrowser('duplicate_component', args));
tool('group_components', { title: 'Group components', description: 'Wraps siblings in a Box. Supports dryRun.', inputSchema: { ids: z.array(z.string()).min(1), name: z.string().optional(), props: record(), layout: record(), style: record(), dryRun: dryRun() } }, (args) => callBrowser('group_components', args));
tool('ungroup_components', { title: 'Ungroup components', description: 'Promotes children out of containers. Supports dryRun.', inputSchema: { ids: z.array(z.string()).min(1), dryRun: dryRun() } }, (args) => callBrowser('ungroup_components', args));

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`Syndrid TUI Studio MCP server ready. Bridge listening on ws://127.0.0.1:${PORT}`);
