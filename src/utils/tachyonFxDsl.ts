import type {
  EffectDefinition,
  EffectGraphNode,
  EffectInterpolation,
  EffectMotion,
  PrimitiveEffectNode,
  SpatialPatternSpec,
} from '../types/effects';

const interpolationMap: Record<EffectInterpolation, string> = {
  linear: 'Interpolation::Linear',
  'quad-in': 'Interpolation::QuadIn',
  'quad-out': 'Interpolation::QuadOut',
  'quad-in-out': 'Interpolation::QuadInOut',
  'cubic-in': 'Interpolation::CubicIn',
  'cubic-out': 'Interpolation::CubicOut',
  'cubic-in-out': 'Interpolation::CubicInOut',
  smoothstep: 'Interpolation::SmoothStep',
  'sine-in': 'Interpolation::SineIn',
  'sine-out': 'Interpolation::SineOut',
  'sine-in-out': 'Interpolation::SineInOut',
  'bounce-out': 'Interpolation::BounceOut',
  spring: 'Interpolation::Spring',
};

const motionMap: Record<EffectMotion, string> = {
  'left-to-right': 'Motion::LeftToRight',
  'right-to-left': 'Motion::RightToLeft',
  'up-to-down': 'Motion::UpToDown',
  'down-to-up': 'Motion::DownToUp',
};

function timer(node: PrimitiveEffectNode): string {
  return `EffectTimer::from_ms(${Math.max(0, Math.round(node.durationMs))}, ${interpolationMap[node.interpolation]})`;
}

function color(value: unknown, fallback: string): string {
  const raw = String(value ?? fallback).replace(/[^A-Za-z0-9_]/g, '');
  return `Color::${raw || fallback}`;
}

function spatial(pattern?: SpatialPatternSpec): string | undefined {
  if (!pattern || pattern.kind === 'uniform') return undefined;
  switch (pattern.kind) {
    case 'radial': return `Pattern::Radial { center: (${pattern.centerX}, ${pattern.centerY}) }`;
    case 'diagonal': return `Pattern::Diagonal(DiagonalDirection::${pattern.direction.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase())})`;
    case 'checkerboard': return `Pattern::Checkerboard { cell_width: ${Math.max(1, pattern.cellWidth)}, cell_height: ${Math.max(1, pattern.cellHeight)} }`;
    case 'columns': return `Pattern::Columns { reverse: ${!!pattern.reverse} }`;
    case 'rows': return `Pattern::Rows { reverse: ${!!pattern.reverse} }`;
    case 'organic': return `Pattern::Organic { seed: ${Math.round(pattern.seed)} }`;
    default: return undefined;
  }
}

export function primitiveToTachyonFxDsl(node: PrimitiveEffectNode): string {
  const t = timer(node);
  const motion = motionMap[node.motion ?? 'left-to-right'];
  let expression: string;
  switch (node.effect) {
    case 'fade_from': expression = `fx::fade_from(${color(node.parameters.from, 'Black')}, ${color(node.parameters.to, 'Reset')}, ${t})`; break;
    case 'fade_to': expression = `fx::fade_to(${color(node.parameters.from, 'Reset')}, ${color(node.parameters.to, 'Black')}, ${t})`; break;
    case 'fade_from_fg': expression = `fx::fade_from_fg(${color(node.parameters.color, 'Cyan')}, ${t})`; break;
    case 'fade_to_fg': expression = `fx::fade_to_fg(${color(node.parameters.color, 'Cyan')}, ${t})`; break;
    case 'dissolve': expression = `fx::dissolve(${t})`; break;
    case 'coalesce': expression = `fx::coalesce(${t})`; break;
    case 'evolve': expression = `fx::evolve(${t})`; break;
    case 'slide_in': expression = `fx::slide_in(${motion}, ${Math.round(Number(node.parameters.distance ?? 8))}, 0, Color::Black, ${t})`; break;
    case 'slide_out': expression = `fx::slide_out(${motion}, ${Math.round(Number(node.parameters.distance ?? 8))}, 0, Color::Black, ${t})`; break;
    case 'sweep_in': expression = `fx::sweep_in(${motion}, ${Math.round(Number(node.parameters.width ?? 10))}, 0, Color::Black, ${t})`; break;
    case 'sweep_out': expression = `fx::sweep_out(${motion}, ${Math.round(Number(node.parameters.width ?? 10))}, 0, Color::Black, ${t})`; break;
    case 'consume_tick': expression = 'fx::consume_tick()'; break;
    case 'custom': expression = String(node.parameters.dsl ?? 'fx::consume_tick()'); break;
    case 'paint': expression = `fx::fade_to_fg(${color(node.parameters.fg, 'Cyan')}, ${t})`; break;
    case 'darken': expression = `fx::darken(${Number(node.parameters.amount ?? 0.35)}, ${t})`; break;
    case 'lighten': expression = `fx::lighten(${Number(node.parameters.amount ?? 0.35)}, ${t})`; break;
    case 'hsl_shift': expression = `fx::hsl_shift(${Number(node.parameters.hue ?? 30)}, ${Number(node.parameters.saturation ?? 0)}, ${Number(node.parameters.lightness ?? 0)}, ${t})`; break;
    case 'explode': expression = `fx::explode(${t})`; break;
    case 'expand': expression = `fx::expand(${t})`; break;
    case 'stretch': expression = `fx::stretch(${motion}, ${t})`; break;
    case 'translate': expression = `fx::translate(${motion}, ${Math.round(Number(node.parameters.cells ?? 4))}, ${t})`; break;
    default: expression = `fx::consume_tick()`;
  }
  const pattern = spatial(node.spatialPattern);
  return pattern ? `${expression}.with_pattern(${pattern})` : expression;
}

