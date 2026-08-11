import type {
  ComponentNode,
  SyndridProjectData,
  TerminalTestPreset,
  TerminalTestScenario,
  TerminalTestSettings,
  ViewportPreset,
} from '../types';
import { cloneNode } from './treeUtils';
import { collectAuthoredEffects } from './motionResolver';
import { effectToTachyonFxDsl } from './tachyonFxDsl';
import { layoutEngine } from './layout';
import { resolveAndRenderPreview } from './previewResolver';

export interface TerminalTestRect { x: number; y: number; width: number; height: number; }

export interface TerminalTestNode {
  id: string;
  name: string;
  type: string;
  rect: TerminalTestRect;
  props: Record<string, unknown>;
  style: Record<string, unknown>;
  events: Record<string, string | undefined>;
  focusable: boolean;
  focusOrder: number;
  keyBindings: Array<{ key: string; action: string; description?: string }>;
}

export interface TerminalTestMotion {
  componentId: string;
  componentName: string;
  effectId: string;
  effectName: string;
  trigger: unknown;
  target: unknown;
  area: TerminalTestRect;
  dsl: string;
  reducedMotionDsl: string;
}

export interface TerminalTestSpec {
  schema: 'syndrid-terminal-test/v1';
  generatedAt: string;
  viewport: Pick<ViewportPreset, 'id' | 'label' | 'width' | 'height'>;
  stateName: string;
  scenario: TerminalTestScenario;
  settings: TerminalTestSettings;
  nodes: TerminalTestNode[];
  motion: TerminalTestMotion[];
  warnings: ReturnType<typeof resolveAndRenderPreview>['warnings'];
  fallbackText: string;
}

export const BUILTIN_TERMINAL_TEST_SCENARIOS: TerminalTestScenario[] = [
  { id: 'default', name: 'Default', preset: 'default', seed: 42, durationMs: 4_000, variables: {}, timeline: [] },
  { id: 'empty', name: 'Empty', preset: 'empty', seed: 42, durationMs: 2_000, variables: {}, timeline: [] },
  { id: 'loading', name: 'Loading', preset: 'loading', seed: 42, durationMs: 4_000, variables: {}, timeline: [] },
  { id: 'loaded', name: 'Loaded', preset: 'loaded', seed: 42, durationMs: 1_500, variables: {}, timeline: [] },
  { id: 'error', name: 'Error', preset: 'error', seed: 42, durationMs: 3_000, variables: {}, timeline: [] },
  { id: 'offline', name: 'Offline', preset: 'offline', seed: 42, durationMs: 3_000, variables: {}, timeline: [] },
  { id: 'slow-network', name: 'Slow Network', preset: 'slow-network', seed: 42, durationMs: 12_000, variables: {}, timeline: [] },
  { id: 'large-data', name: 'Large Dataset', preset: 'large-data', seed: 42, durationMs: 4_000, variables: {}, timeline: [] },
  { id: 'unicode', name: 'Unicode / Emoji', preset: 'unicode', seed: 42, durationMs: 4_000, variables: {}, timeline: [] },
];

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function generatedRows(count: number, seed: number): string[][] {
  const random = mulberry32(seed);
  const statuses = ['Ready', 'Pending', 'Running', 'Degraded', 'Complete'];
  return Array.from({ length: count }, (_, index) => [
    `row-${String(index + 1).padStart(2, '0')}`,
    statuses[Math.floor(random() * statuses.length)],
    `${Math.floor(random() * 999)}ms`,
  ]);
}

function generatedItems(count: number): Array<{ label: string; icon: string; hotkey: string }> {
  return Array.from({ length: count }, (_, index) => ({
    label: `Mock item ${index + 1}`,
    icon: index % 3 === 0 ? '●' : '•',
    hotkey: index < 9 ? String(index + 1) : '',
  }));
}

function stateForPreset(preset: TerminalTestPreset): string {
  if (preset === 'loading' || preset === 'slow-network') return 'loading';
  if (preset === 'loaded') return 'success';
  if (preset === 'error') return 'error';
  if (preset === 'offline') return 'warning';
  return 'default';
}

