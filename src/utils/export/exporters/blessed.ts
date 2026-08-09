import type { ComponentNode } from '../../../types';
import { LayoutEngine } from '../../layout';
import {
  SPINNER_PRESETS,
  renderBar,
  renderGauge,
  renderSparkline,
  renderStatusBar,
  renderToast,
  getSeparatorChar,
} from '../../../constants/assets';
import {
  type ExportColorMode,
  ANSI16_NAMES,
  ansi16IndexOfName,
  createIdentGenerator,
  nearestAnsi16,
  nearestAnsi256,
  resolveBackgroundColor,
} from './shared';

// Generates a runnable blessed program. Blessed positions widgets absolutely,
// so we run the studio's own LayoutEngine and emit each node's computed
// top/left/width/height relative to its parent — the output matches the canvas
// (including gap/justify/align, which the engine already bakes into position —
// no separate handling needed here, unlike the flexbox-based exporters).

const DEFAULT_WIDTH = 80;
const DEFAULT_HEIGHT = 25;

interface Ctx {
  engine: LayoutEngine;
  stmts: string[];
  usedVars: Set<string>;
  colorMode: ExportColorMode;
  ident: (name: string) => string;
  // Distinct event-handler names referenced by any widget's .on(...) binding,
  // so one `function <name>() {}` stub gets declared once per name.
  handlerStubs: Set<string>;
}

export function exportToBlessed(root: ComponentNode, colorMode: ExportColorMode = 'truecolor'): string {
  const width = typeof root.props.width === 'number' ? root.props.width : DEFAULT_WIDTH;
  const height = typeof root.props.height === 'number' ? root.props.height : DEFAULT_HEIGHT;
  const engine = new LayoutEngine();
  engine.calculateLayout(root, width, height);

  const usedVars = new Set(['blessed', 'screen', 'process']);
  const ctx: Ctx = {
    engine,
    stmts: [],
    usedVars,
    colorMode,
    ident: createIdentGenerator(usedVars, 'w'),
    handlerStubs: new Set(),
  };
  for (const child of root.type === 'Screen' ? root.children : [root]) {
    genNode(child, ctx, 'screen', root.type === 'Screen' ? layoutOf(root, ctx) : null, false);
  }

  return `const blessed = require('blessed');

const screen = blessed.screen({
  smartCSR: true,
  title: ${js(root.name)},
});

${ctx.stmts.join('\n\n')}

screen.key(['escape', 'q', 'C-c'], () => process.exit(0));

screen.render();
${buildHandlerStubs(ctx)}`;
}

/**
 * One stub per distinct handler name. Checkbox/Radio's real 'check'/'uncheck'
 * events both call the same name (matching this codebase's "onChange" model,
 * which has no single change event of its own in blessed), so the stub takes
 * no arguments — mirroring the same no-arg-adapter approach used for Tview.
 */
