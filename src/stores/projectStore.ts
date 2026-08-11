import { create } from 'zustand';
import type {
  ComponentNode,
  DesignTokens,
  EffectPlaybackSettings,
  ImageAssetDefinition,
  RatatuiRuntimeLibraries,
  ReusableComponentDefinition,
  SyndridProjectData,
  ViewportId,
  ViewportPreset,
} from '../types';
import { DEFAULT_RATATUI_RUNTIME_LIBRARIES } from '../types';
import { cloneNode } from '../utils/treeUtils';
import { isValidComponentTree } from '../utils/validation';

export const DEFAULT_VIEWPORTS: ViewportPreset[] = [
  { id: 'wide', label: 'Wide', width: 160, height: 48, description: 'Large desktop terminal', order: 0 },
  { id: 'medium', label: 'Medium', width: 120, height: 36, description: 'Typical coding terminal', order: 1 },
  { id: 'narrow', label: 'Narrow', width: 80, height: 24, description: 'Classic terminal / split pane', order: 2 },
  { id: 'short', label: 'Short', width: 100, height: 18, description: 'Low-height terminal / bottom pane', order: 3 },
];

export const DEFAULT_SYNDRID_TOKENS: DesignTokens = {
  name: 'Syndrid App',
  description: 'App-like terminal hierarchy: restrained surfaces, crisp focus, purposeful motion.',
  colors: {
    'surface.root': 'black',
    'surface.panel': '#111820',
    'surface.raised': '#17212b',
    'text.primary': 'white',
    'text.secondary': 'brightBlack',
    'accent.primary': 'brightCyan',
    'accent.secondary': 'brightBlue',
    'status.success': 'brightGreen',
    'status.warning': 'brightYellow',
    'status.error': 'brightRed',
    'focus.ring': 'brightCyan',
  },
  spacing: { xs: 0, sm: 1, md: 2, lg: 3, xl: 4 },
  borders: { subtle: 'single', active: 'rounded', strong: 'double', emphasis: 'bold' },
  motion: { instant: 0, fast: 120, normal: 180, slow: 280, defaultEasing: 'smoothstep' },
};

const DEFAULT_SETTINGS = {
  name: 'Syndrid TUI',
  description: 'Ratatui-first visual design and interaction specification.',
  targetFramework: 'ratatui' as const,
  animationRuntime: 'tachyonfx' as const,
  reducedMotionDefault: false,
  terminalCellWidthPx: 8,
  terminalCellHeightPx: 16,
};

const DEFAULT_EFFECT_PLAYBACK: EffectPlaybackSettings = {
  mode: 'normal',
  speed: 1,
  loopPreview: false,
};

interface ProjectState extends SyndridProjectData {
  previewState: string;
  animationPreviewEnabled: boolean;
  animationRevision: number;
  matrixOpen: boolean;
  setProjectData: (data: Partial<SyndridProjectData>) => void;
  resetProject: () => void;
  setActiveViewport: (id: ViewportId) => void;
  upsertViewport: (viewport: ViewportPreset) => void;
  removeViewport: (id: ViewportId) => void;
  setPreviewState: (state: string) => void;
  toggleAnimationPreview: () => void;
  replayAnimations: () => void;
  setMatrixOpen: (open: boolean) => void;
  updateTokens: (tokens: DesignTokens) => void;
  updateProjectSettings: (updates: Partial<SyndridProjectData['settings']>) => void;
  updateEffectPlayback: (updates: Partial<EffectPlaybackSettings>) => void;
  upsertImageAsset: (asset: ImageAssetDefinition) => void;
  removeImageAsset: (id: string) => void;
  updateRuntimeLibraries: (updates: Partial<RatatuiRuntimeLibraries>) => void;
  saveReusableComponent: (name: string, root: ComponentNode, description?: string, tags?: string[]) => string;
  removeReusableComponent: (id: string) => void;
  getReusableComponent: (id: string) => ReusableComponentDefinition | undefined;
  exportProjectData: () => SyndridProjectData;
}

