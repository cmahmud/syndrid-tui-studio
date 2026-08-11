// Absolute positioning calculator — all geometry is integer terminal cells.

import type { ComponentNode } from '../../types';
import type { ComputedLayout } from './types';

export function calculateAbsoluteLayout(
  container: ComponentNode,
  availableWidth: number,
  availableHeight: number
): Map<string, ComputedLayout> {
  const layouts = new Map<string, ComputedLayout>();
  const padding = typeof container.layout.padding === 'number' ? Math.max(0, Math.round(container.layout.padding)) : 0;

  container.children.filter((child) => !child.hidden).forEach((child) => {
    const x = Math.round((typeof child.layout.x === 'number' ? child.layout.x : 0) + padding);
    const y = Math.round((typeof child.layout.y === 'number' ? child.layout.y : 0) + padding);
    let width = 20;
    let height = 3;
    if (typeof child.props.width === 'number') width = Math.max(0, Math.round(child.props.width));
    else if (child.props.width === 'fill') width = Math.max(0, Math.round(availableWidth) - x - padding);
    if (typeof child.props.height === 'number') height = Math.max(0, Math.round(child.props.height));
    else if (child.props.height === 'fill') height = Math.max(0, Math.round(availableHeight) - y - padding);
    layouts.set(child.id, {
      x, y, width, height,
      contentBox: { x, y, width, height },
      paddingBox: { x, y, width, height },
      marginBox: { x, y, width, height },
    });
  });
  return layouts;
}