export function graphToTachyonFxDsl(node: EffectGraphNode): string {
  switch (node.kind) {
    case 'primitive': return primitiveToTachyonFxDsl(node);
    case 'sequence': return `fx::sequence(&[${node.children.map(graphToTachyonFxDsl).join(', ')}])`;
    case 'parallel': return `fx::parallel(&[${node.children.map(graphToTachyonFxDsl).join(', ')}])`;
    case 'delay': return `fx::sequence(&[fx::delay(${Math.max(0, Math.round(node.durationMs))}), ${graphToTachyonFxDsl(node.child)}])`;
    case 'repeat': {
      const child = graphToTachyonFxDsl(node.child);
      if (node.mode === 'forever') return `fx::repeating(${child})`;
      if (node.mode === 'ping-pong') return `fx::repeat(fx::ping_pong(${child}), ${Math.max(1, node.count ?? 1)})`;
      return `fx::repeat(${child}, ${Math.max(1, node.count ?? 1)})`;
    }
  }
}

export function effectToTachyonFxDsl(effect: EffectDefinition, reduced = false): string {
  if (reduced) {
    if (effect.reducedMotion.mode === 'disable') return 'fx::consume_tick()';
    if (effect.reducedMotion.mode === 'replace' && effect.reducedMotion.graph) return graphToTachyonFxDsl(effect.reducedMotion.graph);
  }
  return graphToTachyonFxDsl(effect.graph);
}

export interface DslValidationResult {
  valid: boolean;
  errors: Array<{ line: number; column: number; message: string }>;
  warnings: string[];
}

/** Lightweight Studio-side validation. Production code still compiles against TachyonFX itself. */
export function validateTachyonFxDsl(source: string): DslValidationResult {
  const errors: DslValidationResult['errors'] = [];
  let depth = 0;
  let line = 1;
  let column = 0;
  for (const ch of source) {
    if (ch === '\n') { line += 1; column = 0; continue; }
    column += 1;
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    if (depth < 0) {
      errors.push({ line, column, message: 'Unexpected closing delimiter' });
      depth = 0;
    }
  }
  if (depth !== 0) errors.push({ line, column: Math.max(1, column), message: 'Unbalanced delimiters' });
  if (!/fx::[A-Za-z_][A-Za-z0-9_]*/.test(source)) errors.push({ line: 1, column: 1, message: 'Expected a TachyonFX fx:: expression' });
  return {
    valid: errors.length === 0,
    errors,
    warnings: source.includes('custom') ? ['Custom DSL may not round-trip through the visual graph.'] : [],
  };
}

/**
 * Import a useful, deliberately bounded DSL subset. Unknown expressions become a custom primitive
 * instead of being destroyed, so the visual editor remains lossless at the wrapper level.
 */
export function tachyonFxDslToGraph(source: string, fallbackDurationMs = 180): EffectGraphNode {
  const trimmed = source.trim();
  const id = `dsl-${Date.now().toString(36)}`;
  const known = ['fade_from', 'fade_to', 'fade_from_fg', 'fade_to_fg', 'dissolve', 'coalesce', 'evolve', 'slide_in', 'slide_out', 'sweep_in', 'sweep_out', 'consume_tick'] as const;
  const match = trimmed.match(/fx::([A-Za-z_][A-Za-z0-9_]*)/);
  const name = match?.[1];
  if (name && known.includes(name as (typeof known)[number])) {
    return {
      kind: 'primitive',
      id,
      effect: name as PrimitiveEffectNode['effect'],
      durationMs: fallbackDurationMs,
      interpolation: 'smoothstep',
      parameters: {},
    };
  }
  return {
    kind: 'primitive',
    id,
    effect: 'custom',
    durationMs: fallbackDurationMs,
    interpolation: 'linear',
    parameters: { dsl: trimmed || 'fx::consume_tick()' },
  };
}
