import type { CSSProperties } from 'react';
import type {
  EffectDefinition,
  EffectGraphNode,
  EffectInterpolation,
  PrimitiveEffectNode,
} from '../types/effects';

export interface EvaluatedPrimitive {
  node: PrimitiveEffectNode;
  progress: number;
  localTimeMs: number;
}

export interface EvaluatedEffectFrame {
  totalDurationMs: number;
  timeMs: number;
  finished: boolean;
  active: EvaluatedPrimitive[];
}

const INFINITE_PREVIEW_MS = 10_000;

export function effectGraphDuration(node: EffectGraphNode): number {
  switch (node.kind) {
    case 'primitive':
      return Math.max(0, node.durationMs);
    case 'delay':
      return Math.max(0, node.durationMs) + effectGraphDuration(node.child);
    case 'sequence':
      return node.children.reduce((sum, child) => sum + effectGraphDuration(child), 0);
    case 'parallel':
      return node.children.reduce((max, child) => Math.max(max, effectGraphDuration(child)), 0);
    case 'repeat': {
      const child = effectGraphDuration(node.child);
      if (node.mode === 'forever') return INFINITE_PREVIEW_MS;
      if (node.mode === 'ping-pong') return child * Math.max(2, (node.count ?? 1) * 2);
      return child * Math.max(1, node.count ?? 1);
    }
  }
}

function evaluateNode(node: EffectGraphNode, timeMs: number, out: EvaluatedPrimitive[]): void {
  if (timeMs < 0) return;
  switch (node.kind) {
    case 'primitive': {
      const duration = Math.max(1, node.durationMs);
      if (timeMs > duration) return;
      out.push({ node, progress: Math.max(0, Math.min(1, timeMs / duration)), localTimeMs: timeMs });
      return;
    }
    case 'delay':
      evaluateNode(node.child, timeMs - Math.max(0, node.durationMs), out);
      return;
    case 'sequence': {
      let cursor = 0;
      for (const child of node.children) {
        const duration = effectGraphDuration(child);
        if (timeMs >= cursor && timeMs <= cursor + duration) {
          evaluateNode(child, timeMs - cursor, out);
          return;
        }
        cursor += duration;
      }
      return;
    }
    case 'parallel':
      node.children.forEach((child) => evaluateNode(child, timeMs, out));
      return;
    case 'repeat': {
      const childDuration = Math.max(1, effectGraphDuration(node.child));
      const cycles = node.mode === 'forever'
        ? Number.POSITIVE_INFINITY
        : node.mode === 'ping-pong'
          ? Math.max(2, (node.count ?? 1) * 2)
          : Math.max(1, node.count ?? 1);
      const cycleIndex = Math.floor(timeMs / childDuration);
      if (cycleIndex >= cycles) return;
      let local = timeMs % childDuration;
      if (node.mode === 'ping-pong' && cycleIndex % 2 === 1) local = childDuration - local;
      evaluateNode(node.child, local, out);
      return;
    }
  }
}

export function evaluateEffect(
  effect: EffectDefinition,
  timeMs: number,
  reducedMotion = false
): EvaluatedEffectFrame {
  const graph = reducedMotion
    ? effect.reducedMotion.mode === 'disable'
      ? undefined
      : effect.reducedMotion.mode === 'replace'
        ? effect.reducedMotion.graph
        : effect.graph
    : effect.graph;
  if (!graph || !effect.enabled) {
    return { totalDurationMs: 0, timeMs: 0, finished: true, active: [] };
  }
  const totalDurationMs = effectGraphDuration(graph);
  const bounded = Math.max(0, Math.min(timeMs, totalDurationMs));
  const active: EvaluatedPrimitive[] = [];
  evaluateNode(graph, bounded, active);
  return { totalDurationMs, timeMs: bounded, finished: bounded >= totalDurationMs, active };
}

