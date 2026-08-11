import { describe, expect, it } from 'vitest';
import { DEFAULT_RATATUI_RUNTIME_LIBRARIES } from '../../types';
import { normalizeProjectData } from '../projectStore';

describe('Syndrid project v3 migration', () => {
  it('upgrades partial v2 project data onto safe v3 defaults', () => {
    const migrated = normalizeProjectData({
      version: '2' as never,
      settings: {
        name: 'Legacy',
        description: 'v2 project',
        targetFramework: 'ratatui',
        animationRuntime: 'tachyonfx',
        reducedMotionDefault: true,
        terminalCellWidthPx: 8,
        terminalCellHeightPx: 16,
      },
      viewports: [],
      activeViewportId: 'narrow',
      designTokens: undefined as never,
      reusableComponents: [],
    });

    expect(migrated.version).toBe('3');
    expect(migrated.settings.name).toBe('Legacy');
    expect(migrated.viewports.map((viewport) => viewport.id)).toContain('wide');
    expect(migrated.effectPlayback).toEqual({ mode: 'normal', speed: 1, loopPreview: false });
    expect(migrated.imageAssets).toEqual([]);
    expect(migrated.runtimeLibraries.tachyonfx).toBeTruthy();
    expect(migrated.terminalTest).toMatchObject({ viewportId: 'narrow', scenarioId: 'default', fakeData: true });
    expect(migrated.testScenarios).toEqual([]);
  });

  it('normalizes portable image metadata', () => {
    const migrated = normalizeProjectData({
      imageAssets: [
        {
          id: 'hero',
          name: 'Hero',
          source: './hero.png',
          fit: 'cover',
          alignment: 'center',
          protocol: 'kitty',
          fallback: 'alt-text',
          alt: 'Syndrid hero',
        },
      ],
    });

    expect(migrated.imageAssets).toHaveLength(1);
    expect(migrated.imageAssets[0]).toMatchObject({ id: 'hero', protocol: 'kitty', fallback: 'alt-text' });
  });

  it('clamps playback settings from malformed files', () => {
    const migrated = normalizeProjectData({
      effectPlayback: { mode: 'reduced', speed: 99, loopPreview: true },
    });
    expect(migrated.effectPlayback).toEqual({ mode: 'reduced', speed: 4, loopPreview: true });
  });

  it('preserves every supported runtime library field across normalization', () => {
    const migrated = normalizeProjectData({
      runtimeLibraries: {
        ratatui: '0.30.99',
        tachyonfx: '0.25.99',
        ratatuiTextarea: '0.9.99',
        tuiWidgets: '0.7.99',
        ratatuiImage: '11.0.99',
        mousefood: '0.5.99',
        ansiToTui: '8.0.99',
        optional: ['tui-term', 'tui-nodes'],
      },
    });
    expect(migrated.runtimeLibraries).toEqual({
      ratatui: '0.30.99',
      tachyonfx: '0.25.99',
      ratatuiTextarea: '0.9.99',
      tuiWidgets: '0.7.99',
      ratatuiImage: '11.0.99',
      mousefood: '0.5.99',
      ansiToTui: '8.0.99',
      optional: ['tui-term', 'tui-nodes'],
    });
  });

  it('retains default optional runtime versions when a partial map is loaded', () => {
    const migrated = normalizeProjectData({ runtimeLibraries: { tachyonfx: '0.25.7' } as never });
    expect(migrated.runtimeLibraries.ratatui).toBe(DEFAULT_RATATUI_RUNTIME_LIBRARIES.ratatui);
    expect(migrated.runtimeLibraries.ansiToTui).toBe(DEFAULT_RATATUI_RUNTIME_LIBRARIES.ansiToTui);
    expect(migrated.runtimeLibraries.mousefood).toBe(DEFAULT_RATATUI_RUNTIME_LIBRARIES.mousefood);
    expect(migrated.runtimeLibraries.tachyonfx).toBe('0.25.7');
  });

  it('normalizes deterministic custom terminal-test scenarios', () => {
    const migrated = normalizeProjectData({
      testScenarios: [{
        id: 'demo', name: 'Demo', preset: 'custom', seed: 7, durationMs: 900,
        variables: { components: { progress: { props: { value: 50 } } } },
        timeline: [{ atMs: 800, componentId: 'progress', property: 'value', value: 100 }, { atMs: 100, event: 'start' }],
      }],
      terminalTest: {
        viewportId: 'wide', scenarioId: 'custom:demo', speed: 99, reducedMotion: true,
        loop: true, fakeData: true, hotReload: true, interactive: false, showDebugOverlay: false, startAtMs: -10,
      },
    });
    expect(migrated.testScenarios[0].timeline.map((event) => event.atMs)).toEqual([100, 800]);
    expect(migrated.terminalTest).toMatchObject({
      viewportId: 'wide', scenarioId: 'custom:demo', speed: 4, reducedMotion: true,
      loop: true, interactive: false, showDebugOverlay: false, startAtMs: 0,
    });
  });
});
