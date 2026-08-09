import type { ComponentNode } from '../../../types';
import { escJsx } from '../escape';
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
  ansi16IndexOfName,
  nearestAnsi16,
  nearestAnsi256,
  resolveBackgroundColor,
} from './shared';

// Generates an @opentui/react app using its real intrinsic elements
// (<box>, <text>, <input>, <select>, <tab-select>) and Yoga flexbox styles.
//
// Ansi16/ansi256 color modes both use OpenTUI's real indexed-color API,
// RGBA.fromIndex(0-255) — verified against opentui.com's colors doc — rather
// than a hex approximation, so the terminal's own palette (not a fixed
// guess) determines the final color. Ansi16 just stays within the 0-15
// slice of the same API.

export function getOpenTuiWarnings(root: ComponentNode): string[] {
  const warnings: string[] = [];
  const walk = (node: ComponentNode) => {
    if (node.hidden) return;
    if (node.type === 'Modal')
      warnings.push(`Modal "${node.name}" renders in normal flow — overlay positioning needs app state (conditionally render it on top).`);
    node.children.forEach(walk);
  };
  walk(root);
  return warnings;
}

export function exportToOpenTUI(root: ComponentNode, colorMode: ExportColorMode = 'truecolor'): string {
  const body = genNode(root, 1, colorMode);
  const coreImports =
    colorMode === 'ansi16' || colorMode === 'ansi256' ? 'createCliRenderer, RGBA' : 'createCliRenderer';

  return `import { ${coreImports} } from "@opentui/core";
import { createRoot } from "@opentui/react";

function App() {
  return (
${body}  );
}

const renderer = await createCliRenderer();
createRoot(renderer).render(<App />);
`;
}

