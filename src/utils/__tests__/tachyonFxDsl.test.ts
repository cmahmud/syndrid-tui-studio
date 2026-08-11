import { describe, expect, it } from 'vitest';
import type { EffectDefinition } from '../../types';
import { effectToTachyonFxDsl, tachyonFxDslToGraph, validateTachyonFxDsl } from '../tachyonFxDsl';

const effect: EffectDefinition = {
  id: 'demo',
  name: 'Demo',
  enabled: true,
  target: { kind: 'component', componentId: 'root' },
  trigger: { kind: 'mount' },
  graph: {
    kind: 'sequence',
    id: 'seq',
    children: [
      { kind: 'primitive', id: 'fade', effect: 'fade_from', durationMs: 120, interpolation: 'smoothstep', parameters: { from: 'Black', to: 'Reset' } },
      { kind: 'parallel', id: 'parallel', children: [
        { kind: 'primitive', id: 'slide', effect: 'slide_in', durationMs: 200, interpolation: 'quad-out', motion: 'left-to-right', parameters: { distance: 8 } },
        { kind: 'primitive', id: 'highlight', effect: 'fade_to_fg', durationMs: 200, interpolation: 'linear', parameters: { color: 'Cyan' } },
      ] },
    ],
  },
  reducedMotion: {
    mode: 'replace',
    graph: { kind: 'primitive', id: 'reduced', effect: 'fade_from', durationMs: 80, interpolation: 'linear', parameters: {} },
  },
};

describe('TachyonFX DSL', () => {
  it('serializes sequence and parallel composition', () => {
    const dsl = effectToTachyonFxDsl(effect);
    expect(dsl).toContain('fx::sequence');
    expect(dsl).toContain('fx::parallel');
    expect(dsl).toContain('fx::slide_in');
  });

  it('serializes the reduced-motion graph independently', () => {
    expect(effectToTachyonFxDsl(effect, true)).toContain('80');
  });

  it('reports malformed delimiters', () => {
    const validation = validateTachyonFxDsl('fx::sequence(&[fx::dissolve(');
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  it('preserves unknown valid DSL as a custom graph node', () => {
    const graph = tachyonFxDslToGraph('fx::my_custom_effect()');
    expect(graph.kind).toBe('primitive');
    if (graph.kind === 'primitive') {
      expect(graph.effect).toBe('custom');
      expect(graph.parameters.dsl).toBe('fx::my_custom_effect()');
    }
  });
});