function applyMockPreset(root: ComponentNode, scenario: TerminalTestScenario): void {
  const preset = scenario.preset;
  const visit = (node: ComponentNode) => {
    if (preset === 'empty') {
      if (node.type === 'Table') node.props.rows = [];
      if (node.type === 'List' || node.type === 'Menu' || node.type === 'Tree') node.props.items = [];
      if (node.type === 'Log') node.props.lines = [];
      if (node.type === 'Sparkline') node.props.data = [];
      if (node.type === 'TextInput' || node.type === 'TextArea') node.props.value = '';
      if (node.type === 'ProgressBar' || node.type === 'Gauge') node.props.value = 0;
    }
    if (preset === 'loading' || preset === 'slow-network') {
      if (node.type === 'ProgressBar' || node.type === 'Gauge') node.props.value = 0;
      if (node.type === 'Toast') { node.props.message = 'Loading mock data…'; node.props.variant = 'info'; }
      if (node.type === 'Log') node.props.lines = ['Starting test scenario…', 'Loading mock data…'];
    }
    if (preset === 'loaded') {
      if (node.type === 'ProgressBar' || node.type === 'Gauge') node.props.value = Number(node.props.max ?? 100);
      if (node.type === 'Toast') { node.props.message = 'Ready'; node.props.variant = 'success'; }
      if (node.type === 'Log') node.props.lines = ['Startup complete', 'All mock services ready'];
    }
    if (preset === 'error') {
      if (node.type === 'ProgressBar' || node.type === 'Gauge') node.props.value = Math.round(Number(node.props.max ?? 100) * 0.62);
      if (node.type === 'Toast') { node.props.message = 'Mock service failed'; node.props.variant = 'error'; }
      if (node.type === 'Log') node.props.lines = ['Starting test scenario…', 'ERROR mock provider unavailable'];
    }
    if (preset === 'offline') {
      if (node.type === 'Toast') { node.props.message = 'Offline test mode'; node.props.variant = 'warning'; }
      if (node.type === 'Log') node.props.lines = ['Network unavailable', 'Using cached/mock data'];
    }
    if (preset === 'large-data') {
      if (node.type === 'Table') {
        node.props.columns = ['ID', 'Status', 'Latency'];
        node.props.rows = generatedRows(60, scenario.seed);
      }
      if (node.type === 'List' || node.type === 'Menu') node.props.items = generatedItems(40);
      if (node.type === 'Log') node.props.lines = Array.from({ length: 80 }, (_, index) => `[mock] event ${index + 1}`);
      if (node.type === 'Sparkline') {
        const random = mulberry32(scenario.seed);
        node.props.data = Array.from({ length: 100 }, () => Math.round(random() * 100));
      }
    }
    if (preset === 'unicode') {
      if (node.type === 'Text') node.props.content = `${String(node.props.content ?? 'Text')} · 界 🚀 é`;
      if (node.type === 'List' || node.type === 'Menu') {
        node.props.items = [
          { label: '東京 / Tokyo', icon: '界', hotkey: '1' },
          { label: 'Comet 🚀', icon: '✦', hotkey: '2' },
          { label: 'Combining é', icon: '•', hotkey: '3' },
        ];
      }
      if (node.type === 'Log') node.props.lines = ['✓ ready', '界 wide glyph', '🚀 emoji sequence', 'é combining mark'];
    }
    node.children.forEach(visit);
  };
  visit(root);
}

function applyScenarioVariables(root: ComponentNode, scenario: TerminalTestScenario): void {
  const byId = scenario.variables.components;
  if (!byId || typeof byId !== 'object' || Array.isArray(byId)) return;
  const overrides = byId as Record<string, unknown>;
  const visit = (node: ComponentNode) => {
    const override = overrides[node.id];
    if (override && typeof override === 'object' && !Array.isArray(override)) {
      const record = override as Record<string, unknown>;
      const props = record.props;
      if (props && typeof props === 'object' && !Array.isArray(props)) node.props = { ...node.props, ...(props as Record<string, unknown>) };
      const hidden = record.hidden;
      if (typeof hidden === 'boolean') node.hidden = hidden;
    }
    node.children.forEach(visit);
  };
  visit(root);
}

