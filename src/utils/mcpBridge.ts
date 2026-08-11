// Browser side of the Syndrid Studio MCP bridge. Every mutation routes through
// the same Zustand stores used by the human editor so undo/validation semantics stay shared.

import { createPatch } from 'diff';
import { useComponentStore } from '../stores/componentStore';
import { useUIStore } from '../stores/uiStore';
import { useCanvasStore } from '../stores/canvasStore';
import { useEffectPreviewStore } from '../stores/effectPreviewStore';
import { normalizeProjectData, useProjectStore } from '../stores/projectStore';
import { COMPONENT_LIBRARY } from '../constants/components';
import { TEMPLATES } from '../constants/templates';
import { TACHYON_FX_CATALOG, getTachyonFxCatalogEntry } from '../data/tachyonFxCatalog';
import { isValidComponentTree } from './validation';
import { buildSyndridImplementationSpec } from './syndridSpec';
import { exportTachyonFxCargoSnippet, exportTachyonFxMotionPlan } from './tachyonFxExporter';
import { effectToTachyonFxDsl, tachyonFxDslToGraph, validateTachyonFxDsl } from './tachyonFxDsl';
import { effectGraphDuration, evaluateEffect } from './effectRuntime';
import { generateComponentId } from './idGenerator';
import { collectAuthoredEffects, findAuthoredEffect, resolveAuthoredEffects } from './motionResolver';
import { resolveAndRenderPreview } from './previewResolver';
import { BUILTIN_TERMINAL_TEST_SCENARIOS, buildTerminalTestSpec } from './terminalTestSpec';
import {
  applyAddComponent,
  applyUpdateProps,
  applyUpdateLayout,
  applyMoveComponent,
  applyRemoveComponent,
  applyDuplicateComponent,
  applyGroupComponents,
  applyUngroupComponents,
  cloneNode,
} from './treeUtils';
import { effectToLegacyAnimation, makeEffectId, makePrimitiveEffect } from '../types';
import type {
  ComponentNode,
  ComponentPrototypeSpec,
  ComponentType,
  DesignTokens,
  EffectDefinition,
  EffectGraphNode,
  EffectTarget,
  EffectTrigger,
  ImageAssetDefinition,
  ResponsiveOverride,
  TerminalTestScenario,
  TerminalTestSettings,
  ViewportPreset,
} from '../types';

const BRIDGE_URL = 'ws://127.0.0.1:5175';
interface BridgeRequest { id: string; action: string; payload: Record<string, unknown>; }
let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function isComponentType(type: string): type is ComponentType { return type in COMPONENT_LIBRARY; }
function diffTrees(oldRoot: ComponentNode | null, newRoot: ComponentNode | null): string {
  const oldJson = JSON.stringify(oldRoot, null, 2) + '\n';
  const newJson = JSON.stringify(newRoot, null, 2) + '\n';
  return oldJson === newJson ? '(no changes)' : createPatch('component-tree.json', oldJson, newJson);
}
function notifyAgentActivity(message: string): void { useUIStore.getState().setAgentActivity(message); }
function assertTreeStillValid(): void {
  const { root, undo } = useComponentStore.getState();
  if (root && !isValidComponentTree(root)) {
    undo();
    throw new Error('Mutation produced an invalid component tree — rolled back.');
  }
}
function currentEffects(component: ComponentNode): EffectDefinition[] {
  return resolveAuthoredEffects(component).map(({ effect }) => structuredClone(effect));
}
function findEffect(componentId: string, effectId: string): { component: ComponentNode; effect: EffectDefinition } {
  const component = useComponentStore.getState().getComponent(componentId);
  if (!component) throw new Error(`No component with id: ${componentId}`);
  const resolved = findAuthoredEffect(component, effectId);
  if (!resolved) throw new Error(`No effect ${effectId} on component ${componentId}`);
  return { component, effect: resolved.effect };
}
function commitEffects(component: ComponentNode, effects: EffectDefinition[]): void {
  useComponentStore.getState().updateComponent(component.id, {
    prototype: {
      ...(component.prototype ?? {}),
      effects,
      animations: effects.map(effectToLegacyAnimation),
    },
  });
  useProjectStore.getState().replayAnimations();
  assertTreeStillValid();
}
function activePreview(format: 'text' | 'ansi' = 'text') {
  const project = useProjectStore.getState();
  const canvas = useCanvasStore.getState();
  return resolveAndRenderPreview(useComponentStore.getState().root, {
    viewportId: project.activeViewportId,
    stateName: project.previewState,
    width: canvas.width,
    height: canvas.height,
    format,
  });
}

