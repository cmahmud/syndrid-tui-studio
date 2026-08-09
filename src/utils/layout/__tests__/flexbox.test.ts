import { describe, it, expect } from 'vitest';
import type { ComponentNode } from '../../../types';
import { calculateFlexboxLayout } from '../flexbox';

function textNode(id: string, props: Record<string, unknown> = {}): ComponentNode {
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
    hidden: false,
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

describe('calculateFlexboxLayout align: stretch', () => {
  it('stretches items with no explicit cross-axis size to fill the container', () => {
    const layouts = calculateFlexboxLayout(box([textNode('a'), textNode('b')], { align: 'stretch' }), 40, 12);
    // content height = 12 - 2*padding(1) = 10
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

  it('leaves start/center/end behavior unchanged (regression guard)', () => {
    for (const align of ['start', 'center', 'end']) {
      const layouts = calculateFlexboxLayout(box([textNode('a'), textNode('b')], { align }), 40, 12);
      expect(layouts.get('a')!.height).not.toBe(10);
    }
  });
});
