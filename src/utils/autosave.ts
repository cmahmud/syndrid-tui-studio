// Autosaves the design tree plus Syndrid Studio project metadata so a refresh
// or crash doesn't lose responsive overrides, motion specs, tokens, or reusable
// component definitions.

import { useComponentStore } from '../stores/componentStore';
import { useThemeStore } from '../stores/themeStore';
import { useProjectStore } from '../stores/projectStore';
import { isValidComponentTree } from './validation';
import type { ComponentNode, SyndridProjectData } from '../types';

const AUTOSAVE_KEY = 'tuistudio-autosave';
const DEBOUNCE_MS = 1000;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let unsubProject: (() => void) | null = null;

function writeAutosave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const root = useComponentStore.getState().root;
    if (!root) return;
    const data = {
      version: '2',
      meta: { theme: useThemeStore.getState().currentTheme, savedAt: new Date().toISOString() },
      project: useProjectStore.getState().exportProjectData(),
      tree: root,
    };
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
    } catch {
      // Storage full or unavailable — autosave is a safety net, not critical path.
    }
  }, DEBOUNCE_MS);
}

/** Subscribes to both design-tree and project-spec changes. Call once on app start. */
export function initAutosave(): () => void {
  const unsubComponents = useComponentStore.subscribe(writeAutosave);
  unsubProject = useProjectStore.subscribe(writeAutosave);
  return () => {
    unsubComponents();
    unsubProject?.();
    unsubProject = null;
  };
}

/** Reads back the last autosave, accepting the old v1 format for backwards compatibility. */
export function loadAutosave(): {
  tree: ComponentNode;
  theme?: unknown;
  project?: SyndridProjectData;
} | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if ((data.version !== '1' && data.version !== '2') || !isValidComponentTree(data.tree)) return null;
    return {
      tree: data.tree,
      theme: data.meta?.theme,
      project: data.version === '2' ? data.project : undefined,
    };
  } catch {
    return null;
  }
}
