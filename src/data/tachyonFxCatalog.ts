import type { EffectInterpolation, EffectMotion, TachyonFxPrimitive } from '../types/effects';

export type EffectCategory = 'entrance' | 'exit' | 'transition' | 'color' | 'spatial' | 'utility';

export interface TachyonFxCatalogEntry {
  id: TachyonFxPrimitive;
  label: string;
  category: EffectCategory;
  description: string;
  defaultDurationMs: number;
  defaultInterpolation: EffectInterpolation;
  supportsMotion: boolean;
  supportsSpatialPattern: boolean;
  composable: boolean;
  parameters: Array<{
    key: string;
    label: string;
    type: 'number' | 'color' | 'boolean' | 'text';
    defaultValue: string | number | boolean;
    min?: number;
    max?: number;
  }>;
}

const empty: TachyonFxCatalogEntry['parameters'] = [];
const colorPair: TachyonFxCatalogEntry['parameters'] = [
  { key: 'from', label: 'From color', type: 'color', defaultValue: 'Black' },
  { key: 'to', label: 'To color', type: 'color', defaultValue: 'Reset' },
];

export const TACHYON_FX_CATALOG: TachyonFxCatalogEntry[] = [
  { id: 'fade_from', label: 'Fade From', category: 'entrance', description: 'Fade cells from a source color into their rendered state.', defaultDurationMs: 180, defaultInterpolation: 'smoothstep', supportsMotion: false, supportsSpatialPattern: true, composable: true, parameters: colorPair },
  { id: 'fade_to', label: 'Fade To', category: 'exit', description: 'Fade rendered cells toward a destination color.', defaultDurationMs: 180, defaultInterpolation: 'smoothstep', supportsMotion: false, supportsSpatialPattern: true, composable: true, parameters: colorPair },
  { id: 'fade_from_fg', label: 'Fade Foreground From', category: 'entrance', description: 'Animate only the foreground color into its final value.', defaultDurationMs: 160, defaultInterpolation: 'quad-out', supportsMotion: false, supportsSpatialPattern: true, composable: true, parameters: [{ key: 'color', label: 'Color', type: 'color', defaultValue: 'Cyan' }] },
  { id: 'fade_to_fg', label: 'Fade Foreground To', category: 'color', description: 'Animate foreground cells toward an accent color.', defaultDurationMs: 160, defaultInterpolation: 'quad-in-out', supportsMotion: false, supportsSpatialPattern: true, composable: true, parameters: [{ key: 'color', label: 'Color', type: 'color', defaultValue: 'Cyan' }] },
  { id: 'dissolve', label: 'Dissolve', category: 'exit', description: 'Progressively dissolve cells using TachyonFX cell selection.', defaultDurationMs: 220, defaultInterpolation: 'linear', supportsMotion: false, supportsSpatialPattern: true, composable: true, parameters: empty },
  { id: 'coalesce', label: 'Coalesce', category: 'entrance', description: 'Inverse dissolve that coalesces cells into their final state.', defaultDurationMs: 220, defaultInterpolation: 'linear', supportsMotion: false, supportsSpatialPattern: true, composable: true, parameters: empty },
  { id: 'evolve', label: 'Evolve', category: 'transition', description: 'Organic cell transition suited to loading and state changes.', defaultDurationMs: 260, defaultInterpolation: 'smoothstep', supportsMotion: false, supportsSpatialPattern: true, composable: true, parameters: empty },
  { id: 'slide_in', label: 'Slide In', category: 'entrance', description: 'Slide a rendered region into view from a direction.', defaultDurationMs: 220, defaultInterpolation: 'quad-out', supportsMotion: true, supportsSpatialPattern: false, composable: true, parameters: [{ key: 'distance', label: 'Distance', type: 'number', defaultValue: 8, min: 1, max: 80 }] },
  { id: 'slide_out', label: 'Slide Out', category: 'exit', description: 'Slide a rendered region out of view.', defaultDurationMs: 200, defaultInterpolation: 'quad-in', supportsMotion: true, supportsSpatialPattern: false, composable: true, parameters: [{ key: 'distance', label: 'Distance', type: 'number', defaultValue: 8, min: 1, max: 80 }] },
  { id: 'sweep_in', label: 'Sweep In', category: 'entrance', description: 'Reveal cells in a directional sweep.', defaultDurationMs: 200, defaultInterpolation: 'smoothstep', supportsMotion: true, supportsSpatialPattern: true, composable: true, parameters: [{ key: 'width', label: 'Sweep width', type: 'number', defaultValue: 10, min: 1, max: 80 }] },
  { id: 'sweep_out', label: 'Sweep Out', category: 'exit', description: 'Hide cells in a directional sweep.', defaultDurationMs: 200, defaultInterpolation: 'smoothstep', supportsMotion: true, supportsSpatialPattern: true, composable: true, parameters: [{ key: 'width', label: 'Sweep width', type: 'number', defaultValue: 10, min: 1, max: 80 }] },
  { id: 'explode', label: 'Explode', category: 'spatial', description: 'Push cells away from a spatial origin.', defaultDurationMs: 260, defaultInterpolation: 'cubic-out', supportsMotion: false, supportsSpatialPattern: true, composable: true, parameters: [{ key: 'strength', label: 'Strength', type: 'number', defaultValue: 1, min: 0, max: 4 }] },
  { id: 'expand', label: 'Expand', category: 'spatial', description: 'Expand a region outward while preserving terminal-cell intent.', defaultDurationMs: 220, defaultInterpolation: 'quad-out', supportsMotion: false, supportsSpatialPattern: true, composable: true, parameters: empty },
  { id: 'stretch', label: 'Stretch', category: 'spatial', description: 'Stretch the effected region along an axis.', defaultDurationMs: 220, defaultInterpolation: 'quad-in-out', supportsMotion: true, supportsSpatialPattern: false, composable: true, parameters: [{ key: 'amount', label: 'Amount', type: 'number', defaultValue: 1, min: 0, max: 4 }] },
  { id: 'translate', label: 'Translate', category: 'transition', description: 'Translate a region across terminal cells.', defaultDurationMs: 180, defaultInterpolation: 'quad-in-out', supportsMotion: true, supportsSpatialPattern: false, composable: true, parameters: [{ key: 'cells', label: 'Cells', type: 'number', defaultValue: 4, min: 1, max: 80 }] },
  { id: 'paint', label: 'Paint', category: 'color', description: 'Paint cells toward an authored foreground/background style.', defaultDurationMs: 160, defaultInterpolation: 'linear', supportsMotion: false, supportsSpatialPattern: true, composable: true, parameters: [{ key: 'fg', label: 'Foreground', type: 'color', defaultValue: 'Cyan' }, { key: 'bg', label: 'Background', type: 'color', defaultValue: 'Reset' }] },
  { id: 'hsl_shift', label: 'HSL Shift', category: 'color', description: 'Shift hue, saturation, or lightness over time.', defaultDurationMs: 260, defaultInterpolation: 'sine-in-out', supportsMotion: false, supportsSpatialPattern: true, composable: true, parameters: [{ key: 'hue', label: 'Hue degrees', type: 'number', defaultValue: 30, min: -360, max: 360 }, { key: 'saturation', label: 'Saturation', type: 'number', defaultValue: 0, min: -1, max: 1 }, { key: 'lightness', label: 'Lightness', type: 'number', defaultValue: 0, min: -1, max: 1 }] },
  { id: 'darken', label: 'Darken', category: 'color', description: 'Darken cells over the effect timer.', defaultDurationMs: 160, defaultInterpolation: 'quad-in-out', supportsMotion: false, supportsSpatialPattern: true, composable: true, parameters: [{ key: 'amount', label: 'Amount', type: 'number', defaultValue: 0.35, min: 0, max: 1 }] },
  { id: 'lighten', label: 'Lighten', category: 'color', description: 'Lighten cells over the effect timer.', defaultDurationMs: 160, defaultInterpolation: 'quad-in-out', supportsMotion: false, supportsSpatialPattern: true, composable: true, parameters: [{ key: 'amount', label: 'Amount', type: 'number', defaultValue: 0.35, min: 0, max: 1 }] },
  { id: 'consume_tick', label: 'Consume Tick', category: 'utility', description: 'No visual decoration; useful for reduced-motion timing and scheduler composition.', defaultDurationMs: 0, defaultInterpolation: 'linear', supportsMotion: false, supportsSpatialPattern: false, composable: true, parameters: empty },
  { id: 'custom', label: 'Custom / DSL', category: 'utility', description: 'Represent a custom TachyonFX DSL fragment while preserving the structured wrapper.', defaultDurationMs: 180, defaultInterpolation: 'linear', supportsMotion: false, supportsSpatialPattern: false, composable: true, parameters: [{ key: 'dsl', label: 'DSL', type: 'text', defaultValue: 'fx::consume_tick()' }] },
];

export const DEFAULT_EFFECT_MOTIONS: EffectMotion[] = [
  'left-to-right',
  'right-to-left',
  'up-to-down',
  'down-to-up',
];

export function getTachyonFxCatalogEntry(id: TachyonFxPrimitive): TachyonFxCatalogEntry {
  return TACHYON_FX_CATALOG.find((entry) => entry.id === id) ?? TACHYON_FX_CATALOG[0];
}
