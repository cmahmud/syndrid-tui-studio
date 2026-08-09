// Drag-and-drop reordering/reparenting and resize-handle dragging for a single
// canvas component. Third slice of the Canvas.tsx decomposition (see todo.md).

import { useState, useEffect, type DragEvent, type MouseEvent } from 'react';
import { useComponentStore, useSelectionStore } from '../stores';
import { dragStore } from './useDragAndDrop';
import { layoutEngine } from '../utils/layout';
import { COMPONENT_LIBRARY, canHaveChildren } from '../constants/components';
import type { ComponentNode } from '../types';
import type { ComputedLayout } from '../utils/layout/types';

export type ResizeDirection = 'e' | 's' | 'se';

export function useComponentDrag(
  node: ComponentNode,
  layout: ComputedLayout | undefined,
  cellWidth: number,
  cellHeight: number,
  zoom: number
) {
  const componentStore = useComponentStore();
  const selectionStore = useSelectionStore();

  const [isDragging, setIsDragging] = useState(false);
  const [insertionIndex, setInsertionIndex] = useState<number | null>(null);
  const [resizing, setResizing] = useState<{
    direction: ResizeDirection;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  // Global mouse handlers while a resize drag is active
  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      const deltaCharW = Math.round((e.clientX - resizing.startX) / (cellWidth * zoom));
      const deltaCharH = Math.round((e.clientY - resizing.startY) / (cellHeight * zoom));
      const updates: Record<string, number> = {};
      if (resizing.direction !== 's') {
        updates.width = Math.max(4, resizing.startWidth + deltaCharW);
      }
      if (resizing.direction !== 'e') {
        updates.height = Math.max(1, resizing.startHeight + deltaCharH);
      }
      componentStore.updateProps(node.id, updates);
    };

    const handleMouseUp = () => setResizing(null);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, cellWidth, cellHeight, zoom, node.id, componentStore]);

  // handleResizeStart/handleDragOver read `layout` fields; both are only ever
  // invoked from JSX that's gated behind `if (!layout) return null` in the
  // caller, so layout is guaranteed defined by the time these actually run.
  const handleResizeStart = (e: MouseEvent, direction: ResizeDirection) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing({
      direction,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: layout!.width,
      startHeight: layout!.height,
    });
  };

  const handleDragStart = (e: DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
    setIsDragging(true);
    dragStore.startDrag({
      type: 'existing-component',
      componentId: node.id,
    });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', node.id);

    // Select the component being dragged
    selectionStore.select(node.id);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    dragStore.endDrag();
  };

  const handleDragOver = (e: DragEvent) => {
    e.stopPropagation();

    // Only containers can accept children
    if (!canHaveChildren(node.type)) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }

    e.preventDefault();

    // Calculate insertion position for flexbox/stack containers
    if (node.children.length > 0 && node.layout.type === 'flexbox') {
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const isColumn = node.layout.direction === 'column';
      const mousePos = isColumn ? mouseY : mouseX;

      // Find insertion index based on mouse position
      let insertIndex = 0;
      for (let i = 0; i < node.children.length; i++) {
        const childLayout = layoutEngine.getLayout(node.children[i].id);
        if (!childLayout) continue;

        const childPos = isColumn
          ? (childLayout.y - layout!.y) * cellHeight * zoom
          : (childLayout.x - layout!.x) * cellWidth * zoom;
        const childSize = isColumn
          ? childLayout.height * cellHeight * zoom
          : childLayout.width * cellWidth * zoom;

        if (mousePos < childPos + childSize / 2) {
          insertIndex = i;
          break;
        }
        insertIndex = i + 1;
      }

      setInsertionIndex(insertIndex);
    }
  };

  const handleDragLeave = () => {
    setInsertionIndex(null);
  };

  const handleDrop = (e: DragEvent) => {
    // Root Screen should not intercept drops - let canvas handle repositioning
    if (node.id === 'root') {
      return;
    }

    // Only containers can accept children
    if (!canHaveChildren(node.type)) {
      return;
    }

    e.stopPropagation();
    e.preventDefault();

    const dragData = dragStore.dragData;
    if (!dragData) return;

    // Handle new component from palette
    if (dragData.type === 'new-component' && dragData.componentType) {
      const def = COMPONENT_LIBRARY[dragData.componentType];
      if (def) {
        const newComponent: Omit<ComponentNode, 'id'> = {
          type: def.type,
          name: def.name,
          props: { ...def.defaultProps },
          layout: { ...def.defaultLayout, x: 0, y: 0 },
          style: { ...def.defaultStyle },
          events: { ...def.defaultEvents },
          children: [],
          locked: false,
          hidden: false,
          collapsed: false,
        };

        const id = componentStore.addComponent(node.id, newComponent, insertionIndex ?? undefined);
        if (id) {
          selectionStore.select(id);
        }
      }
      setInsertionIndex(null);
      dragStore.endDrag();
      return;
    }

    // Handle existing component reparenting
    if (dragData.type === 'existing-component' && dragData.componentId) {
      // Don't drop on self
      if (dragData.componentId === node.id) return;

      // Move the dragged component to be a child of this component (reparenting)
      componentStore.moveComponent(dragData.componentId, node.id, insertionIndex ?? undefined);
      setInsertionIndex(null);
      dragStore.endDrag();
    }
  };

  return {
    isDragging,
    insertionIndex,
    resizing,
    handleResizeStart,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
