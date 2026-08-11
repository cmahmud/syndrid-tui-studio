import { describe, expect, it } from 'vitest';
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
    expect(migrated.imageAssets[0]).toMatchObject({
      id: 'hero',
      protocol: 'kitty',
      fallback: 'alt-text',
    });
  });

  it('clamps playback settings from malformed files', () => {
    const migrated = normalizeProjectData({
      effectPlayback: {
        mode: 'reduced',
        speed: 99,
        loopPreview: true,
      },
    });

    expect(migrated.effectPlayback).toEqual({ mode: 'reduced', speed: 4, loopPreview: true });
  });
});
