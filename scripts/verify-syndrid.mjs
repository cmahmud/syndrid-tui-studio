import { readFileSync, existsSync } from 'node:fs';

const required = [
  'AGENTS.md', '.codex/config.toml', 'src/stores/projectStore.ts',
  'src/utils/syndridSpec.ts', 'src/utils/tachyonFxExporter.ts', 'src/utils/rendering/width.ts',
  'src/components/properties/PrototypeEditor.tsx',
  'src/components/editor/ResponsiveMatrix.tsx',
  'src/components/editor/DesignSystemPanel.tsx',
];
const missing = required.filter((file) => !existsSync(file));
if (missing.length) throw new Error(`Missing Syndrid Studio files: ${missing.join(', ')}`);

const server = readFileSync('mcp-server/index.mjs', 'utf8');
for (const tool of ['get_project_spec','render_responsive_matrix','update_responsive_override','update_prototype','set_preview_state','replay_animations','save_reusable_component','insert_reusable_component','get_design_tokens','update_design_tokens','upsert_viewport','export_motion_plan']) {
  if (!server.includes(`'${tool}'`)) throw new Error(`MCP tool not registered: ${tool}`);
}

const codexConfig = readFileSync('.codex/config.toml', 'utf8');
if (!codexConfig.includes('default_tools_approval_mode = "writes"')) {
  throw new Error('Codex MCP policy should use writes mode so read-only Studio inspection stays low-friction.');
}
if (!server.includes('READ_ONLY_TOOLS') || !server.includes('readOnlyHint') || !server.includes('openWorldHint: false')) {
  throw new Error('MCP read/write/closed-world annotations are missing.');
}
const canvas = readFileSync('src/components/editor/Canvas.tsx', 'utf8');
if (!canvas.includes('resolveTreeForPreview')) throw new Error('Canvas is not resolving responsive/state preview intent.');
if (!canvas.includes('authoredAnimation')) throw new Error('Canvas motion preview hook missing.');
const validation = readFileSync('src/utils/validation.ts', 'utf8');
if (!validation.includes('isValidPrototype') || !validation.includes('isValidResponsiveMap')) throw new Error('v2 responsive/prototype validation is missing.');
const motion = readFileSync('src/utils/tachyonFxExporter.ts', 'utf8');
if (!motion.includes('Interpolation::Spring') || !motion.includes('fx::sweep_in')) throw new Error('TachyonFX motion exporter is incomplete.');
console.log('Syndrid TUI Studio structural verification passed.');
