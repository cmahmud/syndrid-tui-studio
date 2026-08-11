import { describe, expect, it } from 'vitest';
import type { EffectDefinition, EffectGraphNode } from '../../types';
import { effectGraphDuration, evaluateEffect } from '../effectRuntime';

const primitive = (id: string, durationMs: number): EffectGraphNode => ({
  kind: 'primitive', id, effect: 'fade_from', durationMs, interpolation: 'linear', parameters: {},
});

const definition = (graph: EffectGraphNode): EffectDefinition => ({
  id: 'effect', name: 'test', enabled: true,
  target: { kind: 'component', componentId: 'button' },
  trigger: { kind: 'mount' }, graph,
  reducedMotion: { mode: 'replace', graph: primitive('reduced', 80) },
});

describe('effect runtime', () => {
  it('computes sequence duration and active child deterministically', () => {
    const graph: EffectGraphNode = { kind: 'sequence', id: 'seq', children: [primitive('a', 100), primitive('b', 200)] };
    expect(effectGraphDuration(graph)).toBe(300);
    const frame = evaluateEffect(definition(graph), 150);
    expect(frame.active).toHaveLength(1);
    expect(frame.active[0].node.id).toBe('b');
    expect(frame.active[0].progress).toBeCloseTo(0.25);
  });

  it('runs parallel children together', () => {
    const graph: EffectGraphNode = { kind: 'parallel', id: 'parallel', children: [primitive('a', 100), primitive('b', 200)] };
    expect(effectGraphDuration(graph)).toBe(200);
    const frame = evaluateEffect(definition(graph), 50);
    expect(frame.active.map((item) => item.node.id).sort()).toEqual(['a', 'b']);
  });

  it('selects the reduced-motion replacement', () => {
    const frame = evaluateEffect(definition(primitive('normal', 500)), 40, true);
    expect(frame.totalDurationMs).toBe(80);
    expect(frame.active[0].node.id).toBe('reduced');
  });

  it('honors disabled reduced motion', () => {
    const effect = definition(primitive('normal', 500));
    effect.reducedMotion = { mode: 'disable' };
    expect(evaluateEffect(effect, 20, true).active).toEqual([]);
  });
});