function genNode(node: ComponentNode, indent: number, colorMode: ExportColorMode): string {
  if (node.hidden) return '';
  const sp = '  '.repeat(indent + 1);

  switch (node.type) {
    case 'Screen':
    case 'Box':
    case 'Modal': {
      const attrs = boxAttrs(node, colorMode);
      const children = node.children.map((c) => genNode(c, indent + 1, colorMode)).join('');
      const comment = node.type === 'Modal' ? '{/* Modal: render conditionally on top */}\n' + sp : '';
      return children
        ? `${sp}${comment}<box${attrs}>\n${children}${sp}</box>\n`
        : `${sp}${comment}<box${attrs} />\n`;
    }

    case 'Grid': {
      const cols = Math.max(1, Number(node.layout.columns ?? 2));
      const rows: string[] = [];
      for (let i = 0; i < node.children.length; i += cols) {
        const cells = node.children
          .slice(i, i + cols)
          .map((c) => genNode(c, indent + 2, colorMode))
          .join('');
        rows.push(`${sp}  <box style={{ flexDirection: "row" }}>\n${cells}${sp}  </box>\n`);
      }
      return `${sp}<box${boxAttrs(node, colorMode)}>\n${rows.join('')}${sp}</box>\n`;
    }

    case 'Spacer':
      return `${sp}<box style={{ flexGrow: 1 }} />\n`;

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
      return `${sp}${textEl(node, content, colorMode, false, true)}\n`;
    }

    case 'Text':
      return `${sp}${textEl(node, (node.props.content as string) || 'Text', colorMode)}\n`;

    case 'Button': {
      const label = (node.props.label as string) || 'Button';
      return `${eventComment(sp, node.events.onClick, 'onClick')}${sp}<box border borderStyle="${node.style.borderStyle === 'double' ? 'double' : 'single'}">\n${sp}  ${textEl(node, ` ${label} `, colorMode, true)}\n${sp}</box>\n`;
    }

    case 'TextInput': {
      const placeholder = (node.props.placeholder as string) || '';
      // <input onInput={}> is a real, documented @opentui/react prop (verified
      // via opentui.com's React bindings doc) — unlike Button/Checkbox/etc.
      // below, which have no documented click/change prop at this layer.
      const onInput = node.events.onChange ? `() => ${node.events.onChange}()` : '() => {}';
      return `${sp}<input placeholder={${JSON.stringify(placeholder)}} onInput={${onInput}} />\n`;
    }

    case 'TextArea': {
      // <textarea> is a real, documented @opentui/react intrinsic (distinct
      // from <input>) — but its React-binding prop docs explicitly say the
      // "Construct API [is] Not available yet", so only `placeholder` is set
      // here (the one prop confirmed by the React docs); value/onChange
      // aren't guessed at.
      const placeholder = (node.props.placeholder as string) || '';
      return `${eventComment(sp, node.events.onChange, 'onChange')}${sp}<textarea placeholder={${JSON.stringify(placeholder)}} />\n`;
    }

    case 'Select': {
      const options = (node.props.options as string[]) || ['Option 1'];
      const opts = options
        .map((o) => `{ name: ${JSON.stringify(o)}, description: "", value: ${JSON.stringify(o.toLowerCase().replace(/\s+/g, '_'))} }`)
        .join(', ');
      // Select's real change events (SelectRenderableEvents.ITEM_SELECTED /
      // .SELECTION_CHANGED) are only reachable via a ref's .on() — this
      // exporter generates plain function components with no refs, so
      // there's no JSX prop to wire onChange to here.
      return `${eventComment(sp, node.events.onChange, 'onChange')}${sp}<select options={[${opts}]} />\n`;
    }

    case 'Tabs': {
      const tabs = ((node.props.tabs as unknown[]) || []).map((tab) => {
        const label = typeof tab === 'string' ? tab : (tab as { label?: string }).label || 'Tab';
        return `{ name: ${JSON.stringify(label)}, description: "", value: ${JSON.stringify(label.toLowerCase().replace(/\s+/g, '_'))} }`;
      });
      return `${sp}<tab-select options={[${tabs.join(', ')}]} />\n`;
    }

    case 'Checkbox': {
      const checked = !!node.props.checked;
      const icon = checked
        ? (node.props.checkedIcon as string) || '✓'
        : (node.props.uncheckedIcon as string) || ' ';
      return `${eventComment(sp, node.events.onChange, 'onChange')}${sp}${textEl(node, `[${icon}] ${(node.props.label as string) || 'Checkbox'}`, colorMode)}\n`;
    }

    case 'Radio': {
      const selected = !!node.props.checked;
      const icon = selected
        ? (node.props.selectedIcon as string) || '●'
        : (node.props.unselectedIcon as string) || '○';
      return `${eventComment(sp, node.events.onChange, 'onChange')}${sp}${textEl(node, `(${icon}) ${(node.props.label as string) || 'Radio'}`, colorMode)}\n`;
    }

    case 'Toggle': {
      const on = !!(node.props.value ?? node.props.checked);
      return `${eventComment(sp, node.events.onChange, 'onChange')}${sp}${textEl(node, `${on ? '[ON ]' : '[OFF]'} ${(node.props.label as string) || ''}`.trim(), colorMode)}\n`;
    }

    case 'Spinner': {
      const preset =
        SPINNER_PRESETS[(node.props.spinnerStyle as string) || 'dots'] || SPINNER_PRESETS.dots;
      const idx = Math.max(0, Math.min(Number(node.props.frame ?? 0), preset.frames.length - 1));
      const label = (node.props.label as string) ?? 'Loading...';
      return `${sp}${textEl(node, label ? `${preset.frames[idx]} ${label}` : preset.frames[idx], colorMode)}\n`;
    }

    case 'ProgressBar': {
      const value = Number(node.props.value ?? 0);
      const max = Number(node.props.max ?? 100) || 100;
      const width = typeof node.props.width === 'number' ? node.props.width : 20;
      const pct = Math.min(100, Math.max(0, (value / max) * 100));
      const showPercent = (node.props.showPercent as boolean) ?? true;
      const bar = renderBar((node.props.barStyle as string) || 'blocks', width - (showPercent ? 5 : 0), pct);
      return `${sp}${textEl(node, showPercent ? `${bar} ${pct.toFixed(0)}%` : bar, colorMode)}\n`;
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
      return `${sp}${textEl(node, bar, colorMode)}\n`;
    }

    case 'Sparkline': {
      const data = (node.props.data as number[]) || [];
      const width = typeof node.props.width === 'number' ? node.props.width : 20;
      const max = typeof node.props.max === 'number' ? node.props.max : undefined;
      return `${sp}${textEl(node, renderSparkline(data, width, max), colorMode)}\n`;
    }

    case 'Log': {
      // Real @opentui/react <scrollbox> intrinsic — confirmed via
      // opentui.com/docs/components/scrollbox, not a hand-rolled fallback.
      const lines = (node.props.lines as string[]) || [];
      const rows = lines.map((l) => `${sp}  ${textEl(node, l, colorMode, false, true)}`).join('\n');
      return `${sp}<scrollbox${boxAttrs(node, colorMode)}>\n${rows}\n${sp}</scrollbox>\n`;
    }

    case 'StatusBar': {
      const items = (node.props.items as { key?: string; label?: string }[]) || [];
      const gap = typeof node.props.gap === 'number' ? node.props.gap : 2;
      return `${sp}${textEl(node, renderStatusBar(items, gap), colorMode)}\n`;
    }

    case 'Toast': {
      // no toast/notification component documented in @opentui/react; hand-rolled preview.
      const message = (node.props.message as string) || '';
      const variant = (node.props.variant as string) || 'info';
      return `${sp}${textEl(node, renderToast(message, variant), colorMode)}\n`;
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
        return `${marker}${checkbox}${d.icon ? `${d.icon} ` : ''}${d.label || 'Item'}${d.hotkey ? `  ${d.hotkey}` : ''}`;
      });
      const comment =
        eventComment(sp, node.events.onSelect, 'onSelect') + eventComment(sp, node.events.onKeyPress, 'onKeyPress');
      return `${comment}${sp}<box${boxAttrs(node, colorMode)}>\n${lines.map((l) => `${sp}  ${textEl(node, l, colorMode, false, true)}`).join('\n')}\n${sp}</box>\n`;
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
      return `${eventComment(sp, node.events.onKeyPress, 'onKeyPress')}${sp}<box${boxAttrs(node, colorMode)}>\n${lines.map((l) => `${sp}  ${textEl(node, l, colorMode, false, true)}`).join('\n')}\n${sp}</box>\n`;
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
      return `${eventComment(sp, node.events.onKeyPress, 'onKeyPress')}${sp}<box${boxAttrs(node, colorMode)}>\n${lines.map((l) => `${sp}  ${textEl(node, l, colorMode, false, true)}`).join('\n')}\n${sp}</box>\n`;
    }

    case 'Breadcrumb': {
      const sep = (node.props.separator as string) || ' / ';
      const text = ((node.props.items as unknown[]) || [])
        .map((i) => (typeof i === 'string' ? i : (i as { label?: string }).label || ''))
        .join(sep);
      return `${sp}${textEl(node, text, colorMode)}\n`;
    }

    default:
      return `${sp}{/* ${node.type}: ${escJsx(node.name)} */}\n`;
  }
}

