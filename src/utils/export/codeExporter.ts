// Code generation for different TUI frameworks

import type { ComponentNode } from '../../types';
import { exportToRatatui } from './exporters/ratatui';
import { exportToTextual } from './exporters/textual';
import { exportToBubbleTea, getBubbleTeaWarnings } from './exporters/bubbletea';
import { exportToBlessed } from './exporters/blessed';
import { exportToOpenTUI, getOpenTuiWarnings } from './exporters/opentui';
import { exportToTview } from './exporters/tview';
import { exportToInk } from './exporters/ink';
import { collectGradientWarnings, type ExportColorMode } from './exporters/shared';

export type { ExportColorMode };

/** Design features the selected framework's exporter cannot express. */
export function getExportWarnings(root: ComponentNode | null, format: string): string[] {
  if (!root) return [];
  const warnings = [...collectGradientWarnings(root)];
  switch (format) {
    case 'bubbletea':
      warnings.push(...getBubbleTeaWarnings(root));
      break;
    case 'opentui':
      warnings.push(...getOpenTuiWarnings(root));
      break;
  }
  return warnings;
}

/**
 * Export design to framework-specific code
 */
export function exportToCode(
  root: ComponentNode | null,
  format: string,
  colorMode: ExportColorMode = 'truecolor'
): string {
  if (!root) return '';

  switch (format) {
    case 'opentui':
      return exportToOpenTUI(root, colorMode);
    case 'ink':
      return exportToInk(root, colorMode);
    case 'bubbletea':
      return exportToBubbleTea(root, colorMode);
    case 'blessed':
      return exportToBlessed(root, colorMode);
    case 'textual':
      return exportToTextual(root);
    case 'ratatui':
      return exportToRatatui(root, colorMode);
    case 'tview':
      return exportToTview(root, colorMode);
    default:
      return `// Unsupported export format: ${format}`;
  }
}
