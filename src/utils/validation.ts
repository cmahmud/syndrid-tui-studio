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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalRecord(value: unknown): boolean {
  return value === undefined || isRecord(value);
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
  if (typeof value.durationMs !== 'number' || !Number.isFinite(value.durationMs) || value.durationMs < 0 || value.durationMs > 60_000) return false;
  if (typeof value.delayMs !== 'number' || !Number.isFinite(value.delayMs) || value.delayMs < 0 || value.delayMs > 60_000) return false;
  if (typeof value.enabled !== 'boolean') return false;
  if (value.loop !== undefined && typeof value.loop !== 'boolean') return false;
  if (value.intensity !== undefined && (typeof value.intensity !== 'number' || !Number.isFinite(value.intensity))) return false;
  if (value.reducedMotionEffect !== undefined && (
    typeof value.reducedMotionEffect !== 'string' || !VALID_REDUCED_MOTION_EFFECTS.has(value.reducedMotionEffect)
  )) return false;
  if (value.tachyonFxHint !== undefined && typeof value.tachyonFxHint !== 'string') return false;
  return true;
}

function isValidPrototype(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  if (value.focusable !== undefined && typeof value.focusable !== 'boolean') return false;
  if (value.focusOrder !== undefined && (typeof value.focusOrder !== 'number' || !Number.isFinite(value.focusOrder))) return false;
  if (value.defaultState !== undefined && typeof value.defaultState !== 'string') return false;

  if (value.states !== undefined) {
    if (!isRecord(value.states) || !Object.values(value.states).every(isValidOverride)) return false;
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
  return true;
}

/**
 * Validate that an unknown value has the shape of a ComponentNode tree
 * (recursively). Used at the .tui file-open boundary, where the JSON is
 * untrusted — a malformed tree fed straight into the store crashes the
 * layout engine and renderer, which assume these fields exist.
 */
export function isValidComponentTree(node: unknown): node is ComponentNode {
  if (typeof node !== 'object' || node === null) return false;
  const n = node as Record<string, unknown>;

  if (typeof n.id !== 'string' || !n.id) return false;
  if (typeof n.type !== 'string' || !VALID_COMPONENT_TYPES.has(n.type)) return false;
  if (typeof n.name !== 'string') return false;
  if (!isRecord(n.props)) return false;
  if (!isRecord(n.layout)) return false;
  if (!isRecord(n.style)) return false;
  if (!isRecord(n.events)) return false;
  if (!Array.isArray(n.children)) return false;
  if (n.locked !== undefined && typeof n.locked !== 'boolean') return false;
  if (n.hidden !== undefined && typeof n.hidden !== 'boolean') return false;
  if (n.collapsed !== undefined && typeof n.collapsed !== 'boolean') return false;
  if (n.reusableSourceId !== undefined && typeof n.reusableSourceId !== 'string') return false;
  if (!isValidResponsiveMap(n.responsive)) return false;
  if (!isValidPrototype(n.prototype)) return false;

  return n.children.every(isValidComponentTree);
}

/**
 * Validate if a component name is valid
 */
export function isValidComponentName(name: string): boolean {
  return name.length > 0 && name.length <= 50;
}

/**
 * Validate if a dimension value is valid
 */
export function isValidDimension(value: number | 'fill' | 'auto'): boolean {
  if (value === 'fill' || value === 'auto') return true;
  return typeof value === 'number' && value >= 0 && value <= 1000;
}

/**
 * Validate if a color string is valid
 */
export function isValidColor(color: string): boolean {
  // Allow ANSI color names
  const ansiColors = [
    'black',
    'red',
    'green',
    'yellow',
    'blue',
    'magenta',
    'cyan',
    'white',
    'brightBlack',
    'brightRed',
    'brightGreen',
    'brightYellow',
    'brightBlue',
    'brightMagenta',
    'brightCyan',
    'brightWhite',
  ];

  if (ansiColors.includes(color)) return true;

  // Allow hex colors
  if (/^#[0-9A-Fa-f]{6}$/.test(color)) return true;

  // Allow rgb/rgba
  if (/^rgba?\(\d+,\s*\d+,\s*\d+(,\s*[\d.]+)?\)$/.test(color)) return true;

  return false;
}

/**
 * Validate if a component node is valid
 */
export function validateComponentNode(node: ComponentNode): string[] {
  const errors: string[] = [];

  // Validate name
  if (!isValidComponentName(node.name)) {
    errors.push('Component name must be 1-50 characters');
  }

  // Validate dimensions
  if (node.props.width && !isValidDimension(node.props.width)) {
    errors.push('Invalid width value');
  }
  if (node.props.height && !isValidDimension(node.props.height)) {
    errors.push('Invalid height value');
  }

  // Validate colors
  if (node.style.color && !isValidColor(node.style.color)) {
    errors.push('Invalid foreground color');
  }
  if (node.style.backgroundColor && !isValidColor(node.style.backgroundColor)) {
    errors.push('Invalid background color');
  }
  if (node.style.borderColor && !isValidColor(node.style.borderColor)) {
    errors.push('Invalid border color');
  }

  // Validate opacity
  if (node.style.opacity !== undefined) {
    if (
      typeof node.style.opacity !== 'number' ||
      node.style.opacity < 0 ||
      node.style.opacity > 1
    ) {
      errors.push('Opacity must be between 0 and 1');
    }
  }

  // Validate layout gap
  if (node.layout.gap !== undefined) {
    if (typeof node.layout.gap !== 'number' || node.layout.gap < 0) {
      errors.push('Gap must be a non-negative number');
    }
  }

  return errors;
}

/**
 * Check if a component type supports children
 */
export function canHaveChildren(type: ComponentType): boolean {
  const noChildrenTypes: ComponentType[] = [
    'TextInput',
    'TextArea',
    'Button',
    'Checkbox',
    'Radio',
    'Toggle',
    'Text',
    'Spinner',
    'ProgressBar',
    'Gauge',
    'Sparkline',
    'Log',
    'Toast',
    'StatusBar',
    'Spacer',
    'Separator',
  ];

  return !noChildrenTypes.includes(type);
}

/**
 * Validate if a component can be a child of another
 */
export function canBeChild(parentType: ComponentType, childType: ComponentType): boolean {
  // Check if parent can have children
  if (!canHaveChildren(parentType)) {
    return false;
  }

  // Modal can only have certain children
  if (parentType === 'Modal') {
    return ['Box', 'Grid', 'Text'].includes(childType);
  }

  // Tabs must have direct children of specific types
  if (parentType === 'Tabs') {
    return childType === 'Box';
  }

  return true;
}