/**
 * A one-line JSX comment noting an event that has no documented, directly
 * wireable prop on this element in @opentui/react's real API (verified
 * against opentui.com's docs, not assumed) — e.g. Button/Checkbox/Radio/
 * Toggle render as plain <box>/<text> with no click/change prop, and
 * Select's real change events are only reachable via a ref's .on(), which
 * this exporter's plain function components don't set up. Returns '' when
 * no handler is set, so designs that don't use events stay comment-free.
 */
function eventComment(sp: string, handler: string | undefined, eventName: string): string {
  if (!handler) return '';
  return `${sp}{/* ${eventName} ("${handler}") not wired — no documented prop for this at the React-bindings layer */}\n`;
}

/** Resolve a color for OpenTUI, respecting the color-tier mode. Ansi16/ansi256 both use the real RGBA.fromIndex(0-255) API so the terminal's palette wins, not a fixed hex guess. */
function colorValue(value: string, colorMode: ExportColorMode): string {
  if (colorMode === 'truecolor') return JSON.stringify(value);
  const named = ansi16IndexOfName(value);
  const idx =
    named ??
    (/^#[0-9a-fA-F]{3,6}$/.test(value)
      ? colorMode === 'ansi16'
        ? nearestAnsi16(value)
        : nearestAnsi256(value)
      : null);
  return idx != null ? `RGBA.fromIndex(${idx})` : JSON.stringify(value);
}

