import type { ComponentNode } from '../../../types';
import { escGo } from '../escape';
import {
  SPINNER_PRESETS,
  renderBar,
  renderGauge,
  renderSparkline,
  renderStatusBar,
  renderToast,
  tailLines,
  headLines,
  getSeparatorChar,
} from '../../../constants/assets';
import {
  type ExportColorMode,
  ansi16IndexOfName,
  createIdentGenerator,
  nearestAnsi16,
  nearestAnsi256,
  resolveBackgroundColor,
} from './shared';

// Generates a runnable Bubble Tea program: the tree becomes lipgloss
// JoinVertical/JoinHorizontal compositions with per-node styles. Interactive
// widgets render as static previews; comments point at the matching
// charmbracelet/bubbles component for live behaviour.

interface Ctx {
  stmts: string[];
  usedVars: Set<string>;
  skipped: string[];
  colorMode: ExportColorMode;
}

/** Features of the design a static Bubble Tea view cannot express. */
export function getBubbleTeaWarnings(root: ComponentNode): string[] {
  const warnings: string[] = [];
  const walk = (node: ComponentNode) => {
    if (node.hidden) return;
    if (node.type === 'Modal')
      warnings.push(`Modal "${node.name}" is skipped — a static Bubble Tea view has no overlays (use bubbletea's tea.Model state + lipgloss.Place to build one).`);
    if (node.props.width === 'fill' || node.props.height === 'fill')
      warnings.push(`"${node.name}" uses fill sizing, which lipgloss cannot express — it renders at content size.`);
    node.children.forEach(walk);
  };
  walk(root);
  return warnings;
}

export function exportToBubbleTea(root: ComponentNode, colorMode: ExportColorMode = 'truecolor'): string {
  const ctx: Ctx = {
    stmts: [],
    usedVars: new Set(['m', 'model', 'main', 'msg', 'p', 'err']),
    skipped: [],
    colorMode,
  };
  const rootExpr = genNode(root, ctx);

  const body = ctx.stmts.length ? `${ctx.stmts.join('\n')}\n\treturn ${rootExpr}` : `\treturn ${rootExpr}`;
  const skippedNote = ctx.skipped.length
    ? `// NOT exported (unsupported in a static view):\n${ctx.skipped.map((s) => `//   - ${s}`).join('\n')}\n\n`
    : '';

  return `${skippedNote}package main

import (
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type model struct{}

func (m model) Init() tea.Cmd {
	return nil
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		if msg.String() == "ctrl+c" || msg.String() == "q" {
			return m, tea.Quit
		}
	}
	return m, nil
}

func (m model) View() string {
${body}
}

func main() {
	p := tea.NewProgram(model{}, tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Println("Error:", err)
		os.Exit(1)
	}
}
`;
}

