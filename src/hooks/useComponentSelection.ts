// Click-to-select, hover, and context-menu handling for a single canvas component.
// Second slice of the Canvas.tsx decomposition (see todo.md).

import { useState, type MouseEvent } from 'react';
import { useSelectionStore } from '../stores';
import type { ComponentNode } from '../types';

export function useComponentSelection(node: ComponentNode) {
  const selectionStore = useSelectionStore();
  const [isHovered, setIsHovered] = useState(false);

  const isSelected = selectionStore.selectedIds.has(node.id);

  const handleMouseOver = (e: MouseEvent) => {
    e.stopPropagation();
    if (node.id !== 'root') setIsHovered(true);
  };

  const handleMouseOut = (e: MouseEvent) => {
    e.stopPropagation();
    setIsHovered(false);
  };

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (node.id !== 'root') {
      selectionStore.select(node.id, e.shiftKey);
    } else if (!e.shiftKey) {
      selectionStore.clearSelection();
    }
  };

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (node.id !== 'root') {
      if (!selectionStore.isSelected(node.id)) selectionStore.select(node.id);
      window.dispatchEvent(
        new CustomEvent('canvas-context-menu', {
          detail: { id: node.id, x: e.clientX, y: e.clientY },
        })
      );
    }
  };

  return { isSelected, isHovered, handleMouseOver, handleMouseOut, handleClick, handleContextMenu };
}
