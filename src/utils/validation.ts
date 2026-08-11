// Validation utilities for component properties

import type { ComponentNode, ComponentType } from '../types';
import { COMPONENT_LIBRARY } from '../constants/components';

const VALID_COMPONENT_TYPES = new Set(Object.keys(COMPONENT_LIBRARY));
const VALID_ANIMATION_TRIGGERS = new Set([
  'on-enter', 'on-exit', 'on-focus', 'on-blur', 'on-select', 'on-change',
  'on-loading', 'on-success', 'on-error', 'manual',
]);
const VALID_ANIMATION_EFFECTS = new Set([
  'fade', 'slide', 'wipe', 'pulse', 'dissolve', 'glitch', 'typewriter', 'highlight', 'spring',
]);
const VALID_ANIMATION_DIRECTIONS = new Set(['left', 'right', 'up', 'down', 'none']);
const VALID_ANIMATION_EASINGS = new Set([
  'linear', 'ease-in', 'ease-out', 'ease-in-out', 'smoothstep', 'spring',
]);
const VALID_REDUCED_MOTION_EFFECTS = new Set(['none', 'fade', 'highlight']);
const VALID_EFFECT_PRIMITIVES = new Set([
  'fade_from', 'fade_to', 'fade_from_fg', 'fade_to_fg', 'dissolve', 'coalesce', 'evolve',
  'slide_in', 'slide_out', 'sweep_in', 'sweep_out', 'explode', 'expand', 'stretch', 'translate',
  'paint', 'hsl_shift', 'darken', 'lighten', 'consume_tick', 'custom',
]);
const VALID_EFFECT_INTERPOLATIONS = new Set([
  'linear', 'quad-in', 'quad-out', 'quad-in-out', 'cubic-in', 'cubic-out', 'cubic-in-out',
  'smoothstep', 'sine-in', 'sine-out', 'sine-in-out', 'bounce-out', 'spring',
]);
const VALID_EFFECT_MOTIONS = new Set(['left-to-right', 'right-to-left', 'up-to-down', 'down-to-up']);
const VALID_EFFECT_REGIONS = new Set(['content', 'border', 'inner', 'outer']);
const VALID_ECOSYSTEM_ADAPTERS = new Set([
  'native', 'textarea', 'image', 'big-text', 'card', 'popup', 'prompt', 'scrollview',
  'tree-widget', 'widget-list', 'terminal', 'interactive', 'syntax-highlight', 'node-graph', 'ansi-text',
]);
const VALID_ECOSYSTEM_LIBRARIES = new Set([
  'ratatui', 'tachyonfx', 'ratatui-textarea', 'tui-widgets', 'ratatui-image', 'mousefood',
  'tui-tree-widget', 'tui-widget-list', 'tui-term', 'ratatui-interact', 'tui-syntax-highlight',
  'tui-nodes', 'termprofile', 'ansi-to-tui',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalRecord(value: unknown): boolean {
  return value === undefined || isRecord(value);
}

function finite(value: unknown, min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isValidOverride(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isOptionalRecord(value.props) || !isOptionalRecord(value.layout) || !isOptionalRecord(value.style)) return false;
  if (value.hidden !== undefined && typeof value.hidden !== 'boolean') return false;
  if (value.label !== undefined && typeof value.label !== 'string') return false;
  if (value.note !== undefined && typeof value.note !== 'string') return false;
  return true;
}

function isValidResponsiveMap(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return Object.values(value).every(isValidOverride);
}

function isValidAnimation(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || !value.id) return false;
  if (typeof value.name !== 'string' || !value.name) return false;
  if (typeof value.trigger !== 'string' || !VALID_ANIMATION_TRIGGERS.has(value.trigger)) return false;
  if (typeof value.effect !== 'string' || !VALID_ANIMATION_EFFECTS.has(value.effect)) return false;
  if (typeof value.direction !== 'string' || !VALID_ANIMATION_DIRECTIONS.has(value.direction)) return false;
  if (typeof value.easing !== 'string' || !VALID_ANIMATION_EASINGS.has(value.easing)) return false;
  if (!finite(value.durationMs, 0, 60_000) || !finite(value.delayMs, 0, 60_000)) return false;
  if (typeof value.enabled !== 'boolean') return false;
  if (value.loop !== undefined && typeof value.loop !== 'boolean') return false;
  if (value.intensity !== undefined && !finite(value.intensity, -1000, 1000)) return false;
  if (value.reducedMotionEffect !== undefined && (
    typeof value.reducedMotionEffect !== 'string' || !VALID_REDUCED_MOTION_EFFECTS.has(value.reducedMotionEffect)
  )) return false;
  if (value.tachyonFxHint !== undefined && typeof value.tachyonFxHint !== 'string') return false;
  return true;
}

function isValidCellFilter(value: unknown, depth = 0): boolean {
  if (!isRecord(value) || depth > 24 || typeof value.kind !== 'string') return false;
  switch (value.kind) {
    case 'all':
    case 'text': return true;
    case 'foreground':
    case 'background': return typeof value.color === 'string';
    case 'position':
      return ['x', 'y', 'width', 'height'].every((key) => value[key] === undefined || finite(value[key], 0, 100_000));
    case 'not': return isValidCellFilter(value.filter, depth + 1);
    case 'all-of':
    case 'any-of': return Array.isArray(value.filters) && value.filters.length <= 128 && value.filters.every((item) => isValidCellFilter(item, depth + 1));
    default: return false;
  }
}

function isValidSpatialPattern(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  switch (value.kind) {
    case 'uniform': return true;
    case 'radial': return finite(value.centerX, -10_000, 10_000) && finite(value.centerY, -10_000, 10_000);
    case 'diagonal': return ['down-right', 'down-left', 'up-right', 'up-left'].includes(String(value.direction));
    case 'checkerboard': return finite(value.cellWidth, 1, 10_000) && finite(value.cellHeight, 1, 10_000);
    case 'columns':
    case 'rows': return value.reverse === undefined || typeof value.reverse === 'boolean';
    case 'organic': return finite(value.seed, -2_147_483_648, 2_147_483_647);
    default: return false;
  }
}

function isValidEffectGraph(value: unknown, depth = 0): boolean {
  if (!isRecord(value) || depth > 32 || typeof value.kind !== 'string' || typeof value.id !== 'string' || !value.id) return false;
  switch (value.kind) {
    case 'primitive':
      return typeof value.effect === 'string'
        && VALID_EFFECT_PRIMITIVES.has(value.effect)
        && finite(value.durationMs, 0, 60_000)
        && typeof value.interpolation === 'string'
        && VALID_EFFECT_INTERPOLATIONS.has(value.interpolation)
        && (value.motion === undefined || (typeof value.motion === 'string' && VALID_EFFECT_MOTIONS.has(value.motion)))
        && isRecord(value.parameters)
        && Object.values(value.parameters).every((item) => ['string', 'number', 'boolean'].includes(typeof item) && (typeof item !== 'number' || Number.isFinite(item)))
        && isValidSpatialPattern(value.spatialPattern);
    case 'sequence':
    case 'parallel':
      return Array.isArray(value.children) && value.children.length <= 128 && value.children.every((child) => isValidEffectGraph(child, depth + 1));
    case 'delay':
      return finite(value.durationMs, 0, 60_000) && isValidEffectGraph(value.child, depth + 1);
    case 'repeat':
      return ['count', 'forever', 'ping-pong'].includes(String(value.mode))
        && (value.count === undefined || finite(value.count, 1, 10_000))
        && isValidEffectGraph(value.child, depth + 1);
    default: return false;
  }
}

function isValidEffectTarget(value: unknown): boolean {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  switch (value.kind) {
    case 'component': return typeof value.componentId === 'string' && !!value.componentId;
    case 'region': return typeof value.componentId === 'string' && !!value.componentId && VALID_EFFECT_REGIONS.has(String(value.region));
    case 'rect': return finite(value.x, 0, 100_000) && finite(value.y, 0, 100_000) && finite(value.width, 0, 100_000) && finite(value.height, 0, 100_000);
    case 'cells': return typeof value.componentId === 'string' && !!value.componentId && isValidCellFilter(value.filter);
    default: return false;
  }
}

function isValidEffectTrigger(value: unknown): boolean {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  switch (value.kind) {
    case 'mount':
    case 'show':
    case 'focus':
    case 'blur':
    case 'select':
    case 'deselect': return true;
    case 'state-change': return value.state === undefined || typeof value.state === 'string';
    case 'key': return typeof value.key === 'string' && !!value.key;
    case 'event': return typeof value.event === 'string' && !!value.event;
    case 'manual': return value.name === undefined || typeof value.name === 'string';
    default: return false;
  }
}

export function isValidEffectDefinition(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || !value.id || typeof value.name !== 'string' || !value.name) return false;
  if (typeof value.enabled !== 'boolean' || !isValidEffectTarget(value.target) || !isValidEffectTrigger(value.trigger)) return false;
  if (!isValidEffectGraph(value.graph)) return false;
  if (!isRecord(value.reducedMotion) || !['inherit', 'replace', 'disable'].includes(String(value.reducedMotion.mode))) return false;
  if (value.reducedMotion.mode === 'replace' && !isValidEffectGraph(value.reducedMotion.graph)) return false;
  if (value.reducedMotion.mode !== 'replace' && value.reducedMotion.graph !== undefined && !isValidEffectGraph(value.reducedMotion.graph)) return false;
  if (value.tags !== undefined && (!Array.isArray(value.tags) || !value.tags.every((tag) => typeof tag === 'string'))) return false;
  if (value.notes !== undefined && typeof value.notes !== 'string') return false;
  return true;
}