/** <text> element with fg/bg and strong/em/u wrappers from node style. */
function textEl(
  node: ComponentNode,
  content: string,
  colorMode: ExportColorMode,
  forceBold = false,
  plain = false
): string {
  let inner = escJsx(content);
  if (!plain) {
    if (node.style.bold || forceBold) inner = `<strong>${inner}</strong>`;
    if (node.style.italic) inner = `<em>${inner}</em>`;
    if (node.style.underline) inner = `<u>${inner}</u>`;
  }
  const attrs: string[] = [];
  if (node.style.color) attrs.push(`fg={${colorValue(node.style.color, colorMode)}}`);
  const backgroundColor = resolveBackgroundColor(node.style);
  if (backgroundColor && !plain)
    attrs.push(`style={{ bg: ${colorValue(backgroundColor, colorMode)} }}`);
  return `<text${attrs.length ? ' ' + attrs.join(' ') : ''}>${inner}</text>`;
}

function boxAttrs(node: ComponentNode, colorMode: ExportColorMode): string {
  const attrs: string[] = [];
  const style: string[] = [];

  if (node.layout.direction === 'row') style.push(`flexDirection: "row"`);
  else if (node.children.length > 1) style.push(`flexDirection: "column"`);
  const gap = Number(node.layout.gap ?? 0);
  if (gap > 0) style.push(`gap: ${gap}`);
  const pad = node.layout.padding;
  if (typeof pad === 'number' && pad > 0) style.push(`padding: ${pad}`);

  const jMap: Record<string, string> = {
    center: 'center',
    end: 'flex-end',
    'space-between': 'space-between',
    around: 'space-around',
    'space-around': 'space-around',
  };
  const justify = (node.layout.justify as string) || '';
  if (jMap[justify]) style.push(`justifyContent: "${jMap[justify]}"`);

  const aMap: Record<string, string> = { center: 'center', end: 'flex-end', stretch: 'stretch' };
  const align = (node.layout.align as string) || '';
  if (aMap[align]) style.push(`alignItems: "${aMap[align]}"`);

  if (typeof node.props.width === 'number') style.push(`width: ${node.props.width}`);
  else if (node.props.width === 'fill') style.push(`flexGrow: 1`);
  if (typeof node.props.height === 'number') style.push(`height: ${node.props.height}`);

  const backgroundColor = resolveBackgroundColor(node.style);
  if (backgroundColor) style.push(`backgroundColor: ${colorValue(backgroundColor, colorMode)}`);

  if (node.style.border) {
    attrs.push('border');
    const bsMap: Record<string, string> = {
      single: 'single',
      double: 'double',
      rounded: 'rounded',
      bold: 'heavy',
    };
    const bs = bsMap[(node.style.borderStyle as string) || 'single'];
    if (bs && bs !== 'single') attrs.push(`borderStyle="${bs}"`);
    if (node.name && node.name !== node.type)
      attrs.push(`title={${JSON.stringify(` ${node.name} `)}}`);
    if (node.style.borderColor) style.push(`borderColor: ${colorValue(node.style.borderColor, colorMode)}`);
  }

  if (style.length) attrs.push(`style={{ ${style.join(', ')} }}`);
  return attrs.length ? ' ' + attrs.join(' ') : '';
}
