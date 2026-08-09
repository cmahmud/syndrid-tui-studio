import { describe, it, expect } from 'vitest';
import type { ExportFormatId } from '../../../types';
import { exportToCode, getExportWarnings } from '../codeExporter';
import { kitchenSinkTree, emptyScreenTree, textOnlyTree, styleEdgeCasesTree } from './fixtures';

const COLOR_MODE_FORMATS: ExportFormatId[] = ['ink', 'opentui', 'bubbletea', 'blessed', 'ratatui', 'tview'];

const FORMATS: ExportFormatId[] = [
  'ink',
  'opentui',
  'bubbletea',
  'blessed',
  'textual',
  'ratatui',
  'tview',
];

describe('exportToCode snapshots', () => {
  for (const format of FORMATS) {
    it(`${format}: kitchen-sink tree`, () => {
      expect(exportToCode(kitchenSinkTree(), format)).toMatchSnapshot();
    });

    it(`${format}: empty screen`, () => {
      expect(exportToCode(emptyScreenTree(), format)).toMatchSnapshot();
    });

    it(`${format}: text-only tree`, () => {
      expect(exportToCode(textOnlyTree(), format)).toMatchSnapshot();
    });
  }
});

describe('exporter regressions', () => {
  it('Blessed: no duplicate variable declarations (root "Screen" no longer redeclares const screen)', () => {
    const out = exportToCode(kitchenSinkTree(), 'blessed');
    // widget declarations only — excludes the one blessed.screen(...) boilerplate call
    const decls = [...out.matchAll(/const (\w+) = blessed\.(?!screen\()\w+\(/g)].map((m) => m[1]);
    expect(decls.length).toBeGreaterThan(0);
    expect(new Set(decls).size).toBe(decls.length);
    expect(decls).not.toContain('screen');
  });

  it('Blessed: compiles as valid JavaScript syntax', () => {
    const out = exportToCode(kitchenSinkTree(), 'blessed');
    expect(() => new Function(out.replace(/^const blessed = require.*$/m, ''))).not.toThrow();
  });

  it('Textual: compose body is indented deeper than the def line (regression for the IndentationError bug)', () => {
    const out = exportToCode(kitchenSinkTree(), 'textual');
    const defLine = out.split('\n').findIndex((l) => l.includes('def compose(self)'));
    expect(defLine).toBeGreaterThanOrEqual(0);
    const defIndent = out.split('\n')[defLine].match(/^(\s*)/)![1].length;
    const bodyLine = out.split('\n')[defLine + 1];
    const bodyIndent = bodyLine.match(/^(\s*)/)![1].length;
    expect(bodyIndent).toBeGreaterThan(defIndent);
  });

  it('Textual: escapes embedded quotes so the file stays parseable', () => {
    const out = exportToCode(kitchenSinkTree(), 'textual');
    expect(out).toContain('Say \\"hi\\" to <all>');
  });

  it('BubbleTea: skips Modal nodes and documents the omission instead of misrendering them', () => {
    const out = exportToCode(kitchenSinkTree(), 'bubbletea');
    expect(out).toContain('NOT exported');
    expect(out).toContain('Modal "Confirm"');
    expect(out).not.toContain('Sure?');
  });

  it('BubbleTea: gofmt-shape sanity — no stray tabs-vs-spaces mix, balanced braces', () => {
    const out = exportToCode(kitchenSinkTree(), 'bubbletea');
    const opens = (out.match(/{/g) || []).length;
    const closes = (out.match(/}/g) || []).length;
    expect(opens).toBe(closes);
  });

  it('OpenTUI: preserves text content instead of dropping it (regression for the empty <Text /> bug)', () => {
    const out = exportToCode(kitchenSinkTree(), 'opentui');
    // JSX text content: quotes are literal, only {}<>& need escaping
    expect(out).toContain('Say "hi" to &lt;all&gt;');
    expect(out).toContain('Sure?'); // Modal content still renders, just not as an overlay
  });

  it('OpenTUI: uses the real @opentui/react intrinsic elements, not fictional ones', () => {
    const out = exportToCode(kitchenSinkTree(), 'opentui');
    expect(out).toContain('@opentui/react');
    expect(out).toMatch(/<box/);
    expect(out).toMatch(/<text/);
  });

  it('Ink: border color comes from style.borderColor, not the text color (regression)', () => {
    const tree = kitchenSinkTree();
    const out = exportToCode(tree, 'ink');
    // Files list has color unset but borderColor: 'red'
    expect(out).toContain('borderColor="red"');
  });

  it('Ratatui: gates widget imports to what the tree actually uses', () => {
    const out = exportToCode(textOnlyTree(), 'ratatui');
    expect(out).not.toContain('Table');
    expect(out).not.toContain('Tabs');
    expect(out).not.toContain('Gauge');
  });

  it('Ratatui: escapes quotes in Rust string literals', () => {
    const out = exportToCode(kitchenSinkTree(), 'ratatui');
    expect(out).toContain('Say \\"hi\\" to <all>');
  });

  it('Ratatui: dispatches key handlers through focus and sanitizes Rust function identifiers', () => {
    const tree = kitchenSinkTree();
    const stack = [tree];
    const target = (() => {
      while (stack.length) {
        const node = stack.pop()!;
        if (node.events.onKeyPress) return node;
        stack.push(...node.children);
      }
      throw new Error('fixture should contain a key handler');
    })();
    target.events.onKeyPress = '123-open palette';
    const out = exportToCode(tree, 'ratatui');
    expect(out).toContain('KeyCode::Tab');
    expect(out).toContain('match focus_index');
    expect(out).toContain('fn handler_123_open_palette()');
    expect(out).not.toContain('fn 123-open palette()');
  });

  it('Tview: never chains a method call onto a Set*() return (Box-embedding makes that a compile error)', () => {
    const out = exportToCode(kitchenSinkTree(), 'tview');
    // every primitive's methods are called as separate `varName.Method(...)`
    // statements — a `).Set` would mean we chained onto a *Box return value,
    // which doesn't have the concrete type's other methods
    expect(out).not.toMatch(/\)\.\s*Set/);
  });

  it('Tview: maps our row/column direction to tview\'s inverted Flex naming correctly', () => {
    const out = exportToCode(kitchenSinkTree(), 'tview');
    // Header has layout.direction: 'row' (side-by-side) — tview.FlexColumn
    const headerDecl = out.split('\n').findIndex((l) => l.includes('header := tview.NewFlex()'));
    expect(headerDecl).toBeGreaterThanOrEqual(0);
    expect(out.split('\n')[headerDecl + 1]).toContain('tview.FlexColumn');
  });

  it('Tview: renders Modal as a real overlay via Pages + centering Grid, not a flattened comment', () => {
    const out = exportToCode(kitchenSinkTree(), 'tview');
    expect(out).toContain('tview.NewPages()');
    expect(out).toContain('AddPage("modal-confirm"');
    expect(out).toContain('tview.NewGrid()');
    expect(out).toContain('Sure?');
  });

  it('Tview: escapes literal strings for both Go syntax and tview\'s "[tag]" text markup', () => {
    const out = exportToCode(kitchenSinkTree(), 'tview');
    expect(out).toContain('tview.Escape("Say \\"hi\\" to <all>")');
  });

  it('Tview: compiles-shape sanity — balanced braces and parens', () => {
    const out = exportToCode(kitchenSinkTree(), 'tview');
    expect((out.match(/{/g) || []).length).toBe((out.match(/}/g) || []).length);
    expect((out.match(/\(/g) || []).length).toBe((out.match(/\)/g) || []).length);
  });
});

describe('getExportWarnings', () => {
  it('flags BubbleTea Modal and fill-sizing as unsupported', () => {
    const warnings = getExportWarnings(kitchenSinkTree(), 'bubbletea');
    expect(warnings.some((w) => w.includes('Modal'))).toBe(true);
    expect(warnings.some((w) => w.includes('fill'))).toBe(true);
  });

  it('flags OpenTUI Modal as unsupported', () => {
    const warnings = getExportWarnings(kitchenSinkTree(), 'opentui');
    expect(warnings.some((w) => w.includes('Modal'))).toBe(true);
  });

  it('returns no warnings for formats without special-cased limitations', () => {
    for (const format of ['ink', 'blessed', 'textual', 'ratatui', 'tview'] as ExportFormatId[]) {
      expect(getExportWarnings(kitchenSinkTree(), format)).toEqual([]);
    }
  });

  it('returns [] for a null root', () => {
    expect(getExportWarnings(null, 'bubbletea')).toEqual([]);
  });
});

describe('style edge cases (gradient fallback, justify/align/gap)', () => {
  for (const format of FORMATS) {
    it(`${format}: style edge cases tree (truecolor)`, () => {
      expect(exportToCode(styleEdgeCasesTree(), format)).toMatchSnapshot();
    });
  }

  it('a background gradient degrades to its first stop as a flat color, everywhere', () => {
    for (const format of FORMATS) {
      const out = exportToCode(styleEdgeCasesTree(), format);
      expect(out, `${format} should use the gradient's first stop`).toMatch(/ff0000|#ff0000|255, 0, 0|red/i);
    }
  });

  it('getExportWarnings flags every gradient use, regardless of format', () => {
    for (const format of FORMATS) {
      const warnings = getExportWarnings(styleEdgeCasesTree(), format);
      expect(warnings.some((w) => w.includes('gradient')), `${format} should warn about the gradient`).toBe(
        true
      );
    }
  });

  it('OpenTUI: translates justify/align to real Yoga flexbox props', () => {
    const out = exportToCode(styleEdgeCasesTree(), 'opentui');
    expect(out).toContain('justifyContent: "center"');
    expect(out).toContain('alignItems: "center"');
    expect(out).toContain('justifyContent: "space-between"');
  });

  it('BubbleTea: cross-axis align becomes the lipgloss Join position argument', () => {
    const out = exportToCode(styleEdgeCasesTree(), 'bubbletea');
    expect(out).toContain('lipgloss.Center');
  });

  it('Ratatui: gap becomes a real .spacing() call', () => {
    const out = exportToCode(styleEdgeCasesTree(), 'ratatui');
    expect(out).toContain('.spacing(3)');
  });

  it('Ratatui: center/space-between justify emulated with Constraint::Fill(1) spacers', () => {
    const out = exportToCode(styleEdgeCasesTree(), 'ratatui');
    // centered row of 2 children -> [Fill, real, real, Fill] = 4 constraints
    expect(out).toMatch(/constraints\(\[Constraint::Fill\(1\), Constraint::Min\(1\), Constraint::Min\(1\), Constraint::Fill\(1\)\]\)/);
  });

  it('Tview: gap becomes a fixed-size spacer Box between Flex items', () => {
    const out = exportToCode(styleEdgeCasesTree(), 'tview');
    expect(out).toContain('AddItem(tview.NewBox(), 3, 0, false)');
  });

  it('Ratatui: a background-only (unbordered) container still paints — regression for a real Block being skipped entirely', () => {
    const out = exportToCode(styleEdgeCasesTree(), 'ratatui');
    // Banner has a gradient (-> flat bg) and no border: must still get a Block to paint it
    expect(out).toMatch(/Block::new\(\)\.style\(Style::default\(\)\.bg\(Color::Rgb\(255, 0, 0\)\)\)/);
  });

  it('Textual: named colors translate to real ansi_* TCSS names, not our internal convention (regression for a CSS parse error)', () => {
    const out = exportToCode(styleEdgeCasesTree(), 'textual');
    expect(out).toContain('ansi_bright_green'); // not the raw "brightGreen" we store internally
    expect(out).not.toMatch(/color: brightGreen/);
  });
});

describe('color-tier degradation (ansi16 mode)', () => {
  it('resolves a 3-digit hex and a "bright" named color to a portable index/name per language', () => {
    // #f00 (Text "A") and brightGreen (Text "B") in styleEdgeCasesTree
    const ratatui = exportToCode(styleEdgeCasesTree(), 'ratatui', 'ansi16');
    expect(ratatui).toContain('Color::Red'); // #f00 -> nearest ANSI16 -> red
    expect(ratatui).toContain('Color::LightGreen'); // brightGreen

    const bubbletea = exportToCode(styleEdgeCasesTree(), 'bubbletea', 'ansi16');
    expect(bubbletea).toContain('lipgloss.Color("1")'); // red index
    expect(bubbletea).toContain('lipgloss.Color("10")'); // brightGreen index

    const tview = exportToCode(styleEdgeCasesTree(), 'tview', 'ansi16');
    expect(tview).toContain('tcell.PaletteColor(1)');
    expect(tview).toContain('tcell.PaletteColor(10)');

    const blessed = exportToCode(styleEdgeCasesTree(), 'blessed', 'ansi16');
    expect(blessed).toContain('"red"');
    expect(blessed).toContain('"brightgreen"');
  });

  it('ansi16 mode never emits a raw hex color for any color-capable format', () => {
    for (const format of COLOR_MODE_FORMATS) {
      const out = exportToCode(styleEdgeCasesTree(), format, 'ansi16');
      expect(out, `${format} should not contain raw hex in ansi16 mode`).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    }
  });

  it('truecolor mode (the default) is unaffected — still emits real hex', () => {
    const out = exportToCode(styleEdgeCasesTree(), 'ratatui');
    expect(out).toMatch(/Color::Rgb\(/);
  });

  it('OpenTUI ansi16 mode uses the real RGBA.fromIndex API, not a hex guess', () => {
    const out = exportToCode(styleEdgeCasesTree(), 'opentui', 'ansi16');
    expect(out).toContain('RGBA.fromIndex(');
    expect(out).toContain('import { createCliRenderer, RGBA }');
  });
});

describe('color-tier degradation (ansi256 mode)', () => {
  it('resolves an out-of-16-palette hex to its nearest xterm-256 index and a named color to its base slot', () => {
    // #800 (Text "A", expands to #880000) and brightGreen (Text "B") in styleEdgeCasesTree
    const ratatui = exportToCode(styleEdgeCasesTree(), 'ratatui', 'ansi256');
    expect(ratatui).toContain('Color::Indexed(88)'); // #880000 -> nearest of the 256-color cube
    expect(ratatui).toContain('Color::Indexed(10)'); // brightGreen -> its own named slot

    const bubbletea = exportToCode(styleEdgeCasesTree(), 'bubbletea', 'ansi256');
    expect(bubbletea).toContain('lipgloss.Color("88")');
    expect(bubbletea).toContain('lipgloss.Color("10")');

    const tview = exportToCode(styleEdgeCasesTree(), 'tview', 'ansi256');
    expect(tview).toContain('tcell.PaletteColor(88)');
    expect(tview).toContain('tcell.PaletteColor(10)');

    const blessed = exportToCode(styleEdgeCasesTree(), 'blessed', 'ansi256');
    expect(blessed).toContain('fg: 88');
    expect(blessed).toContain('fg: 10');

    const ink = exportToCode(styleEdgeCasesTree(), 'ink', 'ansi256');
    expect(ink).toContain('ansi256(88)');
    expect(ink).toContain('ansi256(10)');
  });

  it('ansi256 mode never emits a raw hex color for any color-capable format', () => {
    for (const format of COLOR_MODE_FORMATS) {
      const out = exportToCode(styleEdgeCasesTree(), format, 'ansi256');
      expect(out, `${format} should not contain raw hex in ansi256 mode`).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    }
  });

  it('OpenTUI ansi256 mode uses the real RGBA.fromIndex API across the full 0-255 range', () => {
    const out = exportToCode(styleEdgeCasesTree(), 'opentui', 'ansi256');
    expect(out).toContain('RGBA.fromIndex(88)');
    expect(out).toContain('import { createCliRenderer, RGBA }');
  });

  it('Blessed ansi256 mode emits a bare numeric literal, not a quoted string', () => {
    const out = exportToCode(styleEdgeCasesTree(), 'blessed', 'ansi256');
    expect(out).not.toMatch(/fg: "88"/);
    expect(out).not.toMatch(/fg: "10"/);
  });
});

describe('empty tree handling', () => {
  it('every exporter handles a childless Screen without throwing', () => {
    for (const format of FORMATS) {
      expect(() => exportToCode(emptyScreenTree(), format)).not.toThrow();
    }
  });

  it('exportToCode returns empty string for a null root', () => {
    expect(exportToCode(null, 'ink')).toBe('');
  });
});
