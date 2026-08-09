import type { ComponentNode } from '../../../types';
import { escJsx } from '../escape';
import {
  PROGRESSBAR_STYLES,
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
  nearestAnsi16,
  nearestAnsi256,
  resolveBackgroundColor,
} from './shared';

export function exportToInk(root: ComponentNode, colorMode: ExportColorMode = 'truecolor'): string {
  const extras = new Set<string>();
  collectInkImports(root, extras);

  let importLines = `import React from 'react';\nimport { render, Box, Text } from 'ink';`;
  if (extras.has('TextInput')) importLines += `\nimport TextInput from 'ink-text-input';`;
  if (extras.has('SelectInput')) importLines += `\nimport SelectInput from 'ink-select-input';`;
  if (extras.has('Spinner')) importLines += `\nimport Spinner from 'ink-spinner';`;

  const packageNote = buildPackageNote(extras);

  return `${importLines}

function App() {
  return (
${generateInkNode(root, 2, colorMode)}  );
}

render(<App />);
${packageNote}`;
}

function buildPackageNote(extras: Set<string>): string {
  const pkgMap: Record<string, string> = {
    TextInput: 'ink-text-input',
    SelectInput: 'ink-select-input',
    Spinner: 'ink-spinner',
  };
  const needed = Array.from(extras)
    .map((k) => pkgMap[k])
    .filter(Boolean);
  if (!needed.length) return '';
  return `\n// Install extra packages:\n// npm install ${needed.join(' ')}\n`;
}

function collectInkImports(node: ComponentNode, imports: Set<string>): void {
  if (node.type === 'TextInput') imports.add('TextInput');
  if (node.type === 'Select') imports.add('SelectInput');
  if (node.type === 'Spinner') imports.add('Spinner');
  for (const child of node.children) collectInkImports(child, imports);
}