/** Returns a Go expression for the node; containers emit intermediate statements. */
function genNode(node: ComponentNode, ctx: Ctx): string {
  if (node.hidden) return '""';

  switch (node.type) {
    case 'Modal':
      ctx.skipped.push(`Modal "${node.name}" — no overlay support; build with tea.Model state + lipgloss.Place`);
      return '""';

    case 'Screen':
    case 'Box': {
      const isRow = node.layout.direction === 'row';
      const gap = Math.max(0, Number(node.layout.gap ?? 0));
      const childExprs: string[] = [];
      for (const child of node.children) {
        const expr = genNode(child, ctx);
        if (expr === '""' && child.type !== 'Spacer') continue; // skipped node (e.g. Modal)
        if (childExprs.length > 0 && gap > 0) {
          if (isRow) childExprs.push(escGoStr(' '.repeat(gap)));
          else for (let g = 0; g < gap; g++) childExprs.push('""'); // blank line per gap row
        }
        childExprs.push(expr);
      }
      return emitContainer(node, ctx, childExprs, isRow);
    }

    case 'Grid': {
      const cols = Math.max(1, Number(node.layout.columns ?? 2));
      const rowExprs: string[] = [];
      for (let i = 0; i < node.children.length; i += cols) {
        const cells = node.children.slice(i, i + cols).map((c) => genNode(c, ctx));
        rowExprs.push(
          cells.length > 1
            ? `lipgloss.JoinHorizontal(${joinPosition(node.layout.align, true)}, ${cells.join(', ')})`
            : cells[0]
        );
      }
      return emitContainer(node, ctx, rowExprs, false);
    }

    case 'Spacer':
      return '""';

    case 'Text':
      return styled(node, escGoStr((node.props.content as string) || 'Text'), ctx);

    case 'Separator': {
      const orientation = (node.props.orientation as string) || 'horizontal';
      const lineStyle = (node.props.lineStyle as string) || 'single';
      const char = getSeparatorChar(lineStyle, orientation);
      const content =
        orientation === 'vertical'
          ? Array(typeof node.props.height === 'number' ? node.props.height : 5)
              .fill(char)
              .join('\n')
          : char.repeat(typeof node.props.width === 'number' ? node.props.width : 20);
      return styled(node, escGoStr(content), ctx);
    }

    case 'Button': {
      const label = ` ${(node.props.label as string) || 'Button'} `;
      const base = goStyle(node, ctx, ['Bold(true)', 'Reverse(true)']);
      eventComment(ctx, node.events.onClick, 'onClick');
      return `${base}.Render(${escGoStr(label)})`;
    }

    case 'TextInput': {
      // consider charmbracelet/bubbles/textinput for a live input
      eventComment(ctx, node.events.onChange, 'onChange');
      const value = ((node.props.value as string) || (node.props.placeholder as string) || '') + '_';
      return styled(node, escGoStr(value), ctx);
    }

    case 'TextArea': {
      // consider charmbracelet/bubbles/textarea for a live multiline editor
      eventComment(ctx, node.events.onChange, 'onChange');
      const value = (node.props.value as string) || '';
      const placeholder = (node.props.placeholder as string) || '';
      const height = typeof node.props.height === 'number' ? node.props.height : 5;
      const lines = headLines((value || placeholder).split('\n'), height);
      return styled(node, escGoStr(lines.join('\n')), ctx);
    }

    case 'Checkbox': {
      const checked = !!node.props.checked;
      const icon = checked
        ? (node.props.checkedIcon as string) || '✓'
        : (node.props.uncheckedIcon as string) || ' ';
      eventComment(ctx, node.events.onChange, 'onChange');
      return styled(node, escGoStr(`[${icon}] ${(node.props.label as string) || 'Checkbox'}`), ctx);
    }

    case 'Radio': {
      const selected = !!node.props.checked;
      const icon = selected
        ? (node.props.selectedIcon as string) || '●'
        : (node.props.unselectedIcon as string) || '○';
      eventComment(ctx, node.events.onChange, 'onChange');
      return styled(node, escGoStr(`(${icon}) ${(node.props.label as string) || 'Radio'}`), ctx);
    }

    case 'Toggle': {
      const on = !!(node.props.value ?? node.props.checked);
      eventComment(ctx, node.events.onChange, 'onChange');
      return styled(node, escGoStr(`${on ? '[ON ]' : '[OFF]'} ${(node.props.label as string) || ''}`.trim()), ctx);
    }

    case 'Select': {
      const options = (node.props.options as string[]) || ['Option 1'];
      const idx = Math.max(0, Math.min(Number(node.props.selectedIndex ?? 0), options.length - 1));
      eventComment(ctx, node.events.onChange, 'onChange');
      return styled(node, escGoStr(`${options[idx]} ▼`), ctx);
    }

    case 'Spinner': {
      // consider charmbracelet/bubbles/spinner for a live spinner
      const preset =
        SPINNER_PRESETS[(node.props.spinnerStyle as string) || 'dots'] || SPINNER_PRESETS.dots;
      const idx = Math.max(0, Math.min(Number(node.props.frame ?? 0), preset.frames.length - 1));
      const label = (node.props.label as string) ?? 'Loading...';
      return styled(node, escGoStr(label ? `${preset.frames[idx]} ${label}` : preset.frames[idx]), ctx);
    }

    case 'ProgressBar': {
      // consider charmbracelet/bubbles/progress for a live bar
      const value = Number(node.props.value ?? 0);
      const max = Number(node.props.max ?? 100) || 100;
      const width = typeof node.props.width === 'number' ? node.props.width : 20;
      const pct = Math.min(100, Math.max(0, (value / max) * 100));
      const showPercent = (node.props.showPercent as boolean) ?? true;
      const styleName = (node.props.barStyle as string) || 'blocks';
      const bar = renderBar(styleName, width - (showPercent ? 5 : 0), pct);
      return styled(node, escGoStr(showPercent ? `${bar} ${pct.toFixed(0)}%` : bar), ctx);
    }

    case 'Gauge': {
      const value = Number(node.props.value ?? 0);
      const max = Number(node.props.max ?? 100) || 100;
      const width = typeof node.props.width === 'number' ? node.props.width : 24;
      const pct = Math.min(100, Math.max(0, (value / max) * 100));
      const showPercent = (node.props.showPercent as boolean) ?? true;
      const label = (node.props.label as string) || 'Gauge';
      const overlayText = showPercent ? `${label} ${pct.toFixed(0)}%` : label;
      const bar = renderGauge((node.props.barStyle as string) || 'blocks', width, pct, overlayText);
      return styled(node, escGoStr(bar), ctx);
    }

    case 'Sparkline': {
      const data = (node.props.data as number[]) || [];
      const width = typeof node.props.width === 'number' ? node.props.width : 20;
      const max = typeof node.props.max === 'number' ? node.props.max : undefined;
      return styled(node, escGoStr(renderSparkline(data, width, max)), ctx);
    }

    case 'Log': {
      // consider charmbracelet/bubbles/viewport for real scrolling behavior
      const lines = (node.props.lines as string[]) || [];
      const height = typeof node.props.height === 'number' ? node.props.height : 6;
      return styled(node, escGoStr(tailLines(lines, height).join('\n')), ctx);
    }

    case 'StatusBar': {
      // consider charmbracelet/bubbles/help for a live, keymap-driven footer
      const items = (node.props.items as { key?: string; label?: string }[]) || [];
      const gap = typeof node.props.gap === 'number' ? node.props.gap : 2;
      return styled(node, escGoStr(renderStatusBar(items, gap)), ctx);
    }

    case 'Toast': {
      // no notification/toast manager in BubbleTea itself; hand-rolled preview
      const message = (node.props.message as string) || '';
      const variant = (node.props.variant as string) || 'info';
      return styled(node, escGoStr(renderToast(message, variant)), ctx);
    }

    case 'List':
    case 'Menu': {
      const selectedIndex = Number(node.props.selectedIndex ?? -1);
      const multiSelect = node.type === 'List' && !!node.props.multiSelect;
      const lines = ((node.props.items as unknown[]) || []).map((item, i) => {
        const d =
          typeof item === 'string'
            ? { label: item, icon: node.type === 'List' ? '•' : '', hotkey: '' }
            : (item as { label?: string; icon?: string; hotkey?: string; checked?: boolean });
        const marker = i === selectedIndex ? '▶ ' : '  ';
        const checkbox = multiSelect ? `[${d.checked ? 'x' : ' '}] ` : '';
        const icon = d.icon ? `${d.icon} ` : '';
        const hotkey = d.hotkey ? `  ${d.hotkey}` : '';
        return `${marker}${checkbox}${icon}${d.label || 'Item'}${hotkey}`;
      });
      eventComment(ctx, node.events.onSelect, 'onSelect');
      eventComment(ctx, node.events.onKeyPress, 'onKeyPress');
      return styled(node, escGoStr(lines.join('\n')), ctx);
    }

    case 'Tree': {
      const lines: string[] = [];
      const walk = (item: unknown, depth: number) => {
        const d =
          typeof item === 'string'
            ? { label: item, children: [] as unknown[] }
            : (item as { label?: string; children?: unknown[] });
        lines.push(`${'  '.repeat(depth)}${depth > 0 ? '├─ ' : ''}${d.label || 'Item'}`);
        (d.children || []).forEach((c) => walk(c, depth + 1));
      };
      ((node.props.items as unknown[]) || []).forEach((i) => walk(i, 0));
      eventComment(ctx, node.events.onKeyPress, 'onKeyPress');
      return styled(node, escGoStr(lines.join('\n')), ctx);
    }

    case 'Table': {
      const columns = (node.props.columns as string[]) || ['Column 1', 'Column 2'];
      const rows = (node.props.rows as string[][]) || [];
      const colW = 14;
      const fit = (s: string) => s.slice(0, colW).padEnd(colW);
      const lines = [
        columns.map(fit).join(' │ '),
        columns.map(() => '─'.repeat(colW)).join('─┼─'),
        ...rows.map((row) => columns.map((_, ci) => fit(String(row[ci] ?? ''))).join(' │ ')),
      ];
      eventComment(ctx, node.events.onKeyPress, 'onKeyPress');
      return styled(node, escGoStr(lines.join('\n')), ctx);
    }

    case 'Tabs': {
      const active = Number(node.props.activeTab ?? 0);
      const tabExprs = ((node.props.tabs as unknown[]) || []).map((tab, i) => {
        const t = tab as { label?: string };
        const label = ` ${typeof tab === 'string' ? tab : t.label || 'Tab'} `;
        return i === active
          ? `lipgloss.NewStyle().Bold(true).Underline(true).Render(${escGoStr(label)})`
          : escGoStr(label);
      });
      const joined =
        tabExprs.length > 1
          ? `lipgloss.JoinHorizontal(lipgloss.Top, ${tabExprs.join(', ')})`
          : tabExprs[0] || '""';
      return assignVar(node, ctx, joined);
    }

    case 'Breadcrumb': {
      const sep = (node.props.separator as string) || ' / ';
      const text = ((node.props.items as unknown[]) || [])
        .map((i) => (typeof i === 'string' ? i : (i as { label?: string }).label || ''))
        .join(sep);
      return styled(node, escGoStr(text), ctx);
    }

    default:
      return escGoStr(node.type);
  }
}

