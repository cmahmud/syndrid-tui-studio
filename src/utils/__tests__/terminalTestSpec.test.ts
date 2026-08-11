import { describe, expect, it } from 'vitest';
import type { ComponentNode } from '../../types';
import { makePrimitiveEffect } from '../../types';
import { normalizeProjectData } from '../../stores/projectStore';
import { buildTerminalTestSpec } from '../terminalTestSpec';

function node(id: string, type: ComponentNode['type'], props: Record<string, unknown>, children: ComponentNode[] = []): ComponentNode {
  return {
    id, type, name: id, props,
    layout: { type: type === 'Screen' ? 'absolute' : 'flexbox', x: 1, y: 1 },
    style: { border: true }, events: {}, children,
    locked: false, hidden: false, collapsed: false,
  };
}

function design(): ComponentNode {
  const progress = node('progress', 'ProgressBar', { width: 30, height: 3, value: 0, max: 100 });
  const list = node('list', 'List', { width: 30, height: 8, items: ['one'] });
  const effect = makePrimitiveEffect('progress', 'dissolve', 'Progress appear');
  effect.id = 'progress-appear';
  progress.prototype = { effects: [effect] };
  return node('root', 'Screen', { width: 80, height: 24 }, [progress, list]);
}

describe('terminal test spec', () => {
  it('uses the selected committed viewport and canonical enabled motion', () => {
    const project = normalizeProjectData({ terminalTest: { viewportId: 'narrow', scenarioId: 'loading' } as never });
    const spec = buildTerminalTestSpec(design(), project);
    expect(spec.schema).toBe('syndrid-terminal-test/v1');
    expect(spec.viewport).toMatchObject({ id: 'narrow', width: 80, height: 24 });
    expect(spec.motion.map((motion) => motion.effectId)).toEqual(['progress-appear']);
    expect(spec.nodes.every((entry) => Number.isInteger(entry.rect.x) && Number.isInteger(entry.rect.y))).toBe(true);
  });

  it('generates large mock data deterministically from the scenario seed', () => {
    const project = normalizeProjectData({ terminalTest: { viewportId: 'narrow', scenarioId: 'large-data', fakeData: true } as never });
    const first = buildTerminalTestSpec(design(), project);
    const second = buildTerminalTestSpec(design(), project);
    const listA = first.nodes.find((entry) => entry.id === 'list')!;
    const listB = second.nodes.find((entry) => entry.id === 'list')!;
    expect(listA.props.items).toEqual(listB.props.items);
    expect(listA.props.items).toHaveLength(40);
  });

  it('does not mutate the editor source tree while applying fake scenarios', () => {
    const root = design();
    const before = structuredClone(root);
    const project = normalizeProjectData({ terminalTest: { viewportId: 'narrow', scenarioId: 'unicode', fakeData: true } as never });
    buildTerminalTestSpec(root, project);
    expect(root).toEqual(before);
  });

  it('applies custom scenario component overrides and timeline data', () => {
    const project = normalizeProjectData({
      testScenarios: [{
        id: 'custom', name: 'Custom', preset: 'custom', seed: 1, durationMs: 2000,
        variables: { components: { progress: { props: { value: 55 } } } },
        timeline: [{ atMs: 1000, componentId: 'progress', property: 'value', value: 100 }],
      }],
      terminalTest: { viewportId: 'narrow', scenarioId: 'custom:custom', fakeData: true } as never,
    });
    const spec = buildTerminalTestSpec(design(), project);
    expect(spec.nodes.find((entry) => entry.id === 'progress')?.props.value).toBe(55);
    expect(spec.scenario.timeline).toHaveLength(1);
  });
});
