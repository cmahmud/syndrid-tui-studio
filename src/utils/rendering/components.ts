// Component-specific renderers

import type { ComponentNode } from '../../types';
import { CharCanvas } from './canvas';
import { renderBox, getContentArea, BORDER_STYLES } from './borders';
import { wrapText, alignText, padText, truncateText } from './text';
import { generateAnsiCodes } from './ansi';
import { padToWidth, sliceByWidth, stringWidth } from './width';
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
} from '../../constants/assets';


function fitLine(text: string, width: number, fillChar = ' '): string {
  return padToWidth(sliceByWidth(text, Math.max(0, width)), Math.max(0, width), fillChar);
}

/**
 * Render a component to a character canvas
 */
export function renderComponent(
  node: ComponentNode,
  width: number,
  height: number,
  colorMode: 'ansi16' | 'ansi256' | 'trueColor' = 'ansi16'
): string[] {
  const canvas = new CharCanvas(width, height);

  // Generate style code (foreground + text decoration only; background handled separately for gradients)
  const hasGradient = !!(
    node.style.backgroundGradient && node.style.backgroundGradient.stops.length >= 2
  );

  const style = generateAnsiCodes(
    {
      color: node.style.color,
      backgroundColor: hasGradient ? undefined : node.style.backgroundColor,
      bold: node.style.bold,
      italic: node.style.italic,
      underline: node.style.underline,
      strikethrough: node.style.strikethrough,
    },
    colorMode
  );

  // Render based on component type
  let content: string[] = [];

  switch (node.type) {
    case 'Text':
      content = renderText(node, width, height);
      break;
    case 'Button':
      content = renderButton(node, width);
      break;
    case 'TextInput':
      content = renderTextInput(node, width, height);
      break;
    case 'TextArea':
      content = renderTextArea(node, width, height);
      break;
    case 'Checkbox':
      content = renderCheckbox(node, width, height);
      break;
    case 'Radio':
      content = renderRadio(node, width, height);
      break;
    case 'Select':
      content = renderSelect(node, width, height);
      break;
    case 'ProgressBar':
      content = renderProgressBar(node, width, height);
      break;
    case 'Gauge':
      content = renderGaugeComponent(node, width, height);
      break;
    case 'Sparkline':
      content = renderSparklineComponent(node, width, height);
      break;
    case 'Log':
      content = renderLog(node, width, height);
      break;
    case 'StatusBar':
      content = renderStatusBarComponent(node, width, height);
      break;
    case 'Toast':
      content = renderToastComponent(node, width, height);
      break;
    case 'Spinner':
      content = renderSpinner(node, width, height);
      break;
    case 'Separator':
      content = renderSeparator(node, width, height);
      break;
    case 'List':
      content = renderList(node, width, height);
      break;
    case 'Table':
      content = renderTable(node, width, height);
      break;
    default:
      // Container or unknown type
      content = renderContainer(node, width, height);
      break;
  }

  // Apply border if needed
  if (node.style.border) {
    const borderConfig = {
      style: node.style.borderStyle || 'single',
      top: node.style.borderTop !== false,
      bottom: node.style.borderBottom !== false,
      left: node.style.borderLeft !== false,
      right: node.style.borderRight !== false,
      topStyle: node.style.borderTopStyle,
      rightStyle: node.style.borderRightStyle,
      bottomStyle: node.style.borderBottomStyle,
      leftStyle: node.style.borderLeftStyle,
      corners: node.style.borderCorners !== false,
    };
    content = renderBox(content, width, height, borderConfig);
  }

  // For gradient backgrounds, pre-fill every cell with (textStyle + gradientBg),
  // then write content characters without re-setting the style so the gradient shows through.
  if (hasGradient) {
    canvas.fillGradient(0, 0, width, height, node.style.backgroundGradient!, style);
    canvas.writeLines(0, 0, content); // no style arg → preserves per-cell gradient styles
  } else {
    canvas.writeLines(0, 0, content, style);
  }

  return canvas.toLines();
}

function renderText(node: ComponentNode, width: number, height: number): string[] {
  const text = (node.props.content as string) || '';
  const contentArea = node.style.border
    ? getContentArea(width, height, { style: 'single' })
    : { width, height };

  const lines = wrapText(text, contentArea.width);
  const aligned = alignText(lines.slice(0, contentArea.height), contentArea.width, 'left');

  // Pad to height
  while (aligned.length < contentArea.height) {
    aligned.push(' '.repeat(contentArea.width));
  }

  return aligned;
}