export function isValidComponentEcosystem(value: unknown): boolean {
  if (!isRecord(value) || typeof value.adapter !== 'string' || !VALID_ECOSYSTEM_ADAPTERS.has(value.adapter)) return false;
  if (value.textarea !== undefined) {
    if (!isRecord(value.textarea)) return false;
    if (value.textarea.search !== undefined && typeof value.textarea.search !== 'boolean') return false;
    if (value.textarea.softWrap !== undefined && typeof value.textarea.softWrap !== 'boolean') return false;
    if (value.textarea.lineNumbers !== undefined && typeof value.textarea.lineNumbers !== 'boolean') return false;
    if (value.textarea.tabWidth !== undefined && !finite(value.textarea.tabWidth, 1, 32)) return false;
    if (value.textarea.editorMode !== undefined && !['standard', 'vim'].includes(String(value.textarea.editorMode))) return false;
  }
  if (value.image !== undefined) {
    if (!isRecord(value.image)) return false;
    if (value.image.assetId !== undefined && typeof value.image.assetId !== 'string') return false;
    if (value.image.fit !== undefined && !['contain', 'cover', 'stretch', 'original'].includes(String(value.image.fit))) return false;
    if (value.image.alignment !== undefined && !['start', 'center', 'end'].includes(String(value.image.alignment))) return false;
    if (value.image.protocol !== undefined && !['auto', 'kitty', 'sixel', 'iterm2', 'halfblocks'].includes(String(value.image.protocol))) return false;
    if (value.image.fallback !== undefined && !['placeholder', 'alt-text', 'hidden'].includes(String(value.image.fallback))) return false;
    if (value.image.preserveAspectRatio !== undefined && typeof value.image.preserveAspectRatio !== 'boolean') return false;
  }
  if (value.scroll !== undefined) {
    if (!isRecord(value.scroll) || (value.scroll.axis !== undefined && !['vertical', 'horizontal', 'both'].includes(String(value.scroll.axis)))) return false;
    if (value.scroll.showScrollbar !== undefined && typeof value.scroll.showScrollbar !== 'boolean') return false;
    if (value.scroll.step !== undefined && !finite(value.scroll.step, 1, 10_000)) return false;
  }
  if (value.terminal !== undefined) {
    if (!isRecord(value.terminal)) return false;
    if (value.terminal.command !== undefined && typeof value.terminal.command !== 'string') return false;
    if (value.terminal.cwd !== undefined && typeof value.terminal.cwd !== 'string') return false;
    if (value.terminal.args !== undefined && (!Array.isArray(value.terminal.args) || !value.terminal.args.every((arg) => typeof arg === 'string'))) return false;
    if (value.terminal.scrollback !== undefined && !finite(value.terminal.scrollback, 0, 10_000_000)) return false;
    if (value.terminal.readOnly !== undefined && typeof value.terminal.readOnly !== 'boolean') return false;
  }
  if (value.syntax !== undefined) {
    if (!isRecord(value.syntax)) return false;
    if (value.syntax.language !== undefined && typeof value.syntax.language !== 'string') return false;
    if (value.syntax.theme !== undefined && typeof value.syntax.theme !== 'string') return false;
    if (value.syntax.lineNumbers !== undefined && typeof value.syntax.lineNumbers !== 'boolean') return false;
  }
  if (value.interaction !== undefined) {
    if (!isRecord(value.interaction)) return false;
    const interaction = value.interaction;
    for (const key of ['focusable', 'mouse', 'hover', 'click']) {
      const item = interaction[key];
      if (item !== undefined && typeof item !== 'boolean') return false;
    }
  }
  if (value.nodeGraph !== undefined) {
    if (!isRecord(value.nodeGraph)) return false;
    if (value.nodeGraph.orientation !== undefined && !['horizontal', 'vertical'].includes(String(value.nodeGraph.orientation))) return false;
    if (value.nodeGraph.showPorts !== undefined && typeof value.nodeGraph.showPorts !== 'boolean') return false;
    if (value.nodeGraph.showLabels !== undefined && typeof value.nodeGraph.showLabels !== 'boolean') return false;
  }
  if (value.embedded !== undefined) {
    if (!isRecord(value.embedded)) return false;
    if (value.embedded.enabled !== undefined && typeof value.embedded.enabled !== 'boolean') return false;
    if (value.embedded.backend !== undefined && value.embedded.backend !== 'mousefood') return false;
    if (value.embedded.target !== undefined && !['simulator', 'framebuffer', 'epd-weact', 'epd-waveshare', 'lilygo-epd47'].includes(String(value.embedded.target))) return false;
    if (value.embedded.colorMode !== undefined && !['mono', 'rgb565', 'rgb888'].includes(String(value.embedded.colorMode))) return false;
  }
  if (value.libraryOverrides !== undefined) {
    if (!isRecord(value.libraryOverrides)) return false;
    for (const [library, version] of Object.entries(value.libraryOverrides)) {
      if (!VALID_ECOSYSTEM_LIBRARIES.has(library) || typeof version !== 'string' || !version.trim()) return false;
    }
  }
  return true;
}

