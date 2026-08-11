import { describe, expect, it } from 'vitest';
import type { ComponentNode } from '../../types';
import { makePrimitiveEffect } from '../../types';
import { isValidComponentTree } from '../validation';

function root(): ComponentNode {
  return {
    id: 'root',
    type: 'Screen',
    name: 'Root',
    props: {},
    layout: { type: 'absolute' },
    style: {},
    events: {},
    children: [],
    locked: false,
    hidden: false,
    collapsed: false,
  };
}

describe('v3 component-tree validation', () => {
  it('accepts a valid structured TachyonFX effect', () => {
    const node = root();
    node.prototype = { effects: [makePrimitiveEffect('root', 'fade_from', 'Fade')] };
    expect(isValidComponentTree(node)).toBe(true);
  });

  it('rejects a non-array v3 effects field before migration can call map()', () => {
    const node = root() as unknown as Record<string, unknown>;
    node.prototype = { effects: { id: 'not-an-array' } };
    expect(isValidComponentTree(node)).toBe(false);
  });

  it('rejects malformed nested effect graphs', () => {
    const node = root();
    const effect = makePrimitiveEffect('root', 'fade_from', 'Fade') as any;
    effect.graph = { kind: 'parallel', id: 'broken', children: [{ kind: 'wat', id: 'bad' }] };
    node.prototype = { effects: [effect] };
    expect(isValidComponentTree(node)).toBe(false);
  });

  it('rejects unsupported ecosystem adapters', () => {
    const node = root() as any;
    node.prototype = { ecosystem: { adapter: 'mystery-runtime' } };
    expect(isValidComponentTree(node)).toBe(false);
  });

  it('accepts a valid terminal ecosystem adapter', () => {
    const node = root();
    node.prototype = {
      ecosystem: {
        adapter: 'terminal',
        terminal: { command: 'cargo run', cwd: '.', args: [], scrollback: 10000, readOnly: true },
      },
    };
    expect(isValidComponentTree(node)).toBe(true);
  });
});
