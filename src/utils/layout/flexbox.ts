// Flexbox layout calculator. Terminal geometry is always integer-cell based.

import type { ComponentNode } from '../../types';
import type { ComputedLayout, FlexItem } from './types';

interface FlexLine {
  items: FlexItem[];
  crossSize: number;
}

export function calculateFlexboxLayout(
  container: ComponentNode,
  availableWidth: number,
  availableHeight: number
): Map<string, ComputedLayout> {
  const layouts = new Map<string, ComputedLayout>();
  const direction = container.layout.direction || 'row';
  const justify = container.layout.justify || 'start';
  const align = container.layout.align || 'start';
  const gap = Math.max(0, Math.round(container.layout.gap || 0));
  const wrap = container.layout.wrap || false;
  const padding = typeof container.layout.padding === 'number' ? Math.max(0, Math.round(container.layout.padding)) : 0;
  const contentWidth = Math.max(0, Math.round(availableWidth) - padding * 2);
  const contentHeight = Math.max(0, Math.round(availableHeight) - padding * 2);
  const isRow = direction === 'row';
  const mainSize = isRow ? contentWidth : contentHeight;

  // Hidden responsive/state children must not reserve terminal cells or gaps.
  const flexItems: FlexItem[] = container.children
    .filter((child) => !child.hidden)
    .map((child) => ({
      id: child.id,
      flexGrow: 0,
      flexShrink: 1,
      flexBasis: 'auto',
      width: child.props.width,
      height: child.props.height,
      minWidth: typeof child.props.minWidth === 'number' ? child.props.minWidth : undefined,
      minHeight: typeof child.props.minHeight === 'number' ? child.props.minHeight : undefined,
    }));

  const lines = wrap
    ? collectFlexLines(flexItems, mainSize, gap, isRow)
    : flexItems.length ? [{ items: flexItems, crossSize: 0 }] : [];
  const containerCrossSize = isRow ? contentHeight : contentWidth;
  let crossOffset = padding;

  lines.forEach((line) => {
    const sizes = resolveFlexItemSizes(line.items, mainSize, gap, isRow);
    const lineCrossSize = align === 'stretch' && lines.length === 1
      ? containerCrossSize
      : line.items.reduce((max, item) => {
          const size = isRow ? resolveHeight(item) : resolveWidth(item);
          return Math.max(max, size);
        }, 0);

    const totalMainSize = sizes.reduce((sum, size) => sum + size, 0);
    const totalGap = Math.max(0, line.items.length - 1) * gap;
    const freeSpace = Math.max(0, mainSize - totalMainSize - totalGap);
    let prefixSize = 0;

    line.items.forEach((item, i) => {
      const itemMainSize = Math.max(0, Math.round(sizes[i]));
      const hasExplicitCrossSize = typeof (isRow ? item.height : item.width) === 'number';
      const itemCrossSize = Math.max(0, Math.round(
        align === 'stretch' && !hasExplicitCrossSize
          ? lineCrossSize
          : isRow
            ? resolveHeight(item)
            : resolveWidth(item)
      ));
      const distributed = justifyOffset(justify, freeSpace, line.items.length, i);
      const mainOffset = padding + prefixSize + gap * i + distributed;
      const crossAlignOffset = calculateAlignOffset(align, lineCrossSize, itemCrossSize);
      const x = Math.round(isRow ? mainOffset : crossOffset + crossAlignOffset);
      const y = Math.round(isRow ? crossOffset + crossAlignOffset : mainOffset);
      const width = isRow ? itemMainSize : itemCrossSize;
      const height = isRow ? itemCrossSize : itemMainSize;
      layouts.set(item.id, createComputedLayout(x, y, width, height, 0, 0));
      prefixSize += itemMainSize;
    });

    crossOffset += Math.round(lineCrossSize) + gap;
  });

  return layouts;
}

/**
 * Integer-cell analogue of CSS justify-content. We compute every item's
 * offset from the same rational distribution and round at the cell boundary,
 * instead of accumulating fractional positions such as x=3.5.
 */