function isValidPrototype(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  if (value.focusable !== undefined && typeof value.focusable !== 'boolean') return false;
  if (value.focusOrder !== undefined && !finite(value.focusOrder, -1_000_000, 1_000_000)) return false;
  if (value.defaultState !== undefined && typeof value.defaultState !== 'string') return false;

  if (value.states !== undefined) {
    if (!isRecord(value.states) || !Object.values(value.states).every(isValidOverride)) return false;
  }
  if (value.effects !== undefined) {
    if (!Array.isArray(value.effects) || !value.effects.every(isValidEffectDefinition)) return false;
  }
  if (value.animations !== undefined) {
    if (!Array.isArray(value.animations) || !value.animations.every(isValidAnimation)) return false;
  }
  if (value.keyBindings !== undefined) {
    if (!Array.isArray(value.keyBindings)) return false;
    for (const binding of value.keyBindings) {
      if (!isRecord(binding) || typeof binding.key !== 'string' || !binding.key || typeof binding.action !== 'string' || !binding.action) return false;
      if (binding.description !== undefined && typeof binding.description !== 'string') return false;
    }
  }
  if (value.ecosystem !== undefined && !isValidComponentEcosystem(value.ecosystem)) return false;
  return true;
}

/**
 * Validate that an unknown value has the shape of a ComponentNode tree
 * (recursively). Used at the .tui file-open and autosave boundaries.
 */