function handleRequest({ action, payload }: BridgeRequest): unknown {
  const store = useComponentStore.getState();
  switch (action) {
    case 'get_tree': return store.root;
    case 'get_project_spec': {
      const project = useProjectStore.getState();
      return buildSyndridImplementationSpec(store.root, project.exportProjectData());
    }
    case 'get_viewports': {
      const project = useProjectStore.getState();
      return { activeViewportId: project.activeViewportId, previewState: project.previewState, viewports: project.viewports };
    }
    case 'get_design_tokens': return useProjectStore.getState().designTokens;
    case 'update_design_tokens': {
      const patch = payload.tokens as Partial<DesignTokens> | undefined;
      if (!patch || typeof patch !== 'object') throw new Error('tokens is required');
      const project = useProjectStore.getState();
      const current = project.designTokens;
      const merged: DesignTokens = {
        ...current,
        ...patch,
        colors: { ...current.colors, ...(patch.colors ?? {}) },
        spacing: { ...current.spacing, ...(patch.spacing ?? {}) },
        borders: { ...current.borders, ...(patch.borders ?? {}) },
        motion: { ...current.motion, ...(patch.motion ?? {}) },
      };
      const normalized = normalizeProjectData({ ...project.exportProjectData(), designTokens: merged }).designTokens;
      project.updateTokens(normalized);
      notifyAgentActivity('Agent updated Syndrid design tokens');
      return normalized;
    }
    case 'upsert_viewport': {
      const viewport = payload.viewport as ViewportPreset | undefined;
      if (!viewport?.id || !viewport.label) throw new Error('viewport.id and viewport.label are required');
      const project = useProjectStore.getState();
      project.upsertViewport(viewport);
      const committed = useProjectStore.getState().viewports.find((item) => item.id === viewport.id.trim());
      if (!committed) throw new Error('viewport dimensions must be finite');
      notifyAgentActivity(`Agent committed viewport ${committed.label}`);
      return committed;
    }
    case 'export_motion_plan': return exportTachyonFxMotionPlan(store.root);
    case 'export_tachyonfx_rust': {
      const project = useProjectStore.getState();
      return {
        rust: exportTachyonFxMotionPlan(store.root),
        cargo: exportTachyonFxCargoSnippet(project.runtimeLibraries),
      };
    }
    case 'set_viewport': {
      const id = String(payload.id ?? '');
      const project = useProjectStore.getState();
      const viewport = project.viewports.find((item) => item.id === id);
      if (!viewport) throw new Error(`Unknown viewport: ${id}`);
      project.setActiveViewport(id);
      const canvas = useCanvasStore.getState();
      canvas.setSizeMode('custom');
      canvas.setCanvasSize(viewport.width, viewport.height);
      return viewport;
    }
    case 'render_responsive_matrix': {
      const project = useProjectStore.getState();
      return project.viewports.map((viewport) => {
        const preview = resolveAndRenderPreview(store.root, {
          viewportId: viewport.id,
          stateName: project.previewState,
          width: viewport.width,
          height: viewport.height,
          format: 'text',
        });
        return {
          id: viewport.id,
          label: viewport.label,
          width: viewport.width,
          height: viewport.height,
          state: project.previewState,
          warningCount: preview.warningCount,
          warnings: preview.warnings,
          text: preview.text,
        };
      });
    }
    case 'update_responsive_override': {
      const { id, viewportId, override } = payload as { id: string; viewportId: string; override: ResponsiveOverride | null };
      const target = store.getComponent(id);
      if (!target) throw new Error(`No component with id: ${id}`);
      const next = { ...(target.responsive ?? {}) };
      if (override === null) delete next[viewportId]; else next[viewportId] = override;
      store.updateComponent(id, { responsive: next });
      assertTreeStillValid();
      return { ok: true };
    }
    case 'update_prototype': {
      const { id, prototype } = payload as { id: string; prototype: Partial<ComponentPrototypeSpec> };
      const target = store.getComponent(id);
      if (!target) throw new Error(`No component with id: ${id}`);
      store.updateComponent(id, { prototype: { ...(target.prototype ?? {}), ...prototype } });
      assertTreeStillValid();
      return { ok: true };
    }
    case 'set_preview_state':
      useProjectStore.getState().setPreviewState(String(payload.state || 'default'));
      return { state: payload.state || 'default' };
    case 'replay_animations':
      useProjectStore.getState().replayAnimations();
      useEffectPreviewStore.getState().replay();
      return { ok: true };

    // --- TachyonFX v3 authoring -------------------------------------------------
    case 'list_effect_catalog': return TACHYON_FX_CATALOG;
    case 'list_effects': {
      const componentId = typeof payload.componentId === 'string' ? payload.componentId : undefined;
      return collectAuthoredEffects(store.root).records.filter((record) => !componentId || record.componentId === componentId);
    }
    case 'get_effect': {
      const { componentId, effectId } = payload as { componentId: string; effectId: string };
      const found = findEffect(componentId, effectId);
      return {
        ...found,
        dsl: effectToTachyonFxDsl(found.effect),
        reducedMotionDsl: effectToTachyonFxDsl(found.effect, true),
        durationMs: effectGraphDuration(found.effect.graph),
      };
    }
    case 'create_effect': {
      const { componentId, primitive, name } = payload as { componentId: string; primitive?: string; name?: string };
      const component = store.getComponent(componentId);
      if (!component) throw new Error(`No component with id: ${componentId}`);
      const kind = (primitive && TACHYON_FX_CATALOG.some((entry) => entry.id === primitive) ? primitive : 'fade_from') as any;
      const meta = getTachyonFxCatalogEntry(kind);
      const effect = makePrimitiveEffect(componentId, kind, name || meta.label);
      effect.graph = {
        kind: 'primitive',
        id: makeEffectId('node'),
        effect: kind,
        durationMs: meta.defaultDurationMs,
        interpolation: meta.defaultInterpolation,
        parameters: Object.fromEntries(meta.parameters.map((p) => [p.key, p.defaultValue])),
        spatialPattern: meta.supportsSpatialPattern ? { kind: 'uniform' } : undefined,
        motion: meta.supportsMotion ? 'left-to-right' : undefined,
      };
      commitEffects(component, [...currentEffects(component), effect]);
      notifyAgentActivity(`Agent added ${effect.name}`);
      return effect;
    }
    case 'update_effect': {
      const { componentId, effectId, patch } = payload as { componentId: string; effectId: string; patch: Partial<EffectDefinition> };
      const { component, effect } = findEffect(componentId, effectId);
      const next = { ...effect, ...patch, id: effect.id };
      commitEffects(component, currentEffects(component).map((item) => item.id === effectId ? next : item));
      return next;
    }
    case 'delete_effect': {
      const { componentId, effectId } = payload as { componentId: string; effectId: string };
      const { component } = findEffect(componentId, effectId);
      commitEffects(component, currentEffects(component).filter((item) => item.id !== effectId));
      return { ok: true };
    }
    case 'duplicate_effect': {
      const { componentId, effectId } = payload as { componentId: string; effectId: string };
      const { component, effect } = findEffect(componentId, effectId);
      const copy = structuredClone(effect);
      copy.id = makeEffectId('effect');
      copy.name = `${copy.name} copy`;
      commitEffects(component, [...currentEffects(component), copy]);
      return copy;
    }
    case 'set_effect_graph': {
      const { componentId, effectId, graph } = payload as { componentId: string; effectId: string; graph: EffectGraphNode };
      const { component, effect } = findEffect(componentId, effectId);
      const next = { ...effect, graph };
      commitEffects(component, currentEffects(component).map((item) => item.id === effectId ? next : item));
      return next;
    }
    case 'get_effect_dsl': {
      const { componentId, effectId, reducedMotion } = payload as { componentId: string; effectId: string; reducedMotion?: boolean };
      return effectToTachyonFxDsl(findEffect(componentId, effectId).effect, !!reducedMotion);
    }
    case 'validate_effect_dsl': return validateTachyonFxDsl(String(payload.dsl ?? ''));
    case 'set_effect_dsl': {
      const { componentId, effectId, dsl } = payload as { componentId: string; effectId: string; dsl: string };
      const validation = validateTachyonFxDsl(dsl);
      if (!validation.valid) throw new Error(validation.errors.map((error) => `${error.line}:${error.column} ${error.message}`).join('; '));
      const { component, effect } = findEffect(componentId, effectId);
      const next = { ...effect, graph: tachyonFxDslToGraph(dsl) };
      commitEffects(component, currentEffects(component).map((item) => item.id === effectId ? next : item));
      return next;
    }
    case 'set_effect_target': {
      const { componentId, effectId, target } = payload as { componentId: string; effectId: string; target: EffectTarget };
      const { component, effect } = findEffect(componentId, effectId);
      const next = { ...effect, target };
      commitEffects(component, currentEffects(component).map((item) => item.id === effectId ? next : item));
      return next;
    }
    case 'set_effect_trigger': {
      const { componentId, effectId, trigger } = payload as { componentId: string; effectId: string; trigger: EffectTrigger };
      const { component, effect } = findEffect(componentId, effectId);
      const next = { ...effect, trigger };
      commitEffects(component, currentEffects(component).map((item) => item.id === effectId ? next : item));
      return next;
    }
    case 'set_reduced_motion': {
      const { componentId, effectId, reducedMotion } = payload as { componentId: string; effectId: string; reducedMotion: EffectDefinition['reducedMotion'] };
      const { component, effect } = findEffect(componentId, effectId);
      const next = { ...effect, reducedMotion };
      commitEffects(component, currentEffects(component).map((item) => item.id === effectId ? next : item));
      return next;
    }
    case 'effect_playback': {
      const preview = useEffectPreviewStore.getState();
      const op = String(payload.operation ?? 'play');
      if (op === 'play') preview.play();
      else if (op === 'pause') preview.pause();
      else if (op === 'replay') preview.replay();
      else if (op === 'reset') preview.reset();
      else if (op === 'scrub') preview.scrub(Number(payload.elapsedMs ?? 0));
      else if (op === 'speed') preview.setSpeed(Number(payload.speed ?? 1));
      else if (op === 'mode') preview.setMode(payload.mode === 'reduced' ? 'reduced' : 'normal');
      return useEffectPreviewStore.getState();
    }
    case 'get_effect_playback': return useEffectPreviewStore.getState();
    case 'render_effect_frame': {
      const { componentId, effectId, elapsedMs, reducedMotion } = payload as {
        componentId: string; effectId: string; elapsedMs?: number; reducedMotion?: boolean;
      };
      return evaluateEffect(findEffect(componentId, effectId).effect, Number(elapsedMs ?? 0), !!reducedMotion);
    }

    // --- Terminal Test Mode -----------------------------------------------------
    case 'list_test_scenarios': {
      const project = useProjectStore.getState();
      return {
        builtIn: BUILTIN_TERMINAL_TEST_SCENARIOS,
        custom: project.testScenarios,
        settings: project.terminalTest,
      };
    }
    case 'get_terminal_test_spec': {
      const project = useProjectStore.getState();
      return buildTerminalTestSpec(store.root, project.exportProjectData(), payload.settings as Partial<TerminalTestSettings> | undefined);
    }
    case 'set_terminal_test_settings': {
      const settings = payload.settings as Partial<TerminalTestSettings> | undefined;
      if (!settings || typeof settings !== 'object') throw new Error('settings is required');
      useProjectStore.getState().updateTerminalTest(settings);
      return useProjectStore.getState().terminalTest;
    }
    case 'upsert_test_scenario': {
      const scenario = payload.scenario as TerminalTestScenario | undefined;
      if (!scenario?.id || !scenario.name) throw new Error('scenario.id and scenario.name are required');
      useProjectStore.getState().upsertTestScenario(scenario);
      return useProjectStore.getState().testScenarios.find((item) => item.id === scenario.id) ?? null;
    }
    case 'remove_test_scenario':
      useProjectStore.getState().removeTestScenario(String(payload.id ?? ''));
      return { ok: true };

    // --- image assets / ratatui-image ------------------------------------------
    case 'list_image_assets': return useProjectStore.getState().imageAssets;
    case 'upsert_image_asset': {
      const asset = payload.asset as ImageAssetDefinition;
      if (!asset?.id || !asset.name || !asset.source) throw new Error('asset.id, asset.name and asset.source are required');
      useProjectStore.getState().upsertImageAsset(asset);
      return asset;
    }
    case 'remove_image_asset':
      useProjectStore.getState().removeImageAsset(String(payload.id ?? ''));
      return { ok: true };

    // --- existing design-system/component tools -------------------------------
    case 'save_reusable_component': {
      const { componentId, name, description, tags } = payload as {
        componentId: string; name?: string; description?: string; tags?: string[];
      };
      const target = store.getComponent(componentId);
      if (!target) throw new Error(`No component with id: ${componentId}`);
      return {
        id: useProjectStore.getState().saveReusableComponent(
          name?.trim() || target.name,
          target,
          description ?? 'Reusable Syndrid TUI component',
          tags ?? ['syndrid']
        ),
      };
    }
    case 'insert_reusable_component': {
      const { reusableId, parentId } = payload as { reusableId: string; parentId?: string };
      const project = useProjectStore.getState();
      const def = project.getReusableComponent(reusableId);
      if (!def) throw new Error(`Unknown reusable component: ${reusableId}`);
      const parent = parentId ? store.getComponent(parentId) : store.root;
      if (!parent) throw new Error('No parent component available');
      if (!['Screen', 'Box', 'Grid', 'Modal'].includes(parent.type)) throw new Error(`Parent ${parent.name} cannot contain children`);
      const copy = cloneNode(def.root);
      const refreshIds = (node: ComponentNode) => {
        node.id = generateComponentId();
        node.reusableSourceId = def.id;
        node.children.forEach(refreshIds);
      };
      refreshIds(copy);
      store.updateComponent(parent.id, { children: [...parent.children, copy] });
      assertTreeStillValid();
      return { id: copy.id, reusableId: def.id, parentId: parent.id };
    }
    case 'list_reusable_components':
      return useProjectStore.getState().reusableComponents.map(({ id, name, description, tags, root }) => ({
        id, name, description, tags, rootType: root.type,
      }));
    case 'render_preview': return activePreview(payload.format === 'ansi' ? 'ansi' : 'text').text;
    case 'list_component_types':
      return Object.values(COMPONENT_LIBRARY).map((def) => ({
        type: def.type, name: def.name, description: def.description, category: def.category,
      }));
    case 'get_component_schema': {
      const type = String(payload.type ?? '');
      if (!isComponentType(type)) throw new Error(`Unknown component type: ${type}`);
      const def = COMPONENT_LIBRARY[type];
      return {
        type: def.type,
        name: def.name,
        description: def.description,
        category: def.category,
        defaultProps: def.defaultProps,
        defaultLayout: def.defaultLayout,
        defaultStyle: def.defaultStyle,
        defaultEvents: def.defaultEvents ?? {},
      };
    }
    case 'get_layout_warnings': return activePreview('text').warnings;
    case 'list_templates': return TEMPLATES.map((template) => ({ id: template.id, name: template.name, description: template.description }));
    case 'apply_template': {
      const id = String(payload.id ?? '');
      const template = TEMPLATES.find((item) => item.id === id);
      if (!template) throw new Error(`Unknown template id: ${id}`);
      const built = template.build();
      if (payload.dryRun) return diffTrees(store.root, built);
      store.setRoot(built);
      assertTreeStillValid();
      return { ok: true };
    }
    case 'add_component': {
      const { parentId, type, props, layout, style, events, index, dryRun } = payload as any;
      if (!isComponentType(type) || !store.getComponent(parentId)) throw new Error('Invalid type or parent');
      const def = COMPONENT_LIBRARY[type];
      const data: Omit<ComponentNode, 'id'> = {
        type: def.type,
        name: def.name,
        props: { ...def.defaultProps, ...props },
        layout: { ...def.defaultLayout, ...layout },
        style: { ...def.defaultStyle, ...style },
        events: { ...def.defaultEvents, ...events },
        children: [], locked: false, hidden: false, collapsed: false,
      };
      if (dryRun) {
        const result = applyAddComponent(store.root, parentId, data, index);
        return diffTrees(store.root, result?.root ?? store.root);
      }
      const id = store.addComponent(parentId, data, index);
      assertTreeStillValid();
      return { id };
    }
    case 'update_props': {
      const { id, props, dryRun } = payload as any;
      if (!store.getComponent(id)) throw new Error(`No component with id: ${id}`);
      if (dryRun) return diffTrees(store.root, applyUpdateProps(store.root, id, props));
      store.updateProps(id, props); assertTreeStillValid(); return { ok: true };
    }
    case 'update_layout': {
      const { id, layout, dryRun } = payload as any;
      if (!store.getComponent(id)) throw new Error(`No component with id: ${id}`);
      if (dryRun) return diffTrees(store.root, applyUpdateLayout(store.root, id, layout));
      store.updateLayout(id, layout); assertTreeStillValid(); return { ok: true };
    }
    case 'move_component': {
      const { id, newParentId, index, dryRun } = payload as any;
      if (dryRun) return diffTrees(store.root, applyMoveComponent(store.root, id, newParentId, index));
      store.moveComponent(id, newParentId, index); assertTreeStillValid(); return { ok: true };
    }
    case 'remove_component': {
      const { id, dryRun } = payload as any;
      if (!store.root || id === store.root.id) throw new Error('Cannot remove root Screen');
      if (dryRun) return diffTrees(store.root, applyRemoveComponent(store.root, id));
      store.removeComponent(id); assertTreeStillValid(); return { ok: true };
    }
    case 'duplicate_component': {
      const { id, dryRun } = payload as any;
      if (dryRun) {
        const result = applyDuplicateComponent(store.root, id);
        return diffTrees(store.root, result?.root ?? store.root);
      }
      const newId = store.duplicateComponent(id); assertTreeStillValid(); return { id: newId };
    }
    case 'group_components': {
      const { ids, name, props, layout, style, dryRun } = payload as any;
      const def = COMPONENT_LIBRARY.Box;
      const boxData: Omit<ComponentNode, 'id' | 'children'> = {
        type: 'Box', name: name || def.name,
        props: { ...def.defaultProps, ...props },
        layout: { ...def.defaultLayout, ...layout },
        style: { ...def.defaultStyle, ...style },
        events: { ...def.defaultEvents }, locked: false, hidden: false, collapsed: false,
      };
      if (dryRun) {
        const result = applyGroupComponents(store.root, ids, boxData);
        return diffTrees(store.root, result?.root ?? store.root);
      }
      const id = store.groupComponents(ids, boxData); assertTreeStillValid(); return { id };
    }
    case 'ungroup_components': {
      const { ids, dryRun } = payload as any;
      if (dryRun) {
        const result = applyUngroupComponents(store.root, ids);
        return diffTrees(store.root, result?.root ?? store.root);
      }
      const childIds = store.ungroupComponents(ids); assertTreeStillValid(); return { childIds };
    }
    default: throw new Error(`Unknown bridge action: ${action}`);
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (useUIStore.getState().agentBridgeEnabled) connectAgentBridge();
  }, 2000);
}
export function connectAgentBridge(): void {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  useUIStore.getState().setAgentBridgeStatus('connecting');
  const ws = new WebSocket(BRIDGE_URL);
  socket = ws;
  ws.onopen = () => useUIStore.getState().setAgentBridgeStatus('connected');
  ws.onmessage = (event) => {
    let request: BridgeRequest;
    try { request = JSON.parse(event.data); } catch { return; }
    try { ws.send(JSON.stringify({ id: request.id, ok: true, result: handleRequest(request) })); }
    catch (err) { ws.send(JSON.stringify({ id: request.id, ok: false, error: (err as Error).message })); }
  };
  ws.onclose = () => {
    if (socket === ws) socket = null;
    useUIStore.getState().setAgentBridgeStatus('disconnected');
    if (useUIStore.getState().agentBridgeEnabled) scheduleReconnect();
  };
  ws.onerror = () => {};
}
export function disconnectAgentBridge(): void {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  socket?.close();
  socket = null;
  useUIStore.getState().setAgentBridgeStatus('disconnected');
}
export function initAgentBridge(): void {
  if (useUIStore.getState().agentBridgeEnabled) connectAgentBridge();
}