/** lipgloss.Join{Horizontal,Vertical}'s position arg is the cross-axis alignment. */
function joinPosition(align: string | undefined, isRow: boolean): string {
  const start = isRow ? 'lipgloss.Top' : 'lipgloss.Left';
  const end = isRow ? 'lipgloss.Bottom' : 'lipgloss.Right';
  if (align === 'center') return 'lipgloss.Center';
  if (align === 'end') return end;
  return start; // 'start' | 'stretch' | undefined — lipgloss has no stretch equivalent
}

function emitContainer(node: ComponentNode, ctx: Ctx, childExprs: string[], isRow: boolean): string {
  let expr: string;
  if (childExprs.length === 0) expr = '""';
  else if (childExprs.length === 1) expr = childExprs[0];
  else
    expr = isRow
      ? `lipgloss.JoinHorizontal(${joinPosition(node.layout.align, true)}, ${childExprs.join(', ')})`
      : `lipgloss.JoinVertical(${joinPosition(node.layout.align, false)}, ${childExprs.join(', ')})`;

  const style = goStyle(node, ctx);
  if (style) expr = `${style}.Render(${expr})`;
  return assignVar(node, ctx, expr);
}

function assignVar(node: ComponentNode, ctx: Ctx, expr: string): string {
  if (expr === '""') return expr;
  const ident = createIdentGenerator(ctx.usedVars, 'v');
  const name = ident(node.name);
  ctx.stmts.push(`\t${name} := ${expr}`);
  return name;
}