export function isValidComponentTree(node: unknown): node is ComponentNode {
  if (typeof node !== 'object' || node === null) return false;
  const n = node as Record<string, unknown>;

  if (typeof n.id !== 'string' || !n.id) return false;
  if (typeof n.type !== 'string' || !VALID_COMPONENT_TYPES.has(n.type)) return false;
  if (typeof n.name !== 'string') return false;
  if (!isRecord(n.props) || !isRecord(n.layout) || !isRecord(n.style) || !isRecord(n.events)) return false;
  if (!Array.isArray(n.children)) return false;
  if (n.locked !== undefined && typeof n.locked !== 'boolean') return false;
  if (n.hidden !== undefined && typeof n.hidden !== 'boolean') return false;
  if (n.collapsed !== undefined && typeof n.collapsed !== 'boolean') return false;
  if (n.reusableSourceId !== undefined && typeof n.reusableSourceId !== 'string') return false;
  if (!isValidResponsiveMap(n.responsive) || !isValidPrototype(n.prototype)) return false;

  return n.children.every(isValidComponentTree);
}

export function isValidComponentName(name: string): boolean {
  return name.length > 0 && name.length <= 50;
}

export function isValidDimension(value: number | 'fill' | 'auto'): boolean {
  if (value === 'fill' || value === 'auto') return true;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000;
}

