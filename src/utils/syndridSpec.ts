import type { ComponentNode, SyndridProjectData } from '../types';
import { collectPrototypeSummary, collectResponsiveOverrides, resolveTreeForPreview } from './projectResolver';
import { exportToText } from './export/textExporter';
import { exportTachyonFxMotionPlan } from './tachyonFxExporter';
import { layoutEngine } from './layout';

export interface SyndridImplementationSpec {
  schema: 'syndrid-tui-spec/v1';
  generatedAt: string;
  intent: {
    framework: 'ratatui';
    animationRuntime: 'tachyonfx';
    generatedCodeIsOptional: true;
    preserveExistingArchitecture: true;
  };
  project: SyndridProjectData;
  sourceTree: ComponentNode | null;
  responsive: {
    overrides: ReturnType<typeof collectResponsiveOverrides>;
    previews: Array<{
      id: string;
      label: string;
      width: number;
      height: number;
      warningCount: number;
      warnings: Array<NonNullable<ReturnType<typeof layoutEngine.getDebugInfo>>>;
      text: string;
    }>;
  };
  interaction: ReturnType<typeof collectPrototypeSummary>;
  motion: {
    runtime: 'tachyonfx';
    targetVersion: '0.25.x';
    rustPlan: string;
  };
  implementationRules: string[];
}

export function buildSyndridImplementationSpec(
  root: ComponentNode | null,
  project: SyndridProjectData
): SyndridImplementationSpec {
  const previews = project.viewports.map((viewport) => {
    const resolved = resolveTreeForPreview(root, viewport.id, 'default');
    const text = exportToText(resolved, {
      format: 'text',
      width: viewport.width,
      height: viewport.height,
    });
    const warnings = layoutEngine
      .getNodesWithWarnings()
      .map((nodeId) => layoutEngine.getDebugInfo(nodeId))
      .filter((info): info is NonNullable<typeof info> => !!info);
    return {
      id: viewport.id,
      label: viewport.label,
      width: viewport.width,
      height: viewport.height,
      warningCount: warnings.length,
      warnings,
      text,
    };
  });

  return {
    schema: 'syndrid-tui-spec/v1',
    generatedAt: new Date().toISOString(),
    intent: {
      framework: 'ratatui',
      animationRuntime: 'tachyonfx',
      generatedCodeIsOptional: true,
      preserveExistingArchitecture: true,
    },
    project,
    sourceTree: root,
    responsive: {
      overrides: collectResponsiveOverrides(root),
      previews,
    },
    interaction: collectPrototypeSummary(root),
    motion: {
      runtime: 'tachyonfx',
      targetVersion: '0.25.x',
      rustPlan: exportTachyonFxMotionPlan(root),
    },
    implementationRules: [
      'Treat this file as design intent, not permission to replace Syndrid architecture.',
      'Prefer existing Syndrid widgets, state machines, routing, and orchestration primitives.',
      'Implement layout with Ratatui constraints and verify Wide, Medium, Narrow, and Short viewports.',
      'Use TachyonFX-compatible effects for authored motion where practical; preserve behavior when reduced motion is enabled.',
      'Keyboard focus must be explicit and deterministic. Never dispatch widget-scoped actions globally.',
      'Animations must not block input, streaming output, cancellation, or terminal resize handling.',
      'Do not use animation to hide latency; status should remain semantically truthful.',
      'Check double-width Unicode glyphs and terminal-cell alignment before shipping.',
    ],
  };
}

export function exportSyndridImplementationSpec(
  root: ComponentNode | null,
  project: SyndridProjectData
): string {
  return JSON.stringify(buildSyndridImplementationSpec(root, project), null, 2);
}
