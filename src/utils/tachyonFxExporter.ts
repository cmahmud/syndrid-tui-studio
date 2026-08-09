import type { AnimationEasing, AnimationSpec, ComponentNode } from '../types';

interface MotionRecord {
  componentId: string;
  componentName: string;
  animation: AnimationSpec;
}

function collect(node: ComponentNode | null, out: MotionRecord[] = []): MotionRecord[] {
  if (!node) return out;
  for (const animation of node.prototype?.animations ?? []) {
    if (animation.enabled) out.push({ componentId: node.id, componentName: node.name, animation });
  }
  node.children.forEach((child) => collect(child, out));
  return out;
}

function interpolation(easing: AnimationEasing): string {
  switch (easing) {
    case 'linear': return 'Interpolation::Linear';
    case 'ease-in': return 'Interpolation::QuadIn';
    case 'ease-out': return 'Interpolation::QuadOut';
    case 'ease-in-out': return 'Interpolation::QuadInOut';
    case 'spring': return 'Interpolation::Spring';
    case 'smoothstep':
    default: return 'Interpolation::SmoothStep';
  }
}

function motion(direction: AnimationSpec['direction']): string {
  switch (direction) {
    case 'right': return 'Motion::RightToLeft';
    case 'up': return 'Motion::UpToDown';
    case 'down': return 'Motion::DownToUp';
    case 'left':
    default: return 'Motion::LeftToRight';
  }
}

/**
 * Emit a TachyonFX expression using the declarative APIs available in 0.25.x.
 * The result is deliberately conservative: fancy design-time effects map onto
 * a small set of stable cell effects so production motion stays smooth and
 * predictable. The full authored intent remains in the Agent Spec.
 */
export function animationToTachyonFxDsl(animation: AnimationSpec, reducedMotion = false): string {
  const duration = reducedMotion ? Math.min(120, animation.durationMs) : animation.durationMs;
  const easing = reducedMotion ? 'Interpolation::SmoothStep' : interpolation(animation.easing);
  const timer = `EffectTimer::from_ms(${Math.max(0, Math.round(duration))}, ${easing})`;
  const direction = motion(animation.direction);

  if (reducedMotion) {
    switch (animation.reducedMotionEffect ?? 'none') {
      case 'fade': return `fx::fade_from(Color::Black, Color::Reset, ${timer})`;
      case 'highlight': return `fx::fade_from_fg(Color::Cyan, ${timer})`;
      default: return 'fx::consume_tick()';
    }
  }

  let effect: string;
  switch (animation.effect) {
    case 'slide':
      effect = `fx::slide_in(${direction}, 8, 0, Color::Black, ${timer})`;
      break;
    case 'wipe':
    case 'typewriter':
      effect = `fx::sweep_in(${direction}, 10, 0, Color::Black, ${timer})`;
      break;
    case 'dissolve':
    case 'glitch':
      // A deterministic dissolve is the safe production fallback for glitch;
      // the Agent Spec retains the requested glitch intent for a custom effect.
      effect = `fx::dissolve(${timer})`;
      break;
    case 'pulse': {
      const half = Math.max(1, Math.round(duration / 2));
      effect = `fx::sequence(&[fx::fade_to_fg(Color::Cyan, ${half}), fx::fade_from_fg(Color::Cyan, ${half})])`;
      break;
    }
    case 'highlight': {
      const half = Math.max(1, Math.round(duration / 2));
      effect = `fx::sequence(&[fx::fade_to_fg(Color::Yellow, ${half}), fx::fade_from_fg(Color::Yellow, ${half})])`;
      break;
    }
    case 'spring':
      effect = `fx::fade_from(Color::Black, Color::Reset, EffectTimer::from_ms(${Math.max(0, Math.round(duration))}, Interpolation::Spring))`;
      break;
    case 'fade':
    default:
      effect = `fx::fade_from(Color::Black, Color::Reset, ${timer})`;
      break;
  }

  if (animation.loop) effect = `fx::repeating(${effect})`;
  return effect;
}

export function exportTachyonFxMotionPlan(root: ComponentNode | null): string {
  const records = collect(root);
  const lines = [
    '// Syndrid TUI Studio — TachyonFX motion plan',
    '// Target: tachyonfx 0.25.x APIs; integrate with Syndrid’s pinned Ratatui version after compatibility verification.',
    '// Apply effects to the recorded component Rect after rendering. Keep the event loop non-blocking.',
    '// delayMs is scheduler metadata: start the effect after the delay rather than sleeping the UI thread.',
    'use ratatui::style::Color;',
    'use tachyonfx::{fx, EffectTimer, Interpolation, Motion};',
    '',
  ];

  if (records.length === 0) {
    lines.push('// No enabled motion has been authored yet.');
    return lines.join('\n');
  }

  for (const { componentId, componentName, animation } of records) {
    const fnName = `motion_${animation.id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    lines.push(`// ${componentName} (${componentId}) · trigger=${animation.trigger} · delay=${animation.delayMs}ms`);
    if (animation.tachyonFxHint) lines.push(`// intent: ${animation.tachyonFxHint.replace(/\r?\n/g, ' ')}`);
    lines.push(`fn ${fnName}() -> tachyonfx::Effect {`);
    lines.push(`    ${animationToTachyonFxDsl(animation)}`);
    lines.push('}');
    lines.push(`// reduced-motion: ${animationToTachyonFxDsl(animation, true)}`);
    lines.push('');
  }

  return lines.join('\n');
}