function renderButton(node: ComponentNode, width: number): string[] {
  const label = (node.props.label as string) || 'Button';
  const iconLeft =
    node.props.iconLeftEnabled && node.props.iconLeft ? (node.props.iconLeft as string) : '';
  const iconRight =
    node.props.iconRightEnabled && node.props.iconRight ? (node.props.iconRight as string) : '';
  const number = node.props.number as number | undefined;
  const separated = node.props.separated as boolean;

  if (!node.style.border) {
    // No border - just render text
    const left = iconLeft ? `${iconLeft} ` : '';
    const right = iconRight ? ` ${iconRight}` : '';
    const buttonText = `${left}${label}${right}`;
    return [buttonText];
  }

  const borderStyle = BORDER_STYLES[node.style.borderStyle || 'rounded'] || BORDER_STYLES.rounded;
  const lines: string[] = [];

  if (separated && iconLeft) {
    // Separated button with divider
    const leftSection = number !== undefined ? `${iconLeft} ${number}` : iconLeft;
    const leftWidth = stringWidth(leftSection) + 2; // +2 for padding
    const rightText = `${label}${iconRight ? ' ' + iconRight : ''}`;
    const rightWidth = width - leftWidth - 3; // -3 for borders and divider

    // Determine divider characters based on border style
    const divTop =
      node.style.borderStyle === 'single' || node.style.borderStyle === 'rounded'
        ? '┰'
        : node.style.borderStyle === 'double'
          ? '╦'
          : '┰';
    const divBottom =
      node.style.borderStyle === 'single' || node.style.borderStyle === 'rounded'
        ? '┴'
        : node.style.borderStyle === 'double'
          ? '╩'
          : '┴';

    // Top border: ╭───┰───────────╮
    lines.push(
      borderStyle.topLeft +
        borderStyle.top.repeat(leftWidth) +
        divTop +
        borderStyle.top.repeat(rightWidth) +
        borderStyle.topRight
    );

    // Content: │ + │ Add Agent │
    lines.push(
      borderStyle.left +
        fitLine(` ${leftSection} `, leftWidth + 1) +
        '│' +
        fitLine(` ${rightText} `, rightWidth + 1) +
        borderStyle.right
    );

    // Bottom border: ╰───┴───────────╯
    lines.push(
      borderStyle.bottomLeft +
        borderStyle.bottom.repeat(leftWidth) +
        divBottom +
        borderStyle.bottom.repeat(rightWidth) +
        borderStyle.bottomRight
    );
  } else {
    // Standard button
    const left = iconLeft ? `${iconLeft} ` : '';
    const right = iconRight ? ` ${iconRight}` : '';
    const buttonText = ` ${left}${label}${right} `;
    const contentWidth = width - 2; // -2 for left/right borders

    // Top border
    lines.push(borderStyle.topLeft + borderStyle.top.repeat(contentWidth) + borderStyle.topRight);

    // Content
    lines.push(borderStyle.left + padText(buttonText, contentWidth, 'center') + borderStyle.right);

    // Bottom border
    lines.push(
      borderStyle.bottomLeft + borderStyle.bottom.repeat(contentWidth) + borderStyle.bottomRight
    );
  }

  return lines;
}

function renderTextInput(node: ComponentNode, width: number, height: number): string[] {
  const placeholder = (node.props.placeholder as string) || '';
  const value = (node.props.value as string) || '';
  const contentArea = node.style.border
    ? getContentArea(width, height, { style: 'single' })
    : { width, height };

  const displayText = value || placeholder;
  const truncated = truncateText(displayText, contentArea.width - 2);
  const padded = ' ' + padToWidth(truncated, Math.max(0, contentArea.width - 2), '_') + ' ';

  const lines = [fitLine(padded, contentArea.width)];
  while (lines.length < contentArea.height) {
    lines.push(' '.repeat(contentArea.width));
  }

  return lines;
}

function renderCheckbox(node: ComponentNode, width: number, height: number): string[] {
  const checked = node.props.checked as boolean;
  const label = (node.props.label as string) || 'Checkbox';
  const contentArea = node.style.border
    ? getContentArea(width, height, { style: 'single' })
    : { width, height };

  const checkbox = checked ? '[✓]' : '[ ]';
  const text = `${checkbox} ${label}`;
  const truncated = truncateText(text, contentArea.width);

  const lines = [fitLine(truncated, contentArea.width)];
  while (lines.length < contentArea.height) {
    lines.push(' '.repeat(contentArea.width));
  }

  return lines;
}