/**
 * This exporter always produces a static, single-render-pass View() (no
 * tea.Model/Update() event loop is generated — a deliberate, pre-existing
 * constraint, not a gap). A designer-set event handler therefore can't be
 * wired to anything real here; note it rather than fabricate a call that
 * would never fire.
 */
function eventComment(ctx: Ctx, handler: string | undefined, eventName: string): void {
  if (!handler) return;
  ctx.stmts.push(
    `\t// ${eventName} ("${handler}") not wired: this is a static View(), rebuild with a real tea.Model/Update() to handle it`
  );
}

/** Wrap a leaf expression in its style, if any. */
function styled(node: ComponentNode, expr: string, ctx: Ctx): string {
  const style = goStyle(node, ctx);
  return style ? `${style}.Render(${expr})` : expr;
}

/** Build a lipgloss.NewStyle() chain from node style/layout; '' when default. */
function goStyle(node: ComponentNode, ctx: Ctx, extra: string[] = []): string {
  const parts: string[] = [...extra];
  const s = node.style;

  if (s.color) pushColor(parts, 'Foreground', s.color, ctx.colorMode);
  const backgroundColor = resolveBackgroundColor(s);
  if (backgroundColor) pushColor(parts, 'Background', backgroundColor, ctx.colorMode);
  if (s.bold && !extra.includes('Bold(true)')) parts.push('Bold(true)');
  if (s.italic) parts.push('Italic(true)');
  if (s.underline) parts.push('Underline(true)');
  if (s.strikethrough) parts.push('Strikethrough(true)');

  if (s.border) {
    const borderMap: Record<string, string> = {
      single: 'lipgloss.NormalBorder()',
      double: 'lipgloss.DoubleBorder()',
      rounded: 'lipgloss.RoundedBorder()',
      bold: 'lipgloss.ThickBorder()',
      hidden: 'lipgloss.HiddenBorder()',
    };
    parts.push(`Border(${borderMap[s.borderStyle || 'single'] || 'lipgloss.NormalBorder()'})`);
    if (s.borderColor) pushColor(parts, 'BorderForeground', s.borderColor, ctx.colorMode);
  }

  const pad = node.layout.padding;
  if (typeof pad === 'number' && pad > 0) parts.push(`Padding(${pad})`);
  if (typeof node.props.width === 'number' && node.type !== 'ProgressBar')
    parts.push(`Width(${node.props.width})`);
  if (typeof node.props.height === 'number') parts.push(`Height(${node.props.height})`);

  return parts.length ? `lipgloss.NewStyle().${parts.join('.')}` : '';
}