function generateInkNode(node: ComponentNode, indent: number, colorMode: ExportColorMode): string {
  if (node.hidden) return '';
  const sp = '  '.repeat(indent);

  switch (node.type) {
    case 'Screen':
    case 'Box':
    case 'Grid':
    case 'Modal': {
      const props = inkBoxProps(node, colorMode);
      const children = node.children.map((c) => generateInkNode(c, indent + 1, colorMode)).join('');
      return children ? `${sp}<Box${props}>\n${children}${sp}</Box>\n` : `${sp}<Box${props} />\n`;
    }

    case 'Spacer':
      return `${sp}<Box flexGrow={1} />\n`;

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
      return `${sp}<Text${inkTextProps(node, colorMode)}>{${JSON.stringify(content)}}</Text>\n`;
    }

    case 'Text': {
      const content = (node.props.content as string) || '';
      return `${sp}<Text${inkTextProps(node, colorMode)}>${escJsx(content)}</Text>\n`;
    }

    case 'Button': {
      const label = (node.props.label as string) || 'Button';
      // Ink has no onClick prop at this layer (keyboard-only; a real click
      // needs the useInput hook plus a focus system this exporter doesn't
      // model) — noted rather than wired to something that would never fire.
      return `${eventComment(sp, node.events.onClick, 'onClick')}${sp}<Text${inkTextProps(node, colorMode)} bold inverse>  ${escJsx(label)}  </Text>\n`;
    }

    case 'TextInput': {
      const placeholder = JSON.stringify((node.props.placeholder as string) || '');
      const value = JSON.stringify((node.props.value as string) || '');
      // ink-text-input's real onChange prop (verified — this widget already
      // uses the real package, not a hand-rolled <Text>, unlike most others).
      const onChange = node.events.onChange ? `() => ${node.events.onChange}()` : '() => {}';
      return `${sp}<TextInput value={${value}} placeholder={${placeholder}} onChange={${onChange}} />\n`;
    }

    case 'TextArea': {
      // No official multiline-input package (ink-text-input is single-line);
      // consider a community package like ink-multiline-input for a real
      // editable one. Static multi-line preview, same shape as Log above.
      const value = (node.props.value as string) || '';
      const placeholder = (node.props.placeholder as string) || '';
      const height = typeof node.props.height === 'number' ? node.props.height : 5;
      const lines = headLines((value || placeholder).split('\n'), height);
      const rows = lines.map((l, i) => `${sp}  <Text key={${i}}>${escJsx(l)}</Text>`).join('\n');
      return `${eventComment(sp, node.events.onChange, 'onChange')}${sp}<Box${inkBoxProps(node, colorMode)} flexDirection="column">\n${rows}\n${sp}</Box>\n`;
    }

    case 'Checkbox': {
      const label = (node.props.label as string) || '';
      const checked = !!node.props.checked;
      const icon = checked
        ? (node.props.checkedIcon as string) || '✓'
        : (node.props.uncheckedIcon as string) || '○';
      return `${eventComment(sp, node.events.onChange, 'onChange')}${sp}<Text${inkTextProps(node, colorMode)}>{/* checked={${checked}} */} ${escJsx(icon)} ${escJsx(label)}</Text>\n`;
    }

    case 'Radio': {
      const label = (node.props.label as string) || '';
      const selected = !!node.props.checked;
      const icon = selected
        ? (node.props.selectedIcon as string) || '◉'
        : (node.props.unselectedIcon as string) || '○';
      return `${eventComment(sp, node.events.onChange, 'onChange')}${sp}<Text${inkTextProps(node, colorMode)}>{/* selected={${selected}} */} ${escJsx(icon)} ${escJsx(label)}</Text>\n`;
    }

    case 'Toggle': {
      const label = (node.props.label as string) || '';
      const on = !!node.props.value;
      return `${eventComment(sp, node.events.onChange, 'onChange')}${sp}<Text${inkTextProps(node, colorMode)}>{/* on={${on}} */} {${on} ? '[ON ]' : '[OFF]'} ${escJsx(label)}</Text>\n`;
    }

    case 'Select': {
      const options = (node.props.options as string[]) || ['Option 1', 'Option 2'];
      const items = options
        .map(
          (o: string) =>
            `{ label: ${JSON.stringify(o)}, value: ${JSON.stringify(o.toLowerCase().replace(/\s+/g, '_'))} }`
        )
        .join(', ');
      // ink-select-input's real onSelect prop (verified — real package, like TextInput above).
      const onSelect = node.events.onChange ? `() => ${node.events.onChange}()` : '() => {}';
      return `${sp}<SelectInput items={[${items}]} onSelect={${onSelect}} />\n`;
    }

    case 'Spinner': {
      // ink-spinner type names come from cli-spinners, same as SPINNER_PRESETS keys
      const style = (node.props.spinnerStyle as string) || 'dots';
      const label = (node.props.label as string) ?? 'Loading...';
      return `${sp}<Text${inkTextProps(node, colorMode)}><Spinner type="${style}" />${label ? ` ${escJsx(label)}` : ''}</Text>\n`;
    }

    case 'ProgressBar': {
      const value = (node.props.value as number) ?? 0;
      const max = (node.props.max as number) ?? 100;
      const width = (node.props.width as number) ?? 20;
      const style =
        PROGRESSBAR_STYLES[(node.props.barStyle as string) || 'blocks'] || PROGRESSBAR_STYLES.blocks;
      const showPercent = (node.props.showPercent as boolean) ?? true;
      return (
        `${sp}<Text${inkTextProps(node, colorMode)}>\n` +
        `${sp}  {${JSON.stringify(style.leftCap || '')}}{'${style.filled}'.repeat(Math.round(${value} / ${max} * ${width}))}` +
        `{'${style.empty}'.repeat(${width} - Math.round(${value} / ${max} * ${width}))}{${JSON.stringify(style.rightCap || '')}}${showPercent ? ` ${Math.round((value / max) * 100)}%` : ''}\n` +
        `${sp}</Text>\n`
      );
    }

    case 'Gauge': {
      const value = (node.props.value as number) ?? 0;
      const max = (node.props.max as number) ?? 100;
      const width = typeof node.props.width === 'number' ? node.props.width : 24;
      const pct = Math.min(100, Math.max(0, (value / max) * 100));
      const showPercent = (node.props.showPercent as boolean) ?? true;
      const label = (node.props.label as string) || 'Gauge';
      const overlayText = showPercent ? `${label} ${pct.toFixed(0)}%` : label;
      const bar = renderGauge((node.props.barStyle as string) || 'blocks', width, pct, overlayText);
      return `${sp}<Text${inkTextProps(node, colorMode)}>{${JSON.stringify(bar)}}</Text>\n`;
    }

    case 'Sparkline': {
      const data = (node.props.data as number[]) || [];
      const width = typeof node.props.width === 'number' ? node.props.width : 20;
      const max = typeof node.props.max === 'number' ? node.props.max : undefined;
      const bar = renderSparkline(data, width, max);
      return `${sp}<Text${inkTextProps(node, colorMode)}>{${JSON.stringify(bar)}}</Text>\n`;
    }

    case 'Log': {
      const lines = (node.props.lines as string[]) || [];
      const height = typeof node.props.height === 'number' ? node.props.height : 6;
      const visible = tailLines(lines, height);
      const rows = visible
        .map((l, i) => `${sp}  <Text key={${i}}>${escJsx(l)}</Text>`)
        .join('\n');
      return `${sp}<Box${inkBoxProps(node, colorMode)} flexDirection="column">\n${rows}\n${sp}</Box>\n`;
    }

    case 'StatusBar': {
      const items = (node.props.items as { key?: string; label?: string }[]) || [];
      const gap = typeof node.props.gap === 'number' ? node.props.gap : 2;
      const text = renderStatusBar(items, gap);
      return `${sp}<Text${inkTextProps(node, colorMode)}>{${JSON.stringify(text)}}</Text>\n`;
    }

    case 'Toast': {
      // no official toast/notification package for Ink; hand-rolled preview.
      const message = (node.props.message as string) || '';
      const variant = (node.props.variant as string) || 'info';
      const text = renderToast(message, variant);
      return `${sp}<Text${inkTextProps(node, colorMode)}>{${JSON.stringify(text)}}</Text>\n`;
    }

    case 'List': {
      const items = (node.props.items as any[]) || [];
      const multiSelect = !!node.props.multiSelect;
      const rows = items
        .map((item: any, i: number) => {
          const d = typeof item === 'string' ? { label: item, icon: '•' } : item;
          const checkbox = multiSelect ? `[${d.checked ? 'x' : ' '}] ` : '';
          return `${sp}  <Text key={${JSON.stringify(`${d.label}-${i}`)}}>${checkbox}${escJsx(d.icon || '•')} ${escJsx(d.label)}</Text>`;
        })
        .join('\n');
      // Rendered as a plain static Box/Text list, not ink-select-input's
      // SelectInput (an existing design choice, not changed here) — so
      // there's no real onSelect prop to wire; onKeyPress would need
      // Ink's useInput hook, which isn't set up in this exporter either.
      const comment =
        eventComment(sp, node.events.onSelect, 'onSelect') + eventComment(sp, node.events.onKeyPress, 'onKeyPress');
      return `${comment}${sp}<Box${inkBoxProps(node, colorMode)} flexDirection="column">\n${rows}\n${sp}</Box>\n`;
    }

    case 'Menu': {
      const items = (node.props.items as any[]) || [];
      const isRow = (node.layout as any).direction === 'row';
      const rows = items
        .map((item: any) => {
          const d = typeof item === 'string' ? { label: item, icon: '' } : item;
          const prefix = d.icon ? `${escJsx(d.icon)} ` : '';
          return `${sp}  <Text key={${JSON.stringify(d.label)}}>${prefix}${escJsx(d.label)}</Text>`;
        })
        .join('\n');
      return `${sp}<Box${inkBoxProps(node, colorMode)} flexDirection="${isRow ? 'row' : 'column'}" gap={1}>\n${rows}\n${sp}</Box>\n`;
    }

    case 'Tabs': {
      const tabs = (node.props.tabs as any[]) || [];
      const rows = tabs
        .map((tab: any) => {
          const label = typeof tab === 'string' ? tab : tab.label || 'Tab';
          return `${sp}  <Text key={${JSON.stringify(label)}} underline> ${escJsx(label)} </Text>`;
        })
        .join('\n');
      return `${sp}<Box${inkBoxProps(node, colorMode)} flexDirection="row">\n${rows}\n${sp}</Box>\n`;
    }

    case 'Table': {
      const columns = (node.props.columns as string[]) || ['Column 1', 'Column 2'];
      const rows = (node.props.rows as string[][]) || [];
      const colW = 14;
      const header = columns.map((c: string) => c.slice(0, colW).padEnd(colW)).join(' │ ');
      const divider = columns.map(() => '─'.repeat(colW)).join('─┼─');
      const dataRows = rows.map((row: string[]) =>
        columns
          .map((_: string, ci: number) => (row[ci] || '').slice(0, colW).padEnd(colW))
          .join(' │ ')
      );
      const lines = [header, divider, ...dataRows]
        .map((l, i) => `${sp}  <Text key={${i}}>{${JSON.stringify(l)}}</Text>`)
        .join('\n');
      return `${eventComment(sp, node.events.onKeyPress, 'onKeyPress')}${sp}<Box${inkBoxProps(node, colorMode)} flexDirection="column">\n${lines}\n${sp}</Box>\n`;
    }

    case 'Tree': {
      const items = (node.props.items as any[]) || [];
      const flatLines: string[] = [];
      const walk = (item: any, depth: number) => {
        const d = typeof item === 'string' ? { label: item, children: [] } : item;
        const pad = '  '.repeat(depth) + (depth > 0 ? '├─ ' : '');
        flatLines.push(
          `${sp}  <Text key={${JSON.stringify(pad + d.label)}}>{${JSON.stringify(pad + d.label)}}</Text>`
        );
        (d.children || []).forEach((child: any) => walk(child, depth + 1));
      };
      items.forEach((item: any) => walk(item, 0));
      return `${eventComment(sp, node.events.onKeyPress, 'onKeyPress')}${sp}<Box${inkBoxProps(node, colorMode)} flexDirection="column">\n${flatLines.join('\n')}\n${sp}</Box>\n`;
    }

    case 'Breadcrumb': {
      const items = (node.props.items as any[]) || [];
      const separator = (node.props.separator as string) || '/';
      const text = items
        .map((i: any) => (typeof i === 'string' ? i : i.label || ''))
        .join(` ${separator} `);
      return `${sp}<Text${inkTextProps(node, colorMode)}>{${JSON.stringify(text)}}</Text>\n`;
    }

    default:
      return `${sp}{/* ${node.type}: ${escJsx(node.name)} */}\n`;
  }
}

