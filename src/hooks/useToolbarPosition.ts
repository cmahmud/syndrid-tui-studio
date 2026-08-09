import { useState, useEffect, useRef, type RefObject, type CSSProperties } from 'react';
import {
  POSITION_PRESETS,
  type ToolbarPosition,
  type ToolbarCoordinates,
} from '../constants/componentToolbar';

/** Drag-to-reposition + preset-position handling for the floating ComponentToolbar. */
export function useToolbarPosition(toolbarRef: RefObject<HTMLDivElement | null>) {
  const [position, setPosition] = useState<ToolbarPosition>('B');
  const [customPosition, setCustomPosition] = useState<ToolbarCoordinates | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef<{ x: number; y: number; toolbarX: number; toolbarY: number } | null>(
    null
  );

  const handleDragStart = (e: React.MouseEvent) => {
    if (!toolbarRef.current) return;

    const rect = toolbarRef.current.getBoundingClientRect();
    dragStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      toolbarX: rect.left,
      toolbarY: rect.top,
    };
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleDragMove = (e: MouseEvent) => {
      if (!dragStartPos.current || !toolbarRef.current) return;

      const deltaX = e.clientX - dragStartPos.current.x;
      const deltaY = e.clientY - dragStartPos.current.y;

      let newX = dragStartPos.current.toolbarX + deltaX;
      let newY = dragStartPos.current.toolbarY + deltaY;

      // Get canvas bounds (parent container)
      const parent = toolbarRef.current.parentElement;
      if (parent) {
        const parentRect = parent.getBoundingClientRect();
        const toolbarRect = toolbarRef.current.getBoundingClientRect();

        // Constrain to canvas boundaries with margin
        const margin = 16;
        const minX = margin;
        const minY = margin;
        const maxX = parentRect.width - toolbarRect.width - margin;
        const maxY = parentRect.height - toolbarRect.height - margin;

        newX = Math.max(minX, Math.min(maxX, newX));
        newY = Math.max(minY, Math.min(maxY, newY));
      }

      setCustomPosition({ x: newX, y: newY });
      setPosition('custom');
    };

    const handleDragEnd = () => {
      setIsDragging(false);
      dragStartPos.current = null;
    };

    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);

    return () => {
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
    };
  }, [isDragging, toolbarRef]);

  // Calculate toolbar position style
  const getPositionStyle = (): CSSProperties => {
    if (position === 'custom' && customPosition) {
      return {
        left: `${customPosition.x}px`,
        top: `${customPosition.y}px`,
      };
    }

    const preset = POSITION_PRESETS[position as Exclude<ToolbarPosition, 'custom'>];
    if (!preset) return {};

    const style: CSSProperties = {};

    // Handle horizontal positioning
    if (preset.x === 50) {
      style.left = '50%';
      style.transform = 'translateX(-50%)';
    } else if (preset.x < 0) {
      style.right = `${Math.abs(preset.x)}px`;
    } else {
      style.left = `${preset.x}px`;
    }

    // Handle vertical positioning
    if (preset.y < 0) {
      style.bottom = `${Math.abs(preset.y)}px`;
    } else {
      style.top = `${preset.y}px`;
    }

    return style;
  };

  return {
    position,
    setPosition,
    customPosition,
    setCustomPosition,
    isDragging,
    handleDragStart,
    getPositionStyle,
  };
}