function justifyOffset(justify: string, freeSpace: number, itemCount: number, index: number): number {
  if (freeSpace <= 0 || itemCount <= 0) return 0;
  switch (justify) {
    case 'center': return Math.floor(freeSpace / 2);
    case 'end': return freeSpace;
    case 'space-between':
      return itemCount > 1 ? Math.round((freeSpace * index) / (itemCount - 1)) : 0;
    case 'space-around':
      return Math.round((freeSpace * (index + 0.5)) / itemCount);
    default: return 0;
  }
}

function collectFlexLines(items: FlexItem[], maxSize: number, gap: number, isRow: boolean): FlexLine[] {
  const lines: FlexLine[] = [];
  let currentLine: FlexItem[] = [];
  let currentSize = 0;
  items.forEach((item) => {
    const itemSize = isRow ? resolveWidth(item) : resolveHeight(item);
    const withGap = currentLine.length > 0 ? gap : 0;
    if (currentSize + itemSize + withGap > maxSize && currentLine.length > 0) {
      lines.push({ items: currentLine, crossSize: 0 });
      currentLine = [item];
      currentSize = itemSize;
    } else {
      currentLine.push(item);
      currentSize += itemSize + withGap;
    }
  });
  if (currentLine.length > 0) lines.push({ items: currentLine, crossSize: 0 });
  return lines;
}

function resolveFlexItemSizes(items: FlexItem[], availableSize: number, gap: number, isRow: boolean): number[] {
  const totalGap = Math.max(0, items.length - 1) * gap;
  let remainingSize = Math.max(0, availableSize - totalGap);
  const sizes = items.map((item) => {
    const value = isRow ? item.width : item.height;
    if (typeof value === 'number') {
      const fixed = Math.max(0, Math.round(value));
      remainingSize -= fixed;
      return fixed;
    }
    return -1;
  });

  const fillIndices = sizes.map((size, index) => size === -1 ? index : -1).filter((index) => index >= 0);
  if (fillIndices.length > 0 && remainingSize > 0) {
    const base = Math.floor(remainingSize / fillIndices.length);
    let remainder = remainingSize % fillIndices.length;
    for (const index of fillIndices) {
      sizes[index] = Math.max(1, base + (remainder > 0 ? 1 : 0));
      if (remainder > 0) remainder -= 1;
    }
  } else {
    for (let i = 0; i < sizes.length; i++) {
      if (sizes[i] === -1) sizes[i] = isRow ? resolveWidth(items[i]) : resolveHeight(items[i]);
    }
  }
  return sizes;
}

function resolveWidth(item: FlexItem): number {
  if (typeof item.width === 'number') return Math.max(0, Math.round(item.width));
  return Math.max(1, Math.round(item.minWidth || 10));
}

function resolveHeight(item: FlexItem): number {
  if (typeof item.height === 'number') return Math.max(0, Math.round(item.height));
  return Math.max(1, Math.round(item.minHeight || 3));
}

function calculateAlignOffset(align: string, containerSize: number, itemSize: number): number {
  switch (align) {
    case 'center': return Math.floor((containerSize - itemSize) / 2);
    case 'end': return containerSize - itemSize;
    default: return 0;
  }
}

function createComputedLayout(x: number, y: number, width: number, height: number, padding: number, margin: number): ComputedLayout {
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(0, Math.round(width)),
    height: Math.max(0, Math.round(height)),
    contentBox: {
      x: Math.round(x + padding),
      y: Math.round(y + padding),
      width: Math.max(0, Math.round(width - padding * 2)),
      height: Math.max(0, Math.round(height - padding * 2)),
    },
    paddingBox: { x: Math.round(x), y: Math.round(y), width: Math.max(0, Math.round(width)), height: Math.max(0, Math.round(height)) },
    marginBox: {
      x: Math.round(x - margin),
      y: Math.round(y - margin),
      width: Math.max(0, Math.round(width + margin * 2)),
      height: Math.max(0, Math.round(height + margin * 2)),
    },
  };
}
