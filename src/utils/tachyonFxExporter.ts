import type {
  AnimationSpec,
  ComponentNode,
  EffectDefinition,
  EffectTarget,
  RatatuiRuntimeLibraries,
} from '../types';
import { DEFAULT_RATATUI_RUNTIME_LIBRARIES, legacyAnimationToEffect } from '../types';
import { effectToTachyonFxDsl } from './tachyonFxDsl';
import { collectAuthoredEffects } from './motionResolver';

function rustIdent(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^([0-9])/, '_$1');
  return cleaned || 'effect';
}

function rustString(value: string): string {
  return JSON.stringify(value);
}

function targetComment(target: EffectTarget): string {
  switch (target.kind) {
    case 'component': return `component=${target.componentId}`;
    case 'region': return `component=${target.componentId} region=${target.region}`;
    case 'rect': return `rect=(${target.x},${target.y},${target.width},${target.height})`;
    case 'cells': return `component=${target.componentId} cells=${target.filter.kind}`;
  }
}

function targetRust(target: EffectTarget): string[] {
  switch (target.kind) {
    case 'component':
      return [`effect.set_area(component_rect(${rustString(target.componentId)}));`];
    case 'region':
      return [
        `let area = component_region(${rustString(target.componentId)}, ${rustString(target.region)});`,
        'effect.set_area(area);',
      ];
    case 'rect':
      return [`effect.set_area(Rect::new(${Math.max(0, Math.round(target.x))}, ${Math.max(0, Math.round(target.y))}, ${Math.max(0, Math.round(target.width))}, ${Math.max(0, Math.round(target.height))}));`];
    case 'cells': {
      const lines = [`effect.set_area(component_rect(${rustString(target.componentId)}));`];
      switch (target.filter.kind) {
        case 'text': lines.push('effect.set_cell_filter(CellFilter::Text);'); break;
        case 'foreground': lines.push(`// Apply a foreground CellFilter for ${target.filter.color}.`); break;
        case 'background': lines.push(`// Apply a background CellFilter for ${target.filter.color}.`); break;
        case 'position': lines.push('// Apply the authored position CellFilter within the component rect.'); break;
        case 'not':
        case 'all-of':
        case 'any-of': lines.push('// Compose the authored nested CellFilter tree here.'); break;
        case 'all':
        default: lines.push('effect.set_cell_filter(CellFilter::All);'); break;
      }
      return lines;
    }
  }
}

function triggerRust(effect: EffectDefinition, fnName: string): string[] {
  const trigger = effect.trigger;
  switch (trigger.kind) {
    case 'mount': return [`effects.add(${fnName}(reduced_motion));`];
    case 'show': return [`// on show: effects.add(${fnName}(reduced_motion));`];
    case 'focus': return [`// on FocusGained: effects.add(${fnName}(reduced_motion));`];
    case 'blur': return [`// on FocusLost: effects.add(${fnName}(reduced_motion));`];
    case 'select': return [`// on selection: effects.add(${fnName}(reduced_motion));`];
    case 'deselect': return [`// on deselection: effects.add(${fnName}(reduced_motion));`];
    case 'state-change': return [`// when state becomes ${trigger.state ?? '<any>'}: effects.add(${fnName}(reduced_motion));`];
    case 'key': return [`// when key ${trigger.key}: effects.add(${fnName}(reduced_motion));`];
    case 'event': return [`// on event ${trigger.event}: effects.add(${fnName}(reduced_motion));`];
    case 'manual': return [`// manual trigger ${trigger.name ?? effect.name}: effects.add(${fnName}(reduced_motion));`];
  }
}

/** Compatibility export for older callers that still hold AnimationSpec. */
export function animationToTachyonFxDsl(animation: AnimationSpec, reducedMotion = false): string {
  return effectToTachyonFxDsl(legacyAnimationToEffect('__legacy__', animation), reducedMotion);
}