function pushColor(parts: string[], method: string, value: string, colorMode: ExportColorMode): void {
  const color = goColor(value, colorMode);
  if (color) parts.push(`${method}(lipgloss.Color(${color}))`);
}

/** lipgloss.Color takes hex strings or ANSI palette index strings ("0"-"255"). */
function goColor(value: string, colorMode: ExportColorMode): string | null {
  const named = ansi16IndexOfName(value);
  if (named != null) return `"${named}"`;
  if (!/^#[0-9a-fA-F]{3}$/.test(value) && !/^#[0-9a-fA-F]{6}$/.test(value)) return null;
  // ansi16/ansi256 mode: force even a hex input down to its nearest indexed
  // slot, so the terminal's own palette (not a fixed RGB) determines the
  // final color. lipgloss.Color treats a plain numeric string as an
  // xterm-256 index (0-255), so ansi16's 0-15 range is just its lower slice.
  if (colorMode === 'ansi16') return `"${nearestAnsi16(value)}"`;
  if (colorMode === 'ansi256') return `"${nearestAnsi256(value)}"`;
  const v = /^#[0-9a-fA-F]{3}$/.test(value)
    ? '#' + value[1] + value[1] + value[2] + value[2] + value[3] + value[3]
    : value;
  return `"${v}"`;
}

function escGoStr(s: string): string {
  return `"${escGo(s)}"`;
}
