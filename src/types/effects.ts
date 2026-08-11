import type { AnimationDirection, AnimationEasing, AnimationSpec, AnimationTrigger } from './project';

export type EffectId = string;

export type TachyonFxPrimitive =
  | 'fade_from'
  | 'fade_to'
  | 'fade_from_fg'
  | 'fade_to_fg'
  | 'dissolve'
  | 'coalesce'
  | 'evolve'
  | 'slide_in'
  | 'slide_out'
  | 'sweep_in'
  | 'sweep_out'
  | 'explode'
  | 'expand'
  | 'stretch'
  | 'translate'
  | 'paint'
  | 'hsl_shift'
  | 'darken'
  | 'lighten'
  | 'consume_tick'
  | 'custom';

export type EffectInterpolation =
  | 'linear'
  | 'quad-in'
  | 'quad-out'
  | 'quad-in-out'
  | 'cubic-in'
  | 'cubic-out'
  | 'cubic-in-out'
  | 'smoothstep'
  | 'sine-in'
  | 'sine-out'
  | 'sine-in-out'
  | 'bounce-out'
  | 'spring';

export type EffectMotion = 'left-to-right' | 'right-to-left' | 'up-to-down' | 'down-to-up';

export type SpatialPatternSpec =
  | { kind: 'uniform' }
  | { kind: 'radial'; centerX: number; centerY: number }
  | { kind: 'diagonal'; direction: 'down-right' | 'down-left' | 'up-right' | 'up-left' }
  | { kind: 'checkerboard'; cellWidth: number; cellHeight: number }
  | { kind: 'columns'; reverse?: boolean }
  | { kind: 'rows'; reverse?: boolean }
  | { kind: 'organic'; seed: number };

export type EffectTarget =
  | { kind: 'component'; componentId: string }
  | { kind: 'region'; componentId: string; region: 'content' | 'border' | 'inner' | 'outer' }
  | { kind: 'rect'; x: number; y: number; width: number; height: number }
  | { kind: 'cells'; componentId: string; filter: CellFilterSpec };

export type CellFilterSpec =
  | { kind: 'all' }
  | { kind: 'text' }
  | { kind: 'foreground'; color: string }
  | { kind: 'background'; color: string }
  | { kind: 'position'; x?: number; y?: number; width?: number; height?: number }
  | { kind: 'not'; filter: CellFilterSpec }
  | { kind: 'all-of'; filters: CellFilterSpec[] }
  | { kind: 'any-of'; filters: CellFilterSpec[] };

export type EffectTrigger =
  | { kind: 'mount' }
  | { kind: 'show' }
  | { kind: 'focus' }
  | { kind: 'blur' }
  | { kind: 'select' }
  | { kind: 'deselect' }
  | { kind: 'state-change'; state?: string }
  | { kind: 'key'; key: string }
  | { kind: 'event'; event: string }
  | { kind: 'manual'; name?: string };

export interface PrimitiveEffectNode {
  kind: 'primitive';
  id: EffectId;
  effect: TachyonFxPrimitive;
  durationMs: number;
  interpolation: EffectInterpolation;
  motion?: EffectMotion;
  parameters: Record<string, string | number | boolean>;
  spatialPattern?: SpatialPatternSpec;
}

export interface SequenceEffectNode {
  kind: 'sequence';
  id: EffectId;
  children: EffectGraphNode[];
}

export interface ParallelEffectNode {
  kind: 'parallel';
  id: EffectId;
  children: EffectGraphNode[];
}

export interface DelayEffectNode {
  kind: 'delay';
  id: EffectId;
  durationMs: number;
  child: EffectGraphNode;
}

export interface RepeatEffectNode {
  kind: 'repeat';
  id: EffectId;
  mode: 'count' | 'forever' | 'ping-pong';
  count?: number;
  child: EffectGraphNode;
}

export type EffectGraphNode =
  | PrimitiveEffectNode
  | SequenceEffectNode
  | ParallelEffectNode
  | DelayEffectNode
  | RepeatEffectNode;

export interface ReducedMotionVariant {
  mode: 'inherit' | 'replace' | 'disable';
  graph?: EffectGraphNode;
}

export interface EffectDefinition {
  id: EffectId;
  name: string;
  enabled: boolean;
  target: EffectTarget;
  trigger: EffectTrigger;
  graph: EffectGraphNode;
  reducedMotion: ReducedMotionVariant;
  tags?: string[];
  notes?: string;
}