export function isValidColor(color: string): boolean {
  const ansiColors = [
    'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
    'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue',
    'brightMagenta', 'brightCyan', 'brightWhite',
  ];
  if (ansiColors.includes(color)) return true;
  if (/^#[0-9A-Fa-f]{6}$/.test(color)) return true;
  if (/^rgba?\(\d+,\s*\d+,\s*\d+(,\s*[\d.]+)?\)$/.test(color)) return true;
  return false;
}

export function validateComponentNode(node: ComponentNode): string[] {
  const errors: string[] = [];
  if (!isValidComponentName(node.name)) errors.push('Component name must be 1-50 characters');
  if (node.props.width !== undefined && !isValidDimension(node.props.width)) errors.push('Invalid width value');
  if (node.props.height !== undefined && !isValidDimension(node.props.height)) errors.push('Invalid height value');
  if (node.style.color && !isValidColor(node.style.color)) errors.push('Invalid foreground color');
  if (node.style.backgroundColor && !isValidColor(node.style.backgroundColor)) errors.push('Invalid background color');
  if (node.style.borderColor && !isValidColor(node.style.borderColor)) errors.push('Invalid border color');
  if (node.style.opacity !== undefined && !finite(node.style.opacity, 0, 1)) errors.push('Opacity must be between 0 and 1');
  if (node.layout.gap !== undefined && !finite(node.layout.gap, 0, 1000)) errors.push('Gap must be a non-negative number');
  return errors;
}

export function canHaveChildren(type: ComponentType): boolean {
  const noChildrenTypes: ComponentType[] = [
    'TextInput', 'TextArea', 'Button', 'Checkbox', 'Radio', 'Toggle', 'Text', 'Image', 'Code',
    'AnsiText', 'Terminal', 'NodeGraph', 'Spinner', 'ProgressBar', 'Gauge', 'Sparkline', 'Log',
    'Toast', 'StatusBar', 'Spacer', 'Separator',
  ];
  return !noChildrenTypes.includes(type);
}

export function canBeChild(parentType: ComponentType, childType: ComponentType): boolean {
  if (!canHaveChildren(parentType)) return false;
  if (parentType === 'Modal') return ['Box', 'Grid', 'Text'].includes(childType);
  if (parentType === 'Tabs') return childType === 'Box';
  return true;
}