function renderRadio(node: ComponentNode, width: number, height: number): string[] {
  const selected = node.props.selected as boolean;
  const label = (node.props.label as string) || 'Radio';
  const contentArea = node.style.border
    ? getContentArea(width, height, { style: 'single' })
    : { width, height };

  const radio = selected ? '(•)' : '( )';
  const text = `${radio} ${label}`;
  const truncated = truncateText(text, contentArea.width);

  const lines = [fitLine(truncated, contentArea.width)];
  while (lines.length < contentArea.height) {
    lines.push(' '.repeat(contentArea.width));
  }

  return lines;
}

function renderSelect(node: ComponentNode, width: number, height: number): string[] {
  const items = (node.props.items as string[]) || [];
  const selected = (node.props.selectedIndex as number) || 0;
  const contentArea = node.style.border
    ? getContentArea(width, height, { style: 'single' })
    : { width, height };

  const selectedItem = items[selected] || 'Select...';
  const text = `${truncateText(selectedItem, contentArea.width - 3)} ▼`;

  const lines = [fitLine(text, contentArea.width)];
  while (lines.length < contentArea.height) {
    lines.push(' '.repeat(contentArea.width));
  }

  return lines;
}

function renderProgressBar(node: ComponentNode, width: number, height: number): string[] {
  const value = (node.props.value as number) || 0;
  const max = (node.props.max as number) || 100;
  const showPercent = (node.props.showPercent as boolean) ?? true;
  const contentArea = node.style.border
    ? getContentArea(width, height, { style: 'single' })
    : { width, height };

  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const barWidth = contentArea.width - (showPercent ? 5 : 0);
  const bar = renderBar((node.props.barStyle as string) || 'blocks', barWidth, percentage);
  const text = showPercent ? `${bar} ${percentage.toFixed(0)}%` : bar;

  const lines = [fitLine(text, contentArea.width)];
  while (lines.length < contentArea.height) {
    lines.push(' '.repeat(contentArea.width));
  }

  return lines;
}

function renderGaugeComponent(node: ComponentNode, width: number, height: number): string[] {
  const value = (node.props.value as number) || 0;
  const max = (node.props.max as number) || 100;
  const showPercent = (node.props.showPercent as boolean) ?? true;
  const label = (node.props.label as string) || 'Gauge';
  const contentArea = node.style.border
    ? getContentArea(width, height, { style: 'single' })
    : { width, height };

  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const overlayText = showPercent ? `${label} ${percentage.toFixed(0)}%` : label;
  const text = renderGauge((node.props.barStyle as string) || 'blocks', contentArea.width, percentage, overlayText);

  const lines = [fitLine(text, contentArea.width)];
  while (lines.length < contentArea.height) {
    lines.push(' '.repeat(contentArea.width));
  }

  return lines;
}

function renderSparklineComponent(node: ComponentNode, width: number, height: number): string[] {
  const data = (node.props.data as number[]) || [];
  const max = typeof node.props.max === 'number' ? node.props.max : undefined;
  const contentArea = node.style.border
    ? getContentArea(width, height, { style: 'single' })
    : { width, height };

  const text = renderSparkline(data, contentArea.width, max);
  const lines = [fitLine(text, contentArea.width)];
  while (lines.length < contentArea.height) {
    lines.push(' '.repeat(contentArea.width));
  }

  return lines;
}

function renderLog(node: ComponentNode, width: number, height: number): string[] {
  const lines = (node.props.lines as string[]) || [];
  const contentArea = node.style.border
    ? getContentArea(width, height, { style: 'single' })
    : { width, height };

  return tailLines(lines, contentArea.height, contentArea.width);
}

function renderTextArea(node: ComponentNode, width: number, height: number): string[] {
  const value = (node.props.value as string) || '';
  const placeholder = (node.props.placeholder as string) || '';
  const lines = (value || placeholder).split('\n');
  const contentArea = node.style.border
    ? getContentArea(width, height, { style: 'single' })
    : { width, height };

  return headLines(lines, contentArea.height, contentArea.width);
}

function renderStatusBarComponent(node: ComponentNode, width: number, height: number): string[] {
  const items = (node.props.items as { key?: string; label?: string }[]) || [];
  const gap = typeof node.props.gap === 'number' ? node.props.gap : 2;
  const contentArea = node.style.border
    ? getContentArea(width, height, { style: 'single' })
    : { width, height };

  const text = renderStatusBar(items, gap);
  const lines = [fitLine(text, contentArea.width)];
  while (lines.length < contentArea.height) {
    lines.push(' '.repeat(contentArea.width));
  }

  return lines;
}