function buildHandlerStubs(ctx: Ctx): string {
  if (!ctx.handlerStubs.size) return '';
  return (
    '\n' +
    [...ctx.handlerStubs]
      .sort()
      .map((name) => `function ${name}() {\n  // TODO: implement\n}\n`)
      .join('\n')
  );
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function layoutOf(node: ComponentNode, ctx: Ctx): Box {
  const l = ctx.engine.getLayout(node.id);
  return l ? { x: l.x, y: l.y, width: l.width, height: l.height } : { x: 0, y: 0, width: 10, height: 3 };
}

function genNode(
  node: ComponentNode,
  ctx: Ctx,
  parentVar: string,
  parentBox: Box | null,
  parentBordered: boolean
): void {
  if (node.hidden) return;
  const box = layoutOf(node, ctx);

  // blessed child coordinates are relative to the parent's inner area
  const inset = parentBordered ? 1 : 0;
  const top = parentBox ? box.y - parentBox.y - inset : box.y;
  const left = parentBox ? box.x - parentBox.x - inset : box.x;

  const varName = ctx.ident(node.name);
  const opts: string[] = [
    `parent: ${parentVar}`,
    `top: ${top}`,
    `left: ${left}`,
    `width: ${box.width}`,
    `height: ${box.height}`,
  ];

  const style: string[] = [];
  if (node.style.color) style.push(`fg: ${blessedColorExpr(node.style.color, ctx.colorMode)}`);
  const backgroundColor = resolveBackgroundColor(node.style);
  if (backgroundColor) style.push(`bg: ${blessedColorExpr(backgroundColor, ctx.colorMode)}`);
  if (node.style.bold) style.push(`bold: true`);
  if (node.style.underline) style.push(`underline: true`);

  const bordered = !!node.style.border;
  if (bordered) {
    opts.push(`border: { type: 'line' }`);
    if (node.style.borderColor)
      style.push(`border: { fg: ${blessedColorExpr(node.style.borderColor, ctx.colorMode)} }`);
    if (node.name && node.name !== node.type) opts.push(`label: ${js(` ${node.name} `)}`);
  }

  let widget = 'box';
  let content: string | null = null;
  let extraOpts: string[] = [];

  switch (node.type) {
    case 'Box':
    case 'Grid':
    case 'Screen':
    case 'Modal':
      break;

    case 'Spacer':
      return;

    case 'Separator': {
      // blessed.line is a Box with a fixed cross-axis size; passing an explicit
      // `ch` (blessed's generic fill-character option) rather than relying on
      // its own default lets us support double/thick/dashed too, not just the
      // single-line default it picks for `type: 'line'`.
      widget = 'line';
      const orientation = (node.props.orientation as string) || 'horizontal';
      const lineStyle = (node.props.lineStyle as string) || 'single';
      extraOpts = [
        `orientation: ${js(orientation)}`,
        `type: 'bg'`,
        `ch: ${js(getSeparatorChar(lineStyle, orientation))}`,
      ];
      break;
    }

    case 'Text':
      content = (node.props.content as string) || 'Text';
      break;

    case 'Button':
      widget = 'button';
      content = ` ${(node.props.label as string) || 'Button'} `;
      extraOpts = [`mouse: true`, `keys: true`];
      if (!style.length) style.push(`bold: true`, `inverse: true`);
      break;

    case 'TextInput':
      widget = 'textbox';
      extraOpts = [
        `mouse: true`,
        `keys: true`,
        `inputOnFocus: true`,
        `value: ${js((node.props.value as string) || '')}`,
      ];
      break;

    case 'TextArea':
      // blessed's real textarea widget (distinct from textbox — multiline,
      // scrollable) rather than a hand-rolled box.
      widget = 'textarea';
      extraOpts = [
        `mouse: true`,
        `keys: true`,
        `inputOnFocus: true`,
        `scrollable: true`,
        `value: ${js((node.props.value as string) || '')}`,
      ];
      break;

    case 'Checkbox': {
      widget = 'checkbox';
      extraOpts = [
        `mouse: true`,
        `checked: ${!!node.props.checked}`,
        `text: ${js((node.props.label as string) || 'Checkbox')}`,
      ];
      break;
    }

    case 'Radio': {
      widget = 'radiobutton';
      extraOpts = [
        `mouse: true`,
        `checked: ${!!node.props.checked}`,
        `text: ${js((node.props.label as string) || 'Radio')}`,
      ];
      break;
    }

    case 'Toggle': {
      const on = !!(node.props.value ?? node.props.checked);
      content = `${on ? '[ON ]' : '[OFF]'} ${(node.props.label as string) || ''}`.trim();
      break;
    }

    case 'Select': {
      const options = (node.props.options as string[]) || ['Option 1'];
      const idx = Math.max(0, Math.min(Number(node.props.selectedIndex ?? 0), options.length - 1));
      content = `${options[idx]} ▼`;
      break;
    }

    case 'Spinner': {
      const preset =
        SPINNER_PRESETS[(node.props.spinnerStyle as string) || 'dots'] || SPINNER_PRESETS.dots;
      const idx = Math.max(0, Math.min(Number(node.props.frame ?? 0), preset.frames.length - 1));
      const label = (node.props.label as string) ?? 'Loading...';
      content = label ? `${preset.frames[idx]} ${label}` : preset.frames[idx];
      break;
    }

    case 'ProgressBar': {
      // static bar text; use blessed.progressbar for a live one
      const value = Number(node.props.value ?? 0);
      const max = Number(node.props.max ?? 100) || 100;
      const pct = Math.min(100, Math.max(0, (value / max) * 100));
      const showPercent = (node.props.showPercent as boolean) ?? true;
      const innerW = box.width - (bordered ? 2 : 0) - (showPercent ? 5 : 0);
      const bar = renderBar((node.props.barStyle as string) || 'blocks', innerW, pct);
      content = showPercent ? `${bar} ${pct.toFixed(0)}%` : bar;
      break;
    }

    case 'Gauge': {
      const value = Number(node.props.value ?? 0);
      const max = Number(node.props.max ?? 100) || 100;
      const pct = Math.min(100, Math.max(0, (value / max) * 100));
      const showPercent = (node.props.showPercent as boolean) ?? true;
      const label = (node.props.label as string) || 'Gauge';
      const overlayText = showPercent ? `${label} ${pct.toFixed(0)}%` : label;
      const innerW = box.width - (bordered ? 2 : 0);
      content = renderGauge((node.props.barStyle as string) || 'blocks', innerW, pct, overlayText);
      break;
    }

    case 'Sparkline': {
      const data = (node.props.data as number[]) || [];
      const max = typeof node.props.max === 'number' ? node.props.max : undefined;
      const innerW = box.width - (bordered ? 2 : 0);
      content = renderSparkline(data, innerW, max);
      break;
    }

    case 'Log': {
      // blessed's real log widget (extends ScrollableText) — scrollable +
      // alwaysScroll give genuine tail-scrolling behavior, not a hand-rolled one.
      widget = 'log';
      extraOpts = [`scrollable: true`, `alwaysScroll: true`];
      content = ((node.props.lines as string[]) || []).join('\n');
      break;
    }

    case 'StatusBar': {
      const items = (node.props.items as { key?: string; label?: string }[]) || [];
      const gap = typeof node.props.gap === 'number' ? node.props.gap : 2;
      content = renderStatusBar(items, gap);
      break;
    }

    case 'Toast': {
      // no notification/toast manager in blessed; hand-rolled preview
      const message = (node.props.message as string) || '';
      const variant = (node.props.variant as string) || 'info';
      content = renderToast(message, variant);
      break;
    }

    case 'List':
    case 'Menu': {
      widget = 'list';
      const multiSelect = node.type === 'List' && !!node.props.multiSelect;
      const items = ((node.props.items as unknown[]) || []).map((item) => {
        const d =
          typeof item === 'string'
            ? { label: item, icon: node.type === 'List' ? '•' : '', hotkey: '' }
            : (item as { label?: string; icon?: string; hotkey?: string; checked?: boolean });
        const checkbox = multiSelect ? `[${(d as { checked?: boolean }).checked ? 'x' : ' '}] ` : '';
        const icon = d.icon ? `${d.icon} ` : '';
        const hotkey = d.hotkey ? `  ${d.hotkey}` : '';
        return `${checkbox}${icon}${d.label || 'Item'}${hotkey}`;
      });
      extraOpts = [
        `mouse: true`,
        `keys: true`,
        `items: [${items.map(js).join(', ')}]`,
        `selected: ${Number(node.props.selectedIndex ?? 0)}`,
      ];
      style.push(`selected: { inverse: true }`);
      break;
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
      content = lines.join('\n');
      break;
    }

    case 'Table': {
      widget = 'listtable';
      const columns = (node.props.columns as string[]) || ['Column 1', 'Column 2'];
      const rows = (node.props.rows as string[][]) || [];
      const data = [columns, ...rows.map((r) => columns.map((_, ci) => String(r[ci] ?? '')))];
      extraOpts = [
        `rows: [${data.map((r) => `[${r.map(js).join(', ')}]`).join(', ')}]`,
        `align: 'left'`,
        `keys: true`,
        `mouse: true`,
      ];
      style.push(`header: { bold: true }`);
      break;
    }

    case 'Tabs': {
      const active = Number(node.props.activeTab ?? 0);
      const text = ((node.props.tabs as unknown[]) || [])
        .map((tab, i) => {
          const label = typeof tab === 'string' ? tab : (tab as { label?: string }).label || 'Tab';
          return i === active ? `{bold}[ ${label} ]{/bold}` : `  ${label}  `;
        })
        .join('');
      content = text;
      extraOpts = [`tags: true`];
      break;
    }

    case 'Breadcrumb': {
      const sep = (node.props.separator as string) || ' / ';
      content = ((node.props.items as unknown[]) || [])
        .map((i) => (typeof i === 'string' ? i : (i as { label?: string }).label || ''))
        .join(sep);
      break;
    }

    default:
      content = node.type;
  }

  if (content != null) opts.push(`content: ${js(content)}`);
  opts.push(...extraOpts);
  if (style.length) opts.push(`style: { ${style.join(', ')} }`);

  ctx.stmts.push(
    `const ${varName} = blessed.${widget}({\n${opts.map((o) => `  ${o}`).join(',\n')},\n});`
  );

  appendEventBindings(varName, node, ctx);

  if (node.children.length && ['Box', 'Grid', 'Screen', 'Modal'].includes(node.type)) {
    for (const child of node.children) genNode(child, ctx, varName, box, bordered);
  }
}

/**
 * Real per-widget blessed events (verified against blessed's own source,
 * not guessed): Button emits 'press', Checkbox/Radio (radiobutton extends
 * checkbox) emit 'check'/'uncheck', List emits 'select'. TextInput's
 * textbox has no clean per-keystroke "changed value" event, so onChange
 * binds to 'submit' (fires with the final value on Enter) instead — the
 * closest real hook, not a fabricated live-change one. Toggle/Select have
 * no real interactive blessed widget behind them (hand-rolled static
 * content), so their events are intentionally left unwired rather than
 * bound to something that would never fire.
 */
function appendEventBindings(varName: string, node: ComponentNode, ctx: Ctx): void {
  const bind = (event: string, handler: string | undefined) => {
    if (!handler) return;
    ctx.handlerStubs.add(handler);
    ctx.stmts.push(`${varName}.on(${js(event)}, ${handler});`);
  };

  switch (node.type) {
    case 'Button':
      bind('press', node.events.onClick);
      break;
    case 'TextInput':
    case 'TextArea':
      bind('submit', node.events.onChange);
      break;
    case 'Checkbox':
    case 'Radio':
      bind('check', node.events.onChange);
      bind('uncheck', node.events.onChange);
      break;
    case 'List':
      bind('select', node.events.onSelect);
      break;
  }

  // List/Table are real, focusable/keyed widgets; Tree is hand-rolled
  // static content with no focus wiring, so onKeyPress would never fire
  // there — left unwired for the same reason as Toggle/Select above.
  if ((node.type === 'List' || node.type === 'Table') && node.events.onKeyPress) {
    bind('keypress', node.events.onKeyPress);
  }
}

/** blessed accepts both hex and its own named colors ("light" and "bright" prefixes) directly. */
function resolveColor(value: string, colorMode: ExportColorMode): string {
  if (colorMode !== 'ansi16') return value;
  const named = ansi16IndexOfName(value);
  if (named != null) return ANSI16_NAMES[named].toLowerCase();
  if (/^#[0-9a-fA-F]{3,6}$/.test(value)) return ANSI16_NAMES[nearestAnsi16(value)].toLowerCase();
  return value;
}

/**
 * ansi256 mode emits a bare numeric literal (`fg: 196`), not a quoted string
 * — blessed's real `colors.convert()` passes a JS `number` straight through
 * as an already-resolved 256-color palette index, while a string goes
 * through name/hex matching (which a stringified index like "196" would
 * fail). Every other mode is unaffected and still goes through js().
 */
function blessedColorExpr(value: string, colorMode: ExportColorMode): string {
  if (colorMode === 'ansi256') {
    const named = ansi16IndexOfName(value);
    if (named != null) return String(named);
    if (/^#[0-9a-fA-F]{3,6}$/.test(value)) return String(nearestAnsi256(value));
  }
  return js(resolveColor(value, colorMode));
}

function js(s: string): string {
  return JSON.stringify(String(s));
}
