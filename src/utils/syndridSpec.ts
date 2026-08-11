import type { ComponentNode, EffectDefinition, SyndridProjectData } from '../types';
import { collectPrototypeSummary, collectResponsiveOverrides } from './projectResolver';
import { exportTachyonFxCargoSnippet, exportTachyonFxMotionPlan } from './tachyonFxExporter';
import { effectToTachyonFxDsl } from './tachyonFxDsl';
import { exportRatatuiEcosystem } from './ratatuiEcosystemExporter';
import { collectAuthoredEffects } from './motionResolver';
import { resolveAndRenderPreview } from './previewResolver';

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
      warnings: ReturnType<typeof resolveAndRenderPreview>['warnings'];
      text: string;
    }>;
  };
  interaction: ReturnType<typeof collectPrototypeSummary>;
  motion: {
    runtime: 'tachyonfx';
    targetVersion: string;
    effects: Array<{
      componentId: string;
      componentName: string;
      source: 'v3' | 'legacy';
      effect: EffectDefinition;
      dsl: string;
      reducedMotionDsl: string;
    }>;
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
    const preview = resolveAndRenderPreview(root, {
      viewportId: viewport.id,
      stateName: 'default',
      width: viewport.width,
      height: viewport.height,
      format: 'text',
    });
    return {
      id: viewport.id,
      label: viewport.label,
      width: viewport.width,
      height: viewport.height,
      warningCount: preview.warningCount,
      warnings: preview.warnings,
      text: preview.text,
    };
  });
  const effects = collectAuthoredEffects(root).records.map((record) => ({
    ...record,
    dsl: effectToTachyonFxDsl(record.effect),
    reducedMotionDsl: effectToTachyonFxDsl(record.effect, true),
  }));
  const ecosystem = exportRatatuiEcosystem(root, project);

  return {
    schema: 'syndrid-tui-spec/v3',
    generatedAt: new Date().toISOString(),
    intent: {
      framework: 'ratatui',
      animationRuntime: 'tachyonfx',
      generatedCodeIsOptional: true,
      preserveExistingArchitecture: true,
    },
    project,
    sourceTree: root,
    responsive: { overrides: collectResponsiveOverrides(root), previews },
    interaction: collectPrototypeSummary(root),
    motion: {
      runtime: 'tachyonfx',
      targetVersion: project.runtimeLibraries.tachyonfx,
      effects,
      rustPlan: exportTachyonFxMotionPlan(root),
      cargoSnippet: exportTachyonFxCargoSnippet(project.runtimeLibraries),
    },
    ecosystem,
    images: project.imageAssets,
    runtimeLibraries: project.runtimeLibraries,
    implementationRules: [
      'Treat this file as design intent, not permission to replace Syndrid architecture.',
      'The unified authored-motion resolver is canonical across save, preview, MCP and export.',
      'The structured EffectDefinition graph is canonical; DSL and Rust are projections of that graph.',
      'Component prototype.ecosystem metadata is canonical for richer Ratatui adapters and survives .tui round-trips.',
      'Prefer existing Syndrid widgets, state machines, routing, and orchestration primitives.',
      'Implement layout with Ratatui constraints and verify Wide, Medium, Narrow, and Short viewports.',
      'All terminal geometry must resolve to integer cells; hidden responsive nodes consume zero layout space.',
      'Advance TachyonFX from elapsed time; never block input or sleep the event loop.',
      'Honor authored reduced-motion replacements instead of globally deleting semantic state feedback.',
      'Use ratatui-image capability detection and authored fallbacks for image assets.',
      'Keep TextArea, ScrollView, PTY and image state outside Frame rendering; render must stay deterministic and cheap.',
      'Cache ANSI parsing and syntax highlighting instead of reparsing unchanged text every frame.',
      'mousefood is an optional embedded-display target and must not be treated as desktop pointer input.',
      'Keyboard focus must be explicit and deterministic. Never dispatch widget-scoped actions globally.',
      'Check double-width Unicode glyphs and terminal-cell alignment before shipping.',
      'Terminal Test Mode scenarios are deterministic fixtures, not production data contracts.',
    ],
  };
}

export function exportSyndridImplementationSpec(root: ComponentNode | null, project: SyndridProjectData): string {
  return JSON.stringify(buildSyndridImplementationSpec(root, project), null, 2);
}