function initialData(): SyndridProjectData {
  return {
    version: '3',
    settings: { ...DEFAULT_SETTINGS },
    viewports: DEFAULT_VIEWPORTS.map((v) => ({ ...v })),
    activeViewportId: 'narrow',
    designTokens: structuredClone(DEFAULT_SYNDRID_TOKENS),
    reusableComponents: [],
    effectPlayback: { ...DEFAULT_EFFECT_PLAYBACK },
    imageAssets: [],
    runtimeLibraries: structuredClone(DEFAULT_RATATUI_RUNTIME_LIBRARIES),
  };
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringMap(value: unknown, fallback: Record<string, string>): Record<string, string> {
  const next = { ...fallback };
  if (!isRecord(value)) return next;
  for (const [key, item] of Object.entries(value)) if (typeof item === 'string' && item.trim()) next[key] = item;
  return next;
}

function numberMap(value: unknown, fallback: Record<string, number>): Record<string, number> {
  const next = { ...fallback };
  if (!isRecord(value)) return next;
  for (const [key, item] of Object.entries(value)) {
    const parsed = Number(item);
    if (Number.isFinite(parsed)) next[key] = Math.max(0, Math.min(100, parsed));
  }
  return next;
}

const BORDER_STYLES = new Set<DesignTokens['borders'][string]>(['single', 'double', 'rounded', 'bold']);
function borderMap(value: unknown, fallback: DesignTokens['borders']): DesignTokens['borders'] {
  const next = { ...fallback };
  if (!isRecord(value)) return next;
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' && BORDER_STYLES.has(item as DesignTokens['borders'][string])) next[key] = item as DesignTokens['borders'][string];
  }
  return next;
}

const MOTION_EASINGS = new Set<DesignTokens['motion']['defaultEasing']>(['linear', 'ease-in', 'ease-out', 'ease-in-out', 'smoothstep', 'spring']);
function normalizeMotionTokens(value: unknown, fallback: DesignTokens['motion']): DesignTokens['motion'] {
  if (!isRecord(value)) return { ...fallback };
  const defaultEasing = typeof value.defaultEasing === 'string' && MOTION_EASINGS.has(value.defaultEasing as DesignTokens['motion']['defaultEasing'])
    ? value.defaultEasing as DesignTokens['motion']['defaultEasing']
    : fallback.defaultEasing;
  return {
    instant: finiteNumber(value.instant, fallback.instant, 0, 60_000),
    fast: finiteNumber(value.fast, fallback.fast, 0, 60_000),
    normal: finiteNumber(value.normal, fallback.normal, 0, 60_000),
    slow: finiteNumber(value.slow, fallback.slow, 0, 60_000),
    defaultEasing,
  };
}

function normalizeReusableComponents(value: unknown): ReusableComponentDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim() || typeof item.name !== 'string' || !item.name.trim() || !isValidComponentTree(item.root)) return [];
    const now = new Date().toISOString();
    return [{
      id: item.id,
      name: item.name,
      description: typeof item.description === 'string' ? item.description : '',
      tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [],
      root: cloneNode(item.root),
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now,
    }];
  });
}

function normalizeImageAssets(value: unknown): ImageAssetDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.source !== 'string') return [];
    return [{
      id: item.id,
      name: item.name,
      source: item.source,
      alt: typeof item.alt === 'string' ? item.alt : '',
      fit: ['contain', 'cover', 'stretch', 'original'].includes(String(item.fit)) ? item.fit as ImageAssetDefinition['fit'] : 'contain',
      alignment: ['start', 'center', 'end'].includes(String(item.alignment)) ? item.alignment as ImageAssetDefinition['alignment'] : 'center',
      protocol: ['auto', 'kitty', 'sixel', 'iterm2', 'halfblocks'].includes(String(item.protocol)) ? item.protocol as ImageAssetDefinition['protocol'] : 'auto',
      fallback: ['placeholder', 'alt-text', 'hidden'].includes(String(item.fallback)) ? item.fallback as ImageAssetDefinition['fallback'] : 'placeholder',
    }];
  });
}

