import type { ComponentNode, EffectDefinition, SyndridProjectData } from '../types';
import { collectPrototypeSummary, collectResponsiveOverrides, resolveTreeForPreview } from './projectResolver';
import { exportToText } from './export/textExporter';
import { exportTachyonFxCargoSnippet, exportTachyonFxMotionPlan } from './tachyonFxExporter';
import { effectToTachyonFxDsl } from './tachyonFxDsl';
import { exportRatatuiEcosystem } from './ratatuiEcosystemExporter';
import { layoutEngine } from './layout';

function collectEffects(node: ComponentNode | null, out: Array<{ componentId: string; componentName: string; effect: EffectDefinition }> = []) {
  if (!node) return out;
  for (const effect of node.prototype?.effects ?? []) out.push({ componentId: node.id, componentName: node.name, effect });
  node.children.forEach((child) => collectEffects(child, out));
  return out;
}

export interface SyndridImplementationSpec {
  schema: 'syndrid-tui-spec/v3';
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
    effects: Array<{ componentId: string; componentName: string; effect: EffectDefinition; dsl: string; reducedMotionDsl: string }>;
    rustPlan: string;
    cargoSnippet: string;
  };
  ecosystem: ReturnType<typeof exportRatatuiEcosystem>;
  images: SyndridProjectData['imageAssets'];
  runtimeLibraries: SyndridProjectData['runtimeLibraries'];
  implementationRules: string[];
}

export function buildSyndridImplementationSpec(root: ComponentNode | null, project: SyndridProjectData): SyndridImplementationSpec {
  const previews = project.viewports.map((viewport) => {
    const resolved = resolveTreeForPreview(root, viewport.id, 'default');
    const text = exportToText(resolved, { format: 'text', width: viewport.width, height: viewport.height });
    const warnings = layoutEngine
      .getNodesWithWarnings()
      .map((nodeId) => layoutEngine.getDebugInfo(nodeId))
      .filter((info): info is NonNullable<typeof info> => !!info);
    return { id: viewport.id, label: viewport.label, width: viewport.width, height: viewport.height, warningCount: warnings.length, warnings, text };
  });
  const effects = collectEffects(root).map((record) => ({
    ...record,
    dsl: effectToTachyonFxDsl(record.effect),
    reducedMotionDsl: effectToTachyonFxDsl(record.effect, true),
  }));
  const ecosystem = exportRatatuiEcosystem(root, project);

  return {
    schema: 'syndrid-tui-spec/v3',
    generatedAt: new Date().toISOString(),
    intent: { framework: 'ratatui', animationRuntime: 'tachyonfx', generatedCodeIsOptional: true, preserveExistingArchitecture: true },
    project,
    sourceTree: root,
    responsive: { overrides: collectResponsiveOverrides(root), previews },
    interaction: collectPrototypeSummary(root),
    motion: {
      runtime: 'tachyonfx',
      targetVersion: '0.25.x',
      effects,
      rustPlan: exportTachyonFxMotionPlan(root),
      cargoSnippet: exportTachyonFxCargoSnippet(),
    },
    ecosystem,
    images: project.imageAssets,
    runtimeLibraries: project.runtimeLibraries,
    implementationRules: [
      'Treat this file as design intent, not permission to replace Syndrid architecture.',
      'The structured EffectDefinition graph is canonical; DSL and Rust are projections of that graph.',
      'Component prototype.ecosystem metadata is canonical for richer Ratatui adapters and survives .tui round-trips.',
      'Prefer existing Syndrid widgets, state machines, routing, and orchestration primitives.',
      'Implement layout with Ratatui constraints and verify Wide, Medium, Narrow, and Short viewports.',
      'Advance TachyonFX from elapsed time; never block input or sleep the event loop.',
      'Honor authored reduced-motion replacements instead of globally deleting semantic state feedback.',
      'Use ratatui-image capability detection and authored fallbacks for image assets.',
      'Keep TextArea, ScrollView, PTY and image state outside Frame rendering; render must stay deterministic and cheap.',
      'Cache ANSI parsing and syntax highlighting instead of reparsing unchanged text every frame.',
      'mousefood is an optional embedded-display target and must not be treated as desktop pointer input.',
      'Keyboard focus must be explicit and deterministic. Never dispatch widget-scoped actions globally.',
      'Check double-width Unicode glyphs and terminal-cell alignment before shipping.',
    ],
  };
}

export function exportSyndridImplementationSpec(root: ComponentNode | null, project: SyndridProjectData): string {
  return JSON.stringify(buildSyndridImplementationSpec(root, project), null, 2);
}
