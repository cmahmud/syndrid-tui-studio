import { existsSync, readFileSync } from 'node:fs';

const required = [
  'AGENTS.md',
  '.codex/config.toml',
  'mcp-server/index.mjs',
  'mcp-server/bridge-auth-preload.mjs',
  'src/stores/projectStore.ts',
  'src/utils/motionResolver.ts',
  'src/utils/previewResolver.ts',
  'src/utils/syndridSpec.ts',
  'src/utils/tachyonFxExporter.ts',
  'src/utils/terminalTestSpec.ts',
  'src/utils/rendering/width.ts',
  'src/utils/rendering/canvas.ts',
  'src/components/properties/PrototypeEditor.tsx',
  'src/components/editor/ResponsiveMatrix.tsx',
  'src/components/editor/DesignSystemPanel.tsx',
  'src/components/editor/TerminalTestModal.tsx',
  'rust/syndrid-ratatui-runtime/src/preview.rs',
  'src-tauri/src/bin/syndrid-tui-preview.rs',
  'scripts/prepare-preview-sidecar-v2.mjs',
];
const missing = required.filter((file) => !existsSync(file));
if (missing.length) throw new Error(`Missing Syndrid Studio files: ${missing.join(', ')}`);

const server = readFileSync('mcp-server/index.mjs', 'utf8');
for (const tool of [
  'get_project_spec', 'render_responsive_matrix', 'update_responsive_override', 'update_prototype',
  'set_preview_state', 'replay_animations', 'save_reusable_component', 'insert_reusable_component',
  'get_design_tokens', 'update_design_tokens', 'upsert_viewport', 'export_motion_plan',
]) {
  if (!server.includes(`'${tool}'`)) throw new Error(`MCP tool not registered: ${tool}`);
}
if (!server.includes('const READ_ONLY') || !server.includes('readOnlyHint') || !server.includes('openWorldHint: false')) {
  throw new Error('MCP read/write/closed-world annotations are missing.');
}

const codexConfig = readFileSync('.codex/config.toml', 'utf8');
if (!codexConfig.includes('default_tools_approval_mode = "writes"')) {
  throw new Error('Codex MCP policy should use writes mode so read-only Studio inspection stays low-friction.');
}
if (!codexConfig.includes('bridge-auth-preload.mjs')) {
  throw new Error('Codex MCP launch must install the authenticated localhost bridge preload.');
}

const auth = readFileSync('mcp-server/bridge-auth-preload.mjs', 'utf8');
if (!auth.includes('timingSafeEqual') || !auth.includes('bridge-token') || !auth.includes('ALLOWED_ORIGINS')) {
  throw new Error('Authenticated localhost bridge protection is incomplete.');
}
const secureClient = readFileSync('src/utils/secureAgentBridge.ts', 'utf8');
if (!secureClient.includes('getNativeAgentBridgeToken') || !secureClient.includes("url.searchParams.set('token'")) {
  throw new Error('Desktop bridge client is not attaching the per-user token.');
}

const resolver = readFileSync('src/utils/motionResolver.ts', 'utf8');
const motion = readFileSync('src/utils/tachyonFxExporter.ts', 'utf8');
const fileOps = readFileSync('src/utils/fileOps.ts', 'utf8');
if (!motion.includes('collectAuthoredEffects') || !fileOps.includes('canonicalEffects') || !resolver.includes('rescuedLegacy')) {
  throw new Error('Preview/save/export are not sharing the canonical authored-motion resolver.');
}

const bridge = readFileSync('src/utils/mcpBridge.ts', 'utf8');
const spec = readFileSync('src/utils/syndridSpec.ts', 'utf8');
if (!bridge.includes('resolveAndRenderPreview') || !spec.includes('resolveAndRenderPreview')) {
  throw new Error('MCP and implementation specs must share the responsive preview resolver.');
}
if (!bridge.includes('get_terminal_test_spec') || !bridge.includes('list_test_scenarios')) {
  throw new Error('Browser bridge Terminal Test Mode actions are missing.');
}

const validation = readFileSync('src/utils/validation.ts', 'utf8');
if (!validation.includes('isValidEffectDefinition') || !validation.includes('isValidComponentEcosystem')) {
  throw new Error('v3 effect/ecosystem validation is missing.');
}

const projectStore = readFileSync('src/stores/projectStore.ts', 'utf8');
for (const field of ['ratatui:', 'ansiToTui:', 'terminalTest:', 'testScenarios:']) {
  if (!projectStore.includes(field)) throw new Error(`v3 project normalization/export missing ${field}`);
}

const tauri = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
if (!tauri.app?.security?.csp) throw new Error('Production Tauri CSP must be enabled.');
if (!tauri.bundle?.externalBin?.includes('binaries/syndrid-tui-preview')) {
  throw new Error('Native terminal preview sidecar is not bundled.');
}

const runtime = readFileSync('rust/syndrid-ratatui-runtime/src/preview.rs', 'utf8');
for (const marker of ['ratatui::try_init()', 'EffectDsl::new()', 'EffectManager', 'TestBackend']) {
  if (!runtime.includes(marker)) throw new Error(`Native terminal test runtime missing ${marker}`);
}

console.log('Syndrid TUI Studio structural verification passed.');