function eased(progress: number, interpolation: EffectInterpolation): number {
  const t = Math.max(0, Math.min(1, progress));
  switch (interpolation) {
    case 'quad-in': return t * t;
    case 'quad-out': return 1 - (1 - t) * (1 - t);
    case 'quad-in-out': return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case 'cubic-in': return t * t * t;
    case 'cubic-out': return 1 - Math.pow(1 - t, 3);
    case 'cubic-in-out': return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case 'smoothstep': return t * t * (3 - 2 * t);
    case 'sine-in': return 1 - Math.cos((t * Math.PI) / 2);
    case 'sine-out': return Math.sin((t * Math.PI) / 2);
    case 'sine-in-out': return -(Math.cos(Math.PI * t) - 1) / 2;
    case 'bounce-out': {
      const n1 = 7.5625;
      const d1 = 2.75;
      if (t < 1 / d1) return n1 * t * t;
      if (t < 2 / d1) { const x = t - 1.5 / d1; return n1 * x * x + 0.75; }
      if (t < 2.5 / d1) { const x = t - 2.25 / d1; return n1 * x * x + 0.9375; }
      const x = t - 2.625 / d1;
      return n1 * x * x + 0.984375;
    }
    case 'spring': return Math.min(1, 1 - Math.cos(t * Math.PI * 3) * Math.exp(-5 * t));
    case 'linear':
    default: return t;
  }
}

export function primitivePreviewStyle(primitive: EvaluatedPrimitive): CSSProperties {
  const p = eased(primitive.progress, primitive.node.interpolation);
  const inverse = 1 - p;
  const style: CSSProperties = {};
  switch (primitive.node.effect) {
    case 'fade_from':
    case 'coalesce':
    case 'evolve':
      style.opacity = p;
      break;
    case 'fade_to':
    case 'dissolve':
      style.opacity = inverse;
      break;
    case 'fade_from_fg':
      style.opacity = 0.35 + p * 0.65;
      style.filter = `brightness(${0.65 + p * 0.35})`;
      break;
    case 'fade_to_fg':
    case 'lighten':
      style.filter = `brightness(${1 + p * Number(primitive.node.parameters.amount ?? 0.5)})`;
      break;
    case 'darken':
      style.filter = `brightness(${1 - p * Number(primitive.node.parameters.amount ?? 0.35)})`;
      break;
    case 'slide_in':
    case 'sweep_in':
    case 'translate': {
      const distance = Number(primitive.node.parameters.distance ?? primitive.node.parameters.cells ?? 8);
      const motion = primitive.node.motion ?? 'left-to-right';
      const x = motion === 'left-to-right' ? -distance * inverse : motion === 'right-to-left' ? distance * inverse : 0;
      const y = motion === 'up-to-down' ? -distance * inverse : motion === 'down-to-up' ? distance * inverse : 0;
      style.transform = `translate(${x}px, ${y}px)`;
      style.opacity = p;
      if (primitive.node.effect === 'sweep_in') style.clipPath = `inset(0 ${inverse * 100}% 0 0)`;
      break;
    }
    case 'slide_out':
    case 'sweep_out': {
      const distance = Number(primitive.node.parameters.distance ?? 8);
      const motion = primitive.node.motion ?? 'left-to-right';
      const x = motion === 'left-to-right' ? distance * p : motion === 'right-to-left' ? -distance * p : 0;
      const y = motion === 'up-to-down' ? distance * p : motion === 'down-to-up' ? -distance * p : 0;
      style.transform = `translate(${x}px, ${y}px)`;
      style.opacity = inverse;
      if (primitive.node.effect === 'sweep_out') style.clipPath = `inset(0 0 0 ${p * 100}%)`;
      break;
    }
    case 'explode':
      style.transform = `scale(${1 + p * 0.12})`;
      style.filter = `blur(${p * 1.5}px)`;
      style.opacity = inverse;
      break;
    case 'expand':
      style.transform = `scale(${0.9 + p * 0.1})`;
      style.opacity = p;
      break;
    case 'stretch':
      style.transform = `scaleX(${0.75 + p * 0.25})`;
      style.opacity = p;
      break;
    case 'hsl_shift':
      style.filter = `hue-rotate(${Number(primitive.node.parameters.hue ?? 30) * p}deg)`;
      break;
    case 'paint':
      style.opacity = 0.45 + p * 0.55;
      break;
    case 'consume_tick':
    case 'custom':
    default:
      break;
  }
  return style;
}

export function mergePreviewStyles(active: EvaluatedPrimitive[]): CSSProperties {
  return active.reduce<CSSProperties>((merged, primitive) => ({ ...merged, ...primitivePreviewStyle(primitive) }), {});
}
