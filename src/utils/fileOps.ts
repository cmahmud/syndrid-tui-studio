// Save and open .tui files

import { useComponentStore } from '../stores/componentStore';
import { THEMES, useThemeStore } from '../stores/themeStore';
import { useSelectionStore } from '../stores/selectionStore';
import { useProjectStore } from '../stores/projectStore';
import type { ComponentNode } from '../types';
import { effectToLegacyAnimation } from '../types';
import { canonicalEffects } from './motionResolver';
import { isValidComponentTree } from './validation';

/**
 * Upgrade a validated component tree to the canonical v3 representation.
 * The same authored-motion resolver is used by preview, MCP and exporters so
 * a compatibility mirror can never silently disagree with production export.
 */
export function migrateTreeToV3(node: ComponentNode): ComponentNode {
  const next = structuredClone(node);
  const visit = (current: ComponentNode) => {
    const prototype = current.prototype;
    if (prototype) {
      const effects = canonicalEffects(current);
      current.prototype = {
        ...prototype,
        effects,
        // Keep a compatibility mirror for the current CSS Canvas renderer and older exporters.
        animations: effects.map(effectToLegacyAnimation),
      };
    }
    current.children.forEach(visit);
  };
  visit(next);
  return next;
}

/** Build the JSON payload + suggested filename from current store state. */
export function buildTuiData(): { json: string; suggestedName: string } | null {
  const root = useComponentStore.getState().root;
  if (!root) return null;
  const theme = useThemeStore.getState().currentTheme;
  const project = useProjectStore.getState().exportProjectData();
  const data = {
    version: '3',
    meta: { name: root.name, theme, savedAt: new Date().toISOString() },
    project,
    tree: migrateTreeToV3(root),
  };
  return {
    json: JSON.stringify(data, null, 2),
    suggestedName: `${root.name.toLowerCase().replace(/\s+/g, '-')}.tui`,
  };
}

/** Save a JSON payload to disk, falling back to a browser download. */
export async function saveTuiData(json: string, filename: string): Promise<void> {
  if ('showSaveFilePicker' in window) {
    try {
      const fileHandle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        startIn: 'downloads',
        types: [{ description: 'Syndrid TUI Studio File', accept: { 'application/json': ['.tui'] } }],
      });
      const writable = await fileHandle.createWritable();
      await writable.write(json);
      await writable.close();
      return;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
    }
  }
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function openTuiFile(): Promise<void> {
  const load = (text: string) => {
    try {
      const data = JSON.parse(text);
      if ((data.version === '1' || data.version === '2' || data.version === '3') && isValidComponentTree(data.tree)) {
        const migratedTree = migrateTreeToV3(data.tree);
        useComponentStore.getState().setRoot(migratedTree);
        if (typeof data.meta?.theme === 'string' && data.meta.theme in THEMES) {
          useThemeStore.getState().setTheme(data.meta.theme as keyof typeof THEMES);
        }
        if ((data.version === '2' || data.version === '3') && data.project && typeof data.project === 'object') {
          useProjectStore.getState().setProjectData(data.project);
        } else {
          useProjectStore.getState().resetProject();
        }
        useSelectionStore.getState().clearSelection();
      } else {
        alert('Invalid .tui file');
      }
    } catch {
      alert('Invalid .tui file');
    }
  };

  if ('showOpenFilePicker' in window) {
    try {
      const [fileHandle] = await (window as any).showOpenFilePicker({
        types: [{ description: 'Syndrid TUI Studio File', accept: { 'application/json': ['.tui'] } }],
        multiple: false,
      });
      load(await (await fileHandle.getFile()).text());
    } catch (err) {
      if ((err as Error).name !== 'AbortError') alert('Failed to open file');
    }
  } else {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.tui,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) load(await file.text());
    };
    input.click();
  }
}