export function exportTachyonFxMotionPlan(root: ComponentNode | null): string {
  const { records, stats } = collectAuthoredEffects(root, { enabledOnly: true });
  const lines = [
    '// Syndrid TUI Studio v3 — production-oriented TachyonFX effect plan',
    '// Canonical source is the unified authored-motion resolver used by preview, save, MCP and export.',
    '// v3 EffectDefinition graphs win unless an enabled legacy mirror rescues a stale/disabled same-id graph.',
    `// Discovery: v3=${stats.canonical} legacy=${stats.legacy} resolved=${stats.resolved} enabled=${stats.enabled} rescuedLegacy=${stats.rescuedLegacy}`,
    '// Target TachyonFX family: 0.25.x. Pin the exact compatible version in the consuming Ratatui app.',
    'use ratatui::{layout::Rect, style::Color};',
    'use tachyonfx::{fx, CellFilter, Effect, EffectManager, EffectTimer, Interpolation, Motion};',
    '',
    '// Integrate these two helpers with the application layout registry.',
    'fn component_rect(_id: &str) -> Rect { Rect::default() }',
    'fn component_region(id: &str, _region: &str) -> Rect { component_rect(id) }',
    '',
  ];

  if (records.length === 0) {
    lines.push('// No enabled TachyonFX effects have been authored yet.');
    return lines.join('\n');
  }

  for (const { componentId, componentName, effect, source } of records) {
    const fnName = `effect_${rustIdent(effect.id)}`;
    lines.push(`// ${componentName} (${componentId}) · ${targetComment(effect.target)} · trigger=${effect.trigger.kind} · source=${source}`);
    if (effect.notes) lines.push(`// ${effect.notes.replace(/\r?\n/g, ' ')}`);
    lines.push(`fn ${fnName}(reduced_motion: bool) -> Effect {`);
    lines.push('    let mut effect = if reduced_motion {');
    lines.push(`        ${effectToTachyonFxDsl(effect, true)}`);
    lines.push('    } else {');
    lines.push(`        ${effectToTachyonFxDsl(effect, false)}`);
    lines.push('    };');
    for (const line of targetRust(effect.target)) lines.push(`    ${line}`);
    lines.push('    effect');
    lines.push('}');
    lines.push('');
  }

  lines.push('pub fn install_mount_effects(effects: &mut EffectManager, reduced_motion: bool) {');
  for (const { effect } of records) {
    const fnName = `effect_${rustIdent(effect.id)}`;
    for (const line of triggerRust(effect, fnName)) lines.push(`    ${line}`);
  }
  lines.push('}');
  lines.push('');
  lines.push('// Event-driven triggers should call the commented effects.add(...) expressions from your existing input/state reducer.');
  lines.push('// Tick the EffectManager from elapsed wall-clock time; never sleep the UI thread or advance effects by frame count.');
  return lines.join('\n');
}

function version(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

/**
 * Generate one dependency block from the same project runtime version map used
 * by the ecosystem exporter and terminal test runtime. This intentionally
 * avoids hard-coded historical versions drifting away from the v3 project.
 */
export function exportTachyonFxCargoSnippet(
  libraries: RatatuiRuntimeLibraries = DEFAULT_RATATUI_RUNTIME_LIBRARIES
): string {
  return [
    '[dependencies]',
    `ratatui = "${version(libraries.ratatui, DEFAULT_RATATUI_RUNTIME_LIBRARIES.ratatui ?? '0.30.2')}"`,
    `tachyonfx = "${version(libraries.tachyonfx, DEFAULT_RATATUI_RUNTIME_LIBRARIES.tachyonfx)}"`,
    `ratatui-textarea = "${version(libraries.ratatuiTextarea, DEFAULT_RATATUI_RUNTIME_LIBRARIES.ratatuiTextarea)}"`,
    `tui-widgets = "${version(libraries.tuiWidgets, DEFAULT_RATATUI_RUNTIME_LIBRARIES.tuiWidgets)}"`,
    `ratatui-image = "${version(libraries.ratatuiImage, DEFAULT_RATATUI_RUNTIME_LIBRARIES.ratatuiImage)}"`,
    `ansi-to-tui = "${version(libraries.ansiToTui, DEFAULT_RATATUI_RUNTIME_LIBRARIES.ansiToTui ?? '8.0.1')}"`,
    ...(libraries.mousefood ? [`mousefood = { version = "${libraries.mousefood}", optional = true, default-features = false, features = ["std", "fonts", "framebuffer"] }`] : []),
    '',
    '# Optional authoring/runtime helpers represented by the Syndrid project spec:',
    `# ${libraries.optional.join(', ') || 'none'}`,
    '# mousefood is an optional embedded-graphics backend target, not desktop mouse input.',
  ].join('\n');
}