export interface EffectPlaybackSettings {
  mode: 'normal' | 'reduced';
  speed: number;
  loopPreview: boolean;
}

export interface ImageAssetDefinition {
  id: string;
  name: string;
  source: string;
  alt?: string;
  fit: 'contain' | 'cover' | 'stretch' | 'original';
  alignment: 'start' | 'center' | 'end';
  protocol: 'auto' | 'kitty' | 'sixel' | 'iterm2' | 'halfblocks';
  fallback: 'placeholder' | 'alt-text' | 'hidden';
}

export interface RatatuiRuntimeLibraries {
  ratatui?: string;
  tachyonfx: string;
  ratatuiTextarea: string;
  tuiWidgets: string;
  ratatuiImage: string;
  mousefood?: string;
  ansiToTui?: string;
  optional: string[];
}

export const DEFAULT_RATATUI_RUNTIME_LIBRARIES: RatatuiRuntimeLibraries = {
  ratatui: '0.30.2',
  tachyonfx: '0.25.1',
  ratatuiTextarea: '0.9.2',
  tuiWidgets: '0.7.10',
  ratatuiImage: '11.0.6',
  mousefood: '0.5.2',
  ansiToTui: '8.0.1',
  optional: [
    'tui-tree-widget',
    'tui-widget-list',
    'tui-term',
    'ratatui-interact',
    'tui-syntax-highlight',
    'tui-nodes',
    'termprofile',
  ],
};