function selectScenario(project: SyndridProjectData, scenarioId: string): TerminalTestScenario {
  if (scenarioId.startsWith('custom:')) {
    const id = scenarioId.slice('custom:'.length);
    const custom = project.testScenarios.find((scenario) => scenario.id === id);
    if (custom) return structuredClone(custom);
  }
  return structuredClone(BUILTIN_TERMINAL_TEST_SCENARIOS.find((scenario) => scenario.id === scenarioId) ?? BUILTIN_TERMINAL_TEST_SCENARIOS[0]);
}

function targetArea(target: any, componentId: string): TerminalTestRect {
  if (target?.kind === 'rect') {
    return {
      x: Math.max(0, Math.round(Number(target.x) || 0)),
      y: Math.max(0, Math.round(Number(target.y) || 0)),
      width: Math.max(0, Math.round(Number(target.width) || 0)),
      height: Math.max(0, Math.round(Number(target.height) || 0)),
    };
  }
  const id = typeof target?.componentId === 'string' ? target.componentId : componentId;
  const layout = layoutEngine.getLayout(id);
  return layout
    ? { x: Math.round(layout.x), y: Math.round(layout.y), width: Math.max(0, Math.round(layout.width)), height: Math.max(0, Math.round(layout.height)) }
    : { x: 0, y: 0, width: 0, height: 0 };
}

export function buildTerminalTestSpec(
  root: ComponentNode | null,
  project: SyndridProjectData,
  overrides: Partial<TerminalTestSettings> = {}
): TerminalTestSpec {
  const settings: TerminalTestSettings = { ...project.terminalTest, ...overrides };
  const viewport = project.viewports.find((item) => item.id === settings.viewportId)
    ?? project.viewports.find((item) => item.id === project.activeViewportId)
    ?? project.viewports[0];
  const scenario = selectScenario(project, settings.scenarioId);
  const mockRoot = root ? cloneNode(root) : null;
  if (mockRoot && settings.fakeData) {
    applyMockPreset(mockRoot, scenario);
    applyScenarioVariables(mockRoot, scenario);
  }
  const stateName = stateForPreset(scenario.preset);
  const preview = resolveAndRenderPreview(mockRoot, {
    viewportId: viewport.id,
    stateName,
    width: viewport.width,
    height: viewport.height,
    format: 'text',
  });
  const nodes: TerminalTestNode[] = [];
  const visit = (node: ComponentNode) => {
    const layout = layoutEngine.getLayout(node.id);
    if (layout && !node.hidden) {
      nodes.push({
        id: node.id,
        name: node.name,
        type: node.type,
        rect: {
          x: Math.max(0, Math.round(layout.x)),
          y: Math.max(0, Math.round(layout.y)),
          width: Math.max(0, Math.round(layout.width)),
          height: Math.max(0, Math.round(layout.height)),
        },
        props: structuredClone(node.props),
        style: structuredClone(node.style),
        events: structuredClone(node.events),
        focusable: node.prototype?.focusable ?? ['TextInput', 'TextArea', 'Button', 'Checkbox', 'Radio', 'Select', 'Toggle', 'List', 'Table', 'Tree', 'Menu', 'Tabs'].includes(node.type),
        focusOrder: Number.isFinite(Number(node.prototype?.focusOrder)) ? Number(node.prototype?.focusOrder) : nodes.length,
        keyBindings: structuredClone(node.prototype?.keyBindings ?? []),
      });
    }
    node.children.forEach(visit);
  };
  if (preview.tree) visit(preview.tree);

  const motion = collectAuthoredEffects(preview.tree, { enabledOnly: true }).records.map((record) => ({
    componentId: record.componentId,
    componentName: record.componentName,
    effectId: record.effect.id,
    effectName: record.effect.name,
    trigger: structuredClone(record.effect.trigger),
    target: structuredClone(record.effect.target),
    area: targetArea(record.effect.target, record.componentId),
    dsl: effectToTachyonFxDsl(record.effect),
    reducedMotionDsl: effectToTachyonFxDsl(record.effect, true),
  }));

  return {
    schema: 'syndrid-terminal-test/v1',
    generatedAt: new Date().toISOString(),
    viewport: { id: viewport.id, label: viewport.label, width: viewport.width, height: viewport.height },
    stateName,
    scenario,
    settings,
    nodes,
    motion,
    warnings: preview.warnings,
    fallbackText: preview.text,
  };
}
