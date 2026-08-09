// Arrow-key nudging for selected components on the canvas.
// First slice of the Canvas.tsx decomposition (see todo.md) — extracted
// because it's fully self-contained (no shared local state with the rest
// of Canvas.tsx), making it the safest piece to pull out first.

import { useEffect } from 'react';
import { useComponentStore, useSelectionStore } from '../stores';

/** Arrow keys move the selected component(s) by 1 unit, or 5 with Shift held. */
export function useCanvasKeyboardNudge(): void {
  const componentStore = useComponentStore();
  const selectionStore = useSelectionStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const selectedIds = Array.from(selectionStore.selectedIds);
      if (selectedIds.length === 0) return;

      // Only handle arrow keys
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;

      // Don't interfere with input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      e.preventDefault();

      // Shift key = move 5 units, otherwise 1 unit
      const step = e.shiftKey ? 5 : 1;

      selectedIds.forEach((id) => {
        const component = componentStore.getComponent(id);
        if (!component || component.locked) return;

        const currentX = component.layout.x || 0;
        const currentY = component.layout.y || 0;

        let newX = currentX;
        let newY = currentY;

        switch (e.key) {
          case 'ArrowUp':
            newY = Math.max(0, currentY - step);
            break;
          case 'ArrowDown':
            newY = currentY + step;
            break;
          case 'ArrowLeft':
            newX = Math.max(0, currentX - step);
            break;
          case 'ArrowRight':
            newX = currentX + step;
            break;
        }

        componentStore.updateLayout(id, { x: newX, y: newY });
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [componentStore, selectionStore]);
}