export function makeEffectId(prefix = 'fx'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function makePrimitiveEffect(
  componentId: string,
  effect: TachyonFxPrimitive = 'fade_from',
  name = 'Fade in'
): EffectDefinition {
  const id = makeEffectId('effect');
  return {
    id,
    name,
    enabled: true,
    target: { kind: 'component', componentId },
    trigger: { kind: 'mount' },
    graph: {
      kind: 'primitive',
      id: makeEffectId('node'),
      effect,
      durationMs: 180,
      interpolation: 'smoothstep',
      parameters: {},
    },
    reducedMotion: {
      mode: 'replace',
      graph: {
        kind: 'primitive',
        id: makeEffectId('node'),
        effect: 'fade_from',
        durationMs: 100,
        interpolation: 'smoothstep',
        parameters: {},
      },
    },
  };
}

function legacyTrigger(trigger: AnimationTrigger): EffectTrigger {
  switch (trigger) {
    case 'on-focus': return { kind: 'focus' };
    case 'on-blur': return { kind: 'blur' };
    case 'on-select': return { kind: 'select' };
    case 'on-change': return { kind: 'state-change' };
    case 'manual': return { kind: 'manual' };
    case 'on-exit': return { kind: 'event', event: 'exit' };
    case 'on-loading': return { kind: 'state-change', state: 'loading' };
    case 'on-success': return { kind: 'state-change', state: 'success' };
    case 'on-error': return { kind: 'state-change', state: 'error' };
    case 'on-enter':
    default: return { kind: 'mount' };
  }
}

function legacyPrimitive(animation: AnimationSpec): TachyonFxPrimitive {
  switch (animation.effect) {
    case 'slide': return 'slide_in';
    case 'wipe':
    case 'typewriter': return 'sweep_in';
    case 'dissolve':
    case 'glitch': return 'dissolve';
    case 'highlight': return 'fade_to_fg';
    case 'pulse': return 'fade_to_fg';
    case 'spring':
    case 'fade':
    default: return 'fade_from';
  }
}

function legacyInterpolation(easing: AnimationEasing): EffectInterpolation {
  switch (easing) {
    case 'ease-in': return 'quad-in';
    case 'ease-out': return 'quad-out';
    case 'ease-in-out': return 'quad-in-out';
    case 'spring': return 'spring';
    case 'linear': return 'linear';
    default: return 'smoothstep';
  }
}

function legacyMotion(direction: AnimationDirection): EffectMotion | undefined {
  switch (direction) {
    case 'left': return 'left-to-right';
    case 'right': return 'right-to-left';
    case 'up': return 'up-to-down';
    case 'down': return 'down-to-up';
    default: return undefined;
  }
}

export function legacyAnimationToEffect(componentId: string, animation: AnimationSpec): EffectDefinition {
  const primitive: PrimitiveEffectNode = {
    kind: 'primitive',
    id: makeEffectId('node'),
    effect: legacyPrimitive(animation),
    durationMs: Math.max(0, animation.durationMs),
    interpolation: legacyInterpolation(animation.easing),
    motion: legacyMotion(animation.direction),
    parameters: {
      legacyEffect: animation.effect,
      ...(typeof animation.intensity === 'number' ? { intensity: animation.intensity } : {}),
    },
  };
  const graph: EffectGraphNode = animation.delayMs > 0
    ? { kind: 'delay', id: makeEffectId('delay'), durationMs: animation.delayMs, child: primitive }
    : primitive;
  return {
    id: animation.id,
    name: animation.name,
    enabled: animation.enabled,
    target: { kind: 'component', componentId },
    trigger: legacyTrigger(animation.trigger),
    graph: animation.loop
      ? { kind: 'repeat', id: makeEffectId('repeat'), mode: 'forever', child: graph }
      : graph,
    reducedMotion: animation.reducedMotionEffect === 'none'
      ? { mode: 'disable' }
      : {
          mode: 'replace',
          graph: {
            kind: 'primitive',
            id: makeEffectId('reduced'),
            effect: animation.reducedMotionEffect === 'highlight' ? 'fade_to_fg' : 'fade_from',
            durationMs: Math.min(120, Math.max(0, animation.durationMs)),
            interpolation: 'smoothstep',
            parameters: {},
          },
        },
    notes: animation.tachyonFxHint,
  };
}

/** Compatibility shim so the existing Canvas can preview a representative leaf while v3 evolves. */
export function effectToLegacyAnimation(effect: EffectDefinition): AnimationSpec {
  const findPrimitive = (node: EffectGraphNode): PrimitiveEffectNode | undefined => {
    if (node.kind === 'primitive') return node;
    if (node.kind === 'delay' || node.kind === 'repeat') return findPrimitive(node.child);
    return node.children.map(findPrimitive).find(Boolean);
  };
  const primitive = findPrimitive(effect.graph) ?? {
    kind: 'primitive' as const,
    id: 'fallback',
    effect: 'fade_from' as const,
    durationMs: 180,
    interpolation: 'smoothstep' as const,
    parameters: {},
  };
  const direction: AnimationDirection = primitive.motion === 'right-to-left'
    ? 'right'
    : primitive.motion === 'up-to-down'
      ? 'up'
      : primitive.motion === 'down-to-up'
        ? 'down'
        : primitive.motion === 'left-to-right'
          ? 'left'
          : 'none';
  const animationEffect: AnimationSpec['effect'] = primitive.effect.startsWith('slide')
    ? 'slide'
    : primitive.effect.startsWith('sweep')
      ? 'wipe'
      : primitive.effect === 'dissolve' || primitive.effect === 'coalesce' || primitive.effect === 'evolve'
        ? 'dissolve'
        : primitive.effect === 'fade_to_fg'
          ? 'highlight'
          : 'fade';
  const trigger: AnimationTrigger = effect.trigger.kind === 'focus'
    ? 'on-focus'
    : effect.trigger.kind === 'blur'
      ? 'on-blur'
      : effect.trigger.kind === 'select'
        ? 'on-select'
        : effect.trigger.kind === 'state-change'
          ? effect.trigger.state === 'loading'
            ? 'on-loading'
            : effect.trigger.state === 'success'
              ? 'on-success'
              : effect.trigger.state === 'error'
                ? 'on-error'
                : 'on-change'
          : effect.trigger.kind === 'manual'
            ? 'manual'
            : 'on-enter';
  return {
    id: effect.id,
    name: effect.name,
    trigger,
    effect: animationEffect,
    durationMs: primitive.durationMs,
    delayMs: effect.graph.kind === 'delay' ? effect.graph.durationMs : 0,
    easing: primitive.interpolation === 'linear'
      ? 'linear'
      : primitive.interpolation === 'quad-in'
        ? 'ease-in'
        : primitive.interpolation === 'quad-out'
          ? 'ease-out'
          : primitive.interpolation === 'quad-in-out'
            ? 'ease-in-out'
            : primitive.interpolation === 'spring'
              ? 'spring'
              : 'smoothstep',
    direction,
    enabled: effect.enabled,
    loop: effect.graph.kind === 'repeat' && effect.graph.mode === 'forever',
    reducedMotionEffect: effect.reducedMotion.mode === 'disable' ? 'none' : 'fade',
    tachyonFxHint: effect.notes,
  };
}
