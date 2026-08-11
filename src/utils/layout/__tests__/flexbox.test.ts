import { describe, it, expect } from 'vitest';
import type { ComponentNode } from '../../../types';
import { calculateFlexboxLayout } from '../flexbox';

function textNode(id: string, props: Record<string, unknown> = {}, hidden = false): ComponentNode {
  return {
    id,
    type: 'Text',
    name: id,
    props,
    layout: { type: 'flexbox' },
    style: {},
    events: {},
    children: [],
    locked: false,
    hidden,
    collapsed: false,
  };
}

function box(children: ComponentNode[], layoutOverrides: Record<string, unknown> = {}): ComponentNode {
  return {
    id: 'box',
    type: 'Box',
    name: 'Box',
    props: {},
    layout: { type: 'flexbox', direction: 'row', justify: 'start', gap: 1, padding: 1, ...layoutOverrides },
    style: {},
    events: {},
    children,
    locked: false,
    hidden: false,
    collapsed: false,
  };
}

describe('calculateFlexboxLayout', () => {
  it('stretches items with no explicit cross-axis size to fill the container', () => {
    const layouts = calculateFlexboxLayout(box([textNode('a'), textNode('b')], { align: 'stretch' }), 40, 12);
    expect(layouts.get('a')!.height).toBe(10);
    expect(layouts.get('b')!.height).toBe(10);
  });

  it('does not override an item with an explicit cross-axis size', () => {
    const layouts = calculateFlexboxLayout(
      box([textNode('a'), textNode('b', { height: 4 })], { align: 'stretch' }),
      40,
      12
    );
    expect(layouts.get('a')!.height).toBe(10);
    expect(layouts.get('b')!.height).toBe(4);
  });

  it('leaves start/center/end cross-axis behavior unchanged', () => {
    for (const align of ['start', 'center', 'end']) {
      const layouts = calculateFlexboxLayout(box([textNode('a'), textNode('b')], { align }), 40, 12);
      expect(layouts.get('a')!.height).not.toBe(10);
    }
  });

  it('never produces fractional terminal-cell coordinates for centered content', () => {
    const layouts = calculateFlexboxLayout(
      box([textNode('a', { width: 4, height: 1 })], { justify: 'center', padding: 0, gap: 0 }),
      11,
      3
    );
    const layout = layouts.get('a')!;
    expect(Number.isInteger(layout.x)).toBe(true);
    expect(Number.isInteger(layout.y)).toBe(true);
    expect(layout.x).toBe(3);
  });

  it('distributes space-around without fractional positions', () => {
    const layouts = calculateFlexboxLayout(
      box([textNode('a', { width: 2 }), textNode('b', { width: 2 }), textNode('c', { width: 2 })], {
        justify: 'space-around', padding: 0, gap: 0,
      }),
      13,
      3
    );
    expect([...layouts.values()].every((layout) => Number.isInteger(layout.x))).toBe(true);
    const last = layouts.get('c')!;
    expect(last.x + last.width).toBeLessThanOrEqual(13);
  });

  it('removes hidden children from sizing and gap calculations', () => {
    const layouts = calculateFlexboxLayout(
      box([
        textNode('visible-a', { width: 3 }),
        textNode('hidden', { width: 99 }, true),
        textNode('visible-b', { width: 3 }),
      ], { padding: 0, gap: 2 }),
      20,
      3
    );
    expect(layouts.has('hidden')).toBe(false);
    expect(layouts.get('visible-a')!.x).toBe(0);
    expect(layouts.get('visible-b')!.x).toBe(5);
  });
});
