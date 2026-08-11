// Grid layout calculator — all geometry is quantized to terminal cells.

import type { ComponentNode } from '../../types';
import type { ComputedLayout } from './types';

export function calculateGridLayout(
  container: ComponentNode,
  availableWidth: number,
  availableHeight: number
): Map<string, ComputedLayout> {
  const layouts = new Map<string, ComputedLayout>();
  const columns = Math.max(1, Math.round(container.layout.columns || 2));
  const rows = Math.max(1, Math.round(container.layout.rows || 2));
  const columnGap = Math.max(0, Math.round(container.layout.columnGap || 0));
  const rowGap = Math.max(0, Math.round(container.layout.rowGap || 0));
  const padding = typeof container.layout.padding === 'number' ? Math.max(0, Math.round(container.layout.padding)) : 0;
  const contentWidth = Math.max(0, Math.round(availableWidth) - padding * 2);
  const contentHeight = Math.max(0, Math.round(availableHeight) - padding * 2);
  const totalColumnGap = Math.max(0, columns - 1) * columnGap;
  const totalRowGap = Math.max(0, rows - 1) * rowGap;
  const usableWidth = Math.max(0, contentWidth - totalColumnGap);
  const usableHeight = Math.max(0, contentHeight - totalRowGap);
  const baseColumnWidth = Math.floor(usableWidth / columns);
  const columnRemainder = usableWidth % columns;
  const baseRowHeight = Math.floor(usableHeight / rows);
  const rowRemainder = usableHeight % rows;
  const columnWidths = Array.from({ length: columns }, (_, index) => baseColumnWidth + (index < columnRemainder ? 1 : 0));
  const rowHeights = Array.from({ length: rows }, (_, index) => baseRowHeight + (index < rowRemainder ? 1 : 0));
  const visibleChildren = container.children.filter((child) => !child.hidden);

  visibleChildren.forEach((child, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    if (row >= rows) return;
    const x = padding + columnWidths.slice(0, column).reduce((sum, width) => sum + width, 0) + column * columnGap;
    const y = padding + rowHeights.slice(0, row).reduce((sum, height) => sum + height, 0) + row * rowGap;
    const cellWidth = columnWidths[column];
    const cellHeight = rowHeights[row];
    let width = cellWidth;
    let height = cellHeight;
    if (typeof child.props.width === 'number') width = Math.min(Math.max(0, Math.round(child.props.width)), cellWidth);
    else if (child.props.width === 'auto') width = Math.min(20, cellWidth);
    if (typeof child.props.height === 'number') height = Math.min(Math.max(0, Math.round(child.props.height)), cellHeight);
    else if (child.props.height === 'auto') height = Math.min(3, cellHeight);
    layouts.set(child.id, {
      x, y, width, height,
      contentBox: { x, y, width, height },
      paddingBox: { x, y, width, height },
      marginBox: { x, y, width, height },
    });
  });
  return layouts;
}
