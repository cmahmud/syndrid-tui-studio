import { describe, expect, it } from 'vitest';
import type { ComponentNode, SyndridProjectData } from '../../types';
import { exportRatatuiEcosystem } from '../ratatuiEcosystemExporter';
import { defaultEcosystemSpec } from '../../data/ratatuiEcosystem';

function node(id: string, type: ComponentNode['type'], adapter?: Parameters<typeof defaultEcosystemSpec>[0]): ComponentNode {
  return {
    id,
    type,
    name: type,
    props: {},
    layout: { type: 'none' },
    style: {},
    events: {},
    children: [],
    ...(adapter ? { prototype: { ecosystem: defaultEcosystemSpec(adapter) } } : {}),
    locked: false,
    hidden: false,
    collapsed: false,
  };
}

const project = {
  imageAssets: [{ id: 'logo', name: 'Logo', source: 'assets/logo.png', fit: 'contain', alignment: 'center', protocol: 'auto', fallback: 'alt-text' }],
} as Pick<SyndridProjectData, 'imageAssets'>;

describe('Ratatui ecosystem exporter', () => {
  it('exports pinned primary and advanced dependencies used by component adapters', () => {
    const root = node('root', 'Screen', 'native');
    const textarea = node('ta', 'TextArea', 'textarea');
    const image = node('img', 'Image', 'image');
    image.prototype!.ecosystem!.image!.assetId = 'logo';
    const terminal = node('term', 'Terminal', 'terminal');
    terminal.prototype!.ecosystem!.terminal!.command = 'cargo run';
    const tree = node('tree', 'Tree', 'tree-widget');
    const syntax = node('code', 'Code', 'syntax-highlight');
    root.children = [textarea, image, terminal, tree, syntax];

    const result = exportRatatuiEcosystem(root, project);
    expect(result.cargoSnippet).toContain('ratatui-textarea');
    expect(result.cargoSnippet).toContain('ratatui-image');
    expect(result.cargoSnippet).toContain('tui-term');
    expect(result.cargoSnippet).toContain('tui-tree-widget');
    expect(result.cargoSnippet).toContain('tui-syntax-highlight');
    expect(result.cargoSnippet).toContain('termprofile');
    expect(result.warnings).toEqual([]);
  });

  it('infers production adapters for first-class ecosystem components before inspector edits', () => {
    const root = node('root', 'Screen', 'native');
    const image = node('img', 'Image');
    image.props.assetId = 'logo';
    const terminal = node('term', 'Terminal');
    terminal.props.command = 'cargo run';
    const code = node('code', 'Code');
    code.props.language = 'rust';
    const ansi = node('ansi', 'AnsiText');
    const graph = node('graph', 'NodeGraph');
    root.children = [image, terminal, code, ansi, graph];

    const result = exportRatatuiEcosystem(root, project);
    expect(result.bindings.map((binding) => binding.spec.adapter)).toEqual([
      'image', 'terminal', 'syntax-highlight', 'ansi-text', 'node-graph',
    ]);
    expect(result.cargoSnippet).toContain('ratatui-image');
    expect(result.cargoSnippet).toContain('tui-term');
    expect(result.cargoSnippet).toContain('tui-syntax-highlight');
    expect(result.cargoSnippet).toContain('ansi-to-tui');
    expect(result.cargoSnippet).toContain('tui-nodes');
    expect(result.warnings).toEqual([]);
  });

  it('warns about unbound images and PTYs without a command', () => {
    const root = node('root', 'Screen', 'native');
    root.children = [node('img', 'Image', 'image'), node('term', 'Terminal', 'terminal')];
    const result = exportRatatuiEcosystem(root, project);
    expect(result.warnings.some((warning) => warning.includes('no image asset'))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('no command'))).toBe(true);
  });

  it('emits mousefood only when an embedded target is enabled', () => {
    const root = node('root', 'Screen', 'native');
    const graph = node('graph', 'NodeGraph', 'node-graph');
    graph.prototype!.ecosystem!.embedded!.enabled = true;
    root.children = [graph];
    const result = exportRatatuiEcosystem(root, project);
    expect(result.cargoSnippet).toContain('mousefood');
    expect(result.cargoSnippet).toContain('embedded-display');
  });
});
