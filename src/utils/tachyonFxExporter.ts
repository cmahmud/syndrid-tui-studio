import type { AnimationSpec, ComponentNode, EffectDefinition, EffectTarget } from '../types';
import { legacyAnimationToEffect } from '../types';
import { effectToTachyonFxDsl } from './tachyonFxDsl';

interface MotionRecord {
  componentId: string;
  componentName: string;
  effect: EffectDefinition;
}

function collect(node: ComponentNode | null, out: MotionRecord[] = []): MotionRecord[] {
  if (!node) return out;
  const effects = node.prototype?.effects?.length
    ? node.prototype.effects
    : (node.prototype?.animations ?? []).map((animation) => legacyAnimationToEffect(node.id, animation));
  for (const effect of effects) if (effect.enabled) out.push({ componentId: node.id, componentName: node.name, effect });
  node.children.forEach((child) => collect(child, out));
  return out;
}

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
  const records = collect(root);
  const lines = [
    '// Syndrid TUI Studio v3 — production-oriented TachyonFX effect plan',
    '// Canonical source is the structured EffectDefinition graph stored in the .tui file.',
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

  for (const { componentId, componentName, effect } of records) {
    const fnName = `effect_${rustIdent(effect.id)}`;
    lines.push(`// ${componentName} (${componentId}) · ${targetComment(effect.target)} · trigger=${effect.trigger.kind}`);
    if (effect.notes) lines.push(`// ${effect.notes.replace(/\r?\n/g, ' ')}`);
    lines.push(`fn ${fnName}(reduced_motion: bool) -> Effect {`);
    lines.push(`    let mut effect = if reduced_motion {`);
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

export function exportTachyonFxCargoSnippet(): string {
  return [
    '[dependencies]',
    'ratatui = "0.30"',
    'tachyonfx = "0.25"',
    'ratatui-textarea = "0.7"',
    'tui-widgets = "0.3"',
    'ratatui-image = "8"',
    '',
    '# Optional authoring/runtime helpers represented by the Syndrid project spec:',
    '# tui-scrollview, tui-tree-widget, tui-widget-list, tui-term, ratatui-interact,',
    '# tui-syntax-highlight, tui-nodes, termprofile, ansi-to-tui',
    '# mousefood is an optional embedded-graphics backend target, not desktop mouse input.',
  ].join('\n');
}