function renderToastComponent(node: ComponentNode, width: number, height: number): string[] {
  const message = (node.props.message as string) || '';
  const variant = (node.props.variant as string) || 'info';
  const contentArea = node.style.border
    ? getContentArea(width, height, { style: 'single' })
    : { width, height };

  const text = renderToast(message, variant);
  const lines = [fitLine(text, contentArea.width)];
  while (lines.length < contentArea.height) {
    lines.push(' '.repeat(contentArea.width));
  }

  return lines;
}

function renderSpinner(node: ComponentNode, width: number, height: number): string[] {
  const contentArea = node.style.border
    ? getContentArea(width, height, { style: 'single' })
    : { width, height };
  const preset =
    SPINNER_PRESETS[(node.props.spinnerStyle as string) || 'dots'] || SPINNER_PRESETS.dots;
  const frameIdx = Math.min(Number(node.props.frame ?? 0), preset.frames.length - 1);
  const frame = preset.frames[Math.max(0, frameIdx)]; // Static frame for export
  const label = (node.props.label as string) ?? 'Loading...';

  const text = label ? `${frame} ${label}` : frame;
  const truncated = truncateText(text, contentArea.width);

  const lines = [fitLine(truncated, contentArea.width)];
  while (lines.length < contentArea.height) {
    lines.push(' '.repeat(contentArea.width));
  }

  return lines;
}

function renderSeparator(node: ComponentNode, width: number, height: number): string[] {
  const orientation = (node.props.orientation as string) || 'horizontal';
  const lineStyle = (node.props.lineStyle as string) || 'single';
  const char = getSeparatorChar(lineStyle, orientation);

  if (orientation === 'vertical') {
    return Array(Math.max(1, height)).fill(fitLine(char, width));
  }
  return [char.repeat(Math.max(1, width))];
}

function renderList(node: ComponentNode, width: number, height: number): string[] {
  // Items are { label, icon, hotkey } objects (see COMPONENT_LIBRARY's List
  // defaults and Canvas.tsx's rendering), not plain strings — treating them
  // as strings here crashed truncateText/visibleLength (no .replace on an
  // object) and took the whole app down with no error boundary to catch it.
  const rawItems = (node.props.items as unknown[]) || [];
  const multiSelect = !!node.props.multiSelect;
  const items = rawItems.map((item) =>
    typeof item === 'string'
      ? { label: item, icon: '•' }
      : (item as { label?: string; icon?: string; checked?: boolean })
  );
  const contentArea = node.style.border
    ? getContentArea(width, height, { style: 'single' })
    : { width, height };

  const lines: string[] = [];
  for (let i = 0; i < Math.min(items.length, contentArea.height); i++) {
    const checkbox = multiSelect ? `[${items[i].checked ? 'x' : ' '}] ` : '';
    const prefix = `${checkbox}${items[i].icon || '•'} `;
    const text = `${prefix}${truncateText(items[i].label || 'Item', contentArea.width - stringWidth(prefix))}`;
    lines.push(fitLine(text, contentArea.width));
  }

  while (lines.length < contentArea.height) {
    lines.push(' '.repeat(contentArea.width));
  }

  return lines;
}

function renderTable(node: ComponentNode, width: number, height: number): string[] {
  const headers = (node.props.columns as string[]) || ['Column 1', 'Column 2'];
  const rows = (node.props.rows as string[][]) || [];
  const contentArea = node.style.border
    ? getContentArea(width, height, { style: 'single' })
    : { width, height };

  const colWidth = Math.floor(contentArea.width / headers.length);
  const lines: string[] = [];

  // Header
  const headerLine = headers
    .map((h) => padText(truncateText(h, colWidth), colWidth, 'left'))
    .join('');
  lines.push(fitLine(headerLine, contentArea.width));
  lines.push('─'.repeat(contentArea.width));

  // Rows
  for (let i = 0; i < Math.min(rows.length, contentArea.height - 2); i++) {
    const row = rows[i] || [];
    const rowLine = row
      .map((cell) => padText(truncateText(String(cell), colWidth), colWidth, 'left'))
      .join('');
    lines.push(fitLine(rowLine, contentArea.width));
  }

  while (lines.length < contentArea.height) {
    lines.push(' '.repeat(contentArea.width));
  }

  return lines;
}

function renderContainer(node: ComponentNode, width: number, height: number): string[] {
  const contentArea = node.style.border
    ? getContentArea(width, height, { style: 'single' })
    : { width, height };

  const lines: string[] = [];
  for (let i = 0; i < contentArea.height; i++) {
    lines.push(' '.repeat(contentArea.width));
  }

  return lines;
}
