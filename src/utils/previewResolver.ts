import type { ComponentNode } from '../types';
import { exportToText, type TextExportOptions } from './export/textExporter';
import { layoutEngine } from './layout';
import { resolveTreeForPreview } from './projectResolver';

export interface PreviewRequest {
  viewportId: string;
  stateName?: string;
  width: number;
  height: number;
  format?: TextExportOptions['format'];
}

export interface PreviewResult {
  viewportId: string;
  stateName: string;
  width: number;
  height: number;
  tree: ComponentNode | null;
  text: string;
  warningCount: number;
  warnings: Array<NonNullable<ReturnType<typeof layoutEngine.getDebugInfo>>>;
}

/**
 * Single preview authority for Canvas-adjacent tools, responsive matrix, MCP,
 * implementation specs and the native terminal test runtime.
 */
export function resolveAndRenderPreview(root: ComponentNode | null, request: PreviewRequest): PreviewResult {
  const width = Math.max(1, Math.round(request.width));
  const height = Math.max(1, Math.round(request.height));
  const stateName = request.stateName ?? 'default';
  const tree = resolveTreeForPreview(root, request.viewportId, stateName);
  const text = exportToText(tree, {
    format: request.format ?? 'text',
    width,
    height,
  });
  const warnings = layoutEngine
    .getNodesWithWarnings()
    .map((nodeId) => layoutEngine.getDebugInfo(nodeId))
    .filter((info): info is NonNullable<typeof info> => !!info);
  return {
    viewportId: request.viewportId,
    stateName,
    width,
    height,
    tree,
    text,
    warningCount: warnings.length,
    warnings,
  };
}