function normalizeRuntimeLibraries(value: unknown): RatatuiRuntimeLibraries {
  const fallback = DEFAULT_RATATUI_RUNTIME_LIBRARIES;
  if (!isRecord(value)) return structuredClone(fallback);
  return {
    tachyonfx: typeof value.tachyonfx === 'string' ? value.tachyonfx : fallback.tachyonfx,
    ratatuiTextarea: typeof value.ratatuiTextarea === 'string' ? value.ratatuiTextarea : fallback.ratatuiTextarea,
    tuiWidgets: typeof value.tuiWidgets === 'string' ? value.tuiWidgets : fallback.tuiWidgets,
    ratatuiImage: typeof value.ratatuiImage === 'string' ? value.ratatuiImage : fallback.ratatuiImage,
    mousefood: typeof value.mousefood === 'string' ? value.mousefood : undefined,
    optional: Array.isArray(value.optional) ? value.optional.filter((item): item is string => typeof item === 'string') : [...fallback.optional],
  };
}

function normalizeViewport(viewport: ViewportPreset): ViewportPreset | null {
  if (!viewport || typeof viewport.id !== 'string' || typeof viewport.label !== 'string') return null;
  const width = Number(viewport.width);
  const height = Number(viewport.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return {
    ...viewport,
    id: viewport.id.trim() || `custom-${Date.now().toString(36)}`,
    label: viewport.label.trim() || 'Custom',
    width: Math.max(20, Math.min(200, Math.round(width))),
    height: Math.max(10, Math.min(100, Math.round(height))),
    order: Number.isFinite(Number(viewport.order)) ? Number(viewport.order) : 999,
  };
}

/** Merge v1/v2/v3 saved or agent-supplied project data onto safe v3 defaults. */
export function normalizeProjectData(data?: Partial<SyndridProjectData> | Record<string, unknown> | null): SyndridProjectData {
  const base = initialData();
  if (!data || typeof data !== 'object') return base;
  const raw = data as Partial<SyndridProjectData>;
  const suppliedViewports = Array.isArray(raw.viewports)
    ? raw.viewports.map((item) => normalizeViewport(item)).filter((item): item is ViewportPreset => !!item)
    : [];
  const viewports = suppliedViewports.length > 0 ? suppliedViewports.sort((a, b) => a.order - b.order) : base.viewports;
  const suppliedTokens = isRecord(raw.designTokens) ? raw.designTokens : undefined;
  const designTokens: DesignTokens = {
    name: typeof suppliedTokens?.name === 'string' && suppliedTokens.name.trim() ? suppliedTokens.name : base.designTokens.name,
    description: typeof suppliedTokens?.description === 'string' ? suppliedTokens.description : base.designTokens.description,
    colors: stringMap(suppliedTokens?.colors, base.designTokens.colors),
    spacing: numberMap(suppliedTokens?.spacing, base.designTokens.spacing),
    borders: borderMap(suppliedTokens?.borders, base.designTokens.borders),
    motion: normalizeMotionTokens(suppliedTokens?.motion, base.designTokens.motion),
  };
  const requestedActive = typeof raw.activeViewportId === 'string' ? raw.activeViewportId : base.activeViewportId;
  const activeViewportId = viewports.some((viewport) => viewport.id === requestedActive)
    ? requestedActive
    : viewports.find((viewport) => viewport.id === 'narrow')?.id ?? viewports[0].id;
  const playback: Record<string, unknown> = isRecord(raw.effectPlayback) ? raw.effectPlayback : {};
  return {
    version: '3',
    settings: {
      name: typeof raw.settings?.name === 'string' && raw.settings.name.trim() ? raw.settings.name : base.settings.name,
      description: typeof raw.settings?.description === 'string' ? raw.settings.description : base.settings.description,
      targetFramework: 'ratatui',
      animationRuntime: 'tachyonfx',
      reducedMotionDefault: typeof raw.settings?.reducedMotionDefault === 'boolean' ? raw.settings.reducedMotionDefault : base.settings.reducedMotionDefault,
      terminalCellWidthPx: finiteNumber(raw.settings?.terminalCellWidthPx, base.settings.terminalCellWidthPx, 4, 32),
      terminalCellHeightPx: finiteNumber(raw.settings?.terminalCellHeightPx, base.settings.terminalCellHeightPx, 8, 64),
    },
    viewports,
    activeViewportId,
    designTokens,
    reusableComponents: normalizeReusableComponents(raw.reusableComponents),
    effectPlayback: {
      mode: playback.mode === 'reduced' ? 'reduced' : 'normal',
      speed: finiteNumber(playback.speed, 1, 0.1, 4),
      loopPreview: typeof playback.loopPreview === 'boolean' ? playback.loopPreview : false,
    },
    imageAssets: normalizeImageAssets(raw.imageAssets),
    runtimeLibraries: normalizeRuntimeLibraries(raw.runtimeLibraries),
  };
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  ...initialData(),
  previewState: 'default',
  animationPreviewEnabled: true,
  animationRevision: 0,
  matrixOpen: false,
  setProjectData: (data) => set({ ...normalizeProjectData(data), previewState: 'default', animationRevision: Date.now() }),
  resetProject: () => set({ ...initialData(), previewState: 'default', animationRevision: Date.now() }),
  setActiveViewport: (id) => set({ activeViewportId: id }),
  upsertViewport: (viewport) => set((state) => {
    const normalized = normalizeViewport(viewport);
    if (!normalized) return {};
    const existing = state.viewports.findIndex((v) => v.id === normalized.id);
    const next = state.viewports.map((v) => ({ ...v }));
    if (existing >= 0) next[existing] = normalized;
    else next.push(normalized);
    return { viewports: next.sort((a, b) => a.order - b.order) };
  }),
  removeViewport: (id) => set((state) => {
    const remaining = state.viewports.filter((v) => v.id !== id);
    const viewports = remaining.length > 0 ? remaining : DEFAULT_VIEWPORTS.map((v) => ({ ...v }));
    return {
      viewports,
      activeViewportId: state.activeViewportId === id ? viewports.find((v) => v.id === 'narrow')?.id ?? viewports[0].id : state.activeViewportId,
    };
  }),
  setPreviewState: (previewState) => set({ previewState }),
  toggleAnimationPreview: () => set((state) => ({ animationPreviewEnabled: !state.animationPreviewEnabled })),
  replayAnimations: () => set({ animationRevision: Date.now() }),
  setMatrixOpen: (matrixOpen) => set({ matrixOpen }),
  updateTokens: (designTokens) => set({ designTokens }),
  updateProjectSettings: (updates) => set((state) => ({ settings: { ...state.settings, ...updates } })),
  updateEffectPlayback: (updates) => set((state) => ({ effectPlayback: { ...state.effectPlayback, ...updates } })),
  upsertImageAsset: (asset) => set((state) => ({ imageAssets: [...state.imageAssets.filter((item) => item.id !== asset.id), asset] })),
  removeImageAsset: (id) => set((state) => ({ imageAssets: state.imageAssets.filter((item) => item.id !== id) })),
  updateRuntimeLibraries: (updates) => set((state) => ({ runtimeLibraries: { ...state.runtimeLibraries, ...updates } })),
  saveReusableComponent: (name, root, description = '', tags = []) => {
    const id = `component-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    const definition: ReusableComponentDefinition = { id, name, description, tags, root: cloneNode(root), createdAt: now, updatedAt: now };
    set((state) => ({ reusableComponents: [...state.reusableComponents, definition] }));
    return id;
  },
  removeReusableComponent: (id) => set((state) => ({ reusableComponents: state.reusableComponents.filter((item) => item.id !== id) })),
  getReusableComponent: (id) => get().reusableComponents.find((item) => item.id === id),
  exportProjectData: () => {
    const state = get();
    return {
      version: '3',
      settings: structuredClone(state.settings),
      viewports: structuredClone(state.viewports),
      activeViewportId: state.activeViewportId,
      designTokens: structuredClone(state.designTokens),
      reusableComponents: state.reusableComponents.map((item) => ({ ...item, root: cloneNode(item.root) })),
      effectPlayback: structuredClone(state.effectPlayback),
      imageAssets: structuredClone(state.imageAssets),
      runtimeLibraries: structuredClone(state.runtimeLibraries),
    };
  },
}));