/**
 * A one-line JSX comment noting an event with no real prop to wire it to —
 * Ink is keyboard-only (no onClick prop anywhere) and most components here
 * are hand-rolled <Text>/<Box> (not TextInput/SelectInput's real packages),
 * so there's nothing to call. Returns '' when no handler is set.
 */
function eventComment(sp: string, handler: string | undefined, eventName: string): string {
  if (!handler) return '';
  return `${sp}{/* ${eventName} ("${handler}") not wired — no prop for this on a plain <Text>/<Box>; see useInput for real keyboard handling */}\n`;
}

/** chalk (which Ink's color/backgroundColor props resolve through) suffixes bright variants with "Bright" — redBright, not brightRed. */
function toChalkColorName(index: number): string {
  const base = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
  return index < 8 ? base[index] : `${base[index - 8]}Bright`;
}

/** Resolve a color for Ink's chalk-backed color props, respecting the color-tier mode. */
function inkColor(value: string, colorMode: ExportColorMode): string {
  if (colorMode === 'truecolor') return value;
  const named = ansi16IndexOfName(value);
  if (colorMode === 'ansi16') {
    if (named != null) return toChalkColorName(named);
    if (/^#[0-9a-fA-F]{3,6}$/.test(value)) return toChalkColorName(nearestAnsi16(value));
    return value;
  }
  // ansi256: Ink's real color prop supports "ansi256(N)" (0-255), verified
  // against Ink's colorize.ts source — not a chalk keyword guess.
  if (named != null) return `ansi256(${named})`;
  if (/^#[0-9a-fA-F]{3,6}$/.test(value)) return `ansi256(${nearestAnsi256(value)})`;
  return value;
}

/** Box-level props: flexbox layout + border from node.layout + node.style */
function inkBoxProps(node: ComponentNode, colorMode: ExportColorMode): string {
  const props: string[] = [];
  const layout = node.layout as any;

  if (layout.direction === 'row') props.push('flexDirection="row"');
  if (layout.gap > 0) props.push(`gap={${layout.gap}}`);
  if (layout.padding > 0) props.push(`padding={${layout.padding}}`);

  const jMap: Record<string, string> = {
    center: 'center',
    end: 'flex-end',
    'space-between': 'space-between',
    between: 'space-between',
    'space-around': 'space-around',
    around: 'space-around',
    'space-evenly': 'space-evenly',
    evenly: 'space-evenly',
  };
  if (layout.justify && jMap[layout.justify])
    props.push(`justifyContent="${jMap[layout.justify]}"`);

  const aMap: Record<string, string> = { center: 'center', end: 'flex-end' };
  if (layout.align && aMap[layout.align]) props.push(`alignItems="${aMap[layout.align]}"`);

  if (typeof layout.width === 'number' && layout.width > 0) props.push(`width={${layout.width}}`);
  else if (layout.width === 'fill' || layout.width === 'fill_container') props.push('flexGrow={1}');
  if (typeof layout.height === 'number' && layout.height > 0)
    props.push(`height={${layout.height}}`);

  const backgroundColor = resolveBackgroundColor(node.style);
  if (backgroundColor) props.push(`backgroundColor="${inkColor(backgroundColor, colorMode)}"`);

  if (node.style.border) {
    const bsMap: Record<string, string> = {
      single: 'single',
      double: 'double',
      round: 'round',
      bold: 'bold',
      classic: 'classic',
    };
    const bs = bsMap[(node.style.borderStyle as string) || 'single'] || 'single';
    props.push(`borderStyle="${bs}"`);
    if (node.style.borderColor)
      props.push(`borderColor="${inkColor(node.style.borderColor, colorMode)}"`);
  }

  return props.length ? ' ' + props.join(' ') : '';
}

/** Text-level props: color, bold, italic, underline from node.style */
function inkTextProps(node: ComponentNode, colorMode: ExportColorMode): string {
  const props: string[] = [];
  if (node.style.color) props.push(`color="${inkColor(node.style.color, colorMode)}"`);
  const backgroundColor = resolveBackgroundColor(node.style);
  if (backgroundColor) props.push(`backgroundColor="${inkColor(backgroundColor, colorMode)}"`);
  if (node.style.bold) props.push('bold');
  if (node.style.italic) props.push('italic');
  if (node.style.underline) props.push('underline');
  if ((node.style as any).strikethrough) props.push('strikethrough');
  return props.length ? ' ' + props.join(' ') : '';
}
