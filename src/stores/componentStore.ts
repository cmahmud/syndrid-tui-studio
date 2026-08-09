// Component tree state management

import { create } from 'zustand';
import type { ComponentNode } from '../types';
import {
  findNodeById,
  findParentNode,
  flattenTree,
  cloneNode,
  applyAddComponent,
  applyRemoveComponent,
  applyUpdateProps,
  applyUpdateLayout,
  applyMoveComponent,
  applyDuplicateComponent,
  applyGroupComponents,
  applyUngroupComponents,
} from '../utils/treeUtils';

interface ComponentState {
  // Tree
  root: ComponentNode | null;
  components: Map<string, ComponentNode>; // Flat lookup

  // History
  history: ComponentNode[][];
  historyIndex: number;
  maxHistorySize: number;

  // Actions - Tree manipulation
  setRoot: (root: ComponentNode | null) => void;
  addComponent: (parentId: string, component: Omit<ComponentNode, 'id'>, index?: number) => string;
  removeComponent: (id: string) => void;
  updateComponent: (id: string, updates: Partial<ComponentNode>) => void;
  moveComponent: (id: string, newParentId: string, index?: number) => void;
  duplicateComponent: (id: string) => string | null;
  groupComponents: (
    ids: string[],
    boxData: Omit<ComponentNode, 'id' | 'children'>
  ) => string | null;
  ungroupComponents: (ids: string[]) => string[];

  // Actions - Properties
  updateProps: (id: string, props: Partial<ComponentNode['props']>) => void;
  updateLayout: (id: string, layout: Partial<ComponentNode['layout']>) => void;
  updateStyle: (id: string, style: Partial<ComponentNode['style']>) => void;
  updateEvents: (id: string, events: Partial<ComponentNode['events']>) => void;

  // Actions - History
  undo: () => void;
  redo: () => void;
  saveHistory: () => void;

  // Queries
  getComponent: (id: string) => ComponentNode | undefined;
  getParent: (id: string) => ComponentNode | undefined;
  getChildren: (id: string) => ComponentNode[];
}

export const useComponentStore = create<ComponentState>((set, get) => ({
  // Initial state
  root: null,
  components: new Map(),
  history: [],
  historyIndex: -1,
  maxHistorySize: 50,

  // Set root
  setRoot: (root) => {
    set({
      root,
      components: flattenTree(root),
    });
    get().saveHistory();
  },

  // Add component
  addComponent: (parentId, componentData, index) => {
    const result = applyAddComponent(get().root, parentId, componentData, index);
    if (!result) return '';

    set({
      root: result.root,
      components: flattenTree(result.root),
    });

    get().saveHistory();
    return result.id;
  },

  // Remove component
  removeComponent: (id) => {
    const newRoot = applyRemoveComponent(get().root, id);
    if (!newRoot) return;

    set({
      root: newRoot,
      components: flattenTree(newRoot),
    });

    get().saveHistory();
  },

  // Update component
  updateComponent: (id, updates) => {
    const { root } = get();
    if (!root) return;

    // Clone tree FIRST
    const newRoot = cloneNode(root);

    // Find component in the NEW tree
    const component = findNodeById(newRoot, id);
    if (!component) return;

    Object.assign(component, updates);

    set({
      root: newRoot,
      components: flattenTree(newRoot),
    });

    get().saveHistory();
  },

  // Move component
  moveComponent: (id, newParentId, index) => {
    const newRoot = applyMoveComponent(get().root, id, newParentId, index);
    if (!newRoot) return;

    set({
      root: newRoot,
      components: flattenTree(newRoot),
    });

    get().saveHistory();
  },

  // Duplicate component
  duplicateComponent: (id) => {
    const result = applyDuplicateComponent(get().root, id);
    if (!result) return null;

    set({
      root: result.root,
      components: flattenTree(result.root),
    });

    get().saveHistory();
    return result.id;
  },

  // Group multiple components into a new Box
  groupComponents: (ids, boxData) => {
    const result = applyGroupComponents(get().root, ids, boxData);
    if (!result) return null;

    set({ root: result.root, components: flattenTree(result.root) });
    get().saveHistory();
    return result.id;
  },

  // Ungroup containers: promote children to parent, remove containers
  ungroupComponents: (ids) => {
    const result = applyUngroupComponents(get().root, ids);
    if (!result) return [];

    set({ root: result.root, components: flattenTree(result.root) });
    get().saveHistory();
    return result.childIds;
  },

  // Update props
  updateProps: (id, props) => {
    const newRoot = applyUpdateProps(get().root, id, props);
    if (!newRoot) return;

    set({
      root: newRoot,
      components: flattenTree(newRoot),
    });

    get().saveHistory();
  },

  // Update layout
  updateLayout: (id, layout) => {
    const newRoot = applyUpdateLayout(get().root, id, layout);
    if (!newRoot) return;

    set({
      root: newRoot,
      components: flattenTree(newRoot),
    });

    get().saveHistory();
  },

  // Update style
  updateStyle: (id, style) => {
    const { root } = get();
    if (!root) return;

    // Clone tree FIRST to create new references
    const newRoot = cloneNode(root);

    // Find component in the NEW tree
    const component = findNodeById(newRoot, id);
    if (!component) return;

    // Mutate the NEW tree's component
    component.style = { ...component.style, ...style };

    set({
      root: newRoot,
      components: flattenTree(newRoot),
    });

    get().saveHistory();
  },

  // Update events
  updateEvents: (id, events) => {
    const { root } = get();
    if (!root) return;

    // Clone tree FIRST to create new references
    const newRoot = cloneNode(root);

    // Find component in the NEW tree
    const component = findNodeById(newRoot, id);
    if (!component) return;

    // Mutate the NEW tree's component
    component.events = { ...component.events, ...events };

    set({
      root: newRoot,
      components: flattenTree(newRoot),
    });

    get().saveHistory();
  },

  // Save history
  saveHistory: () => {
    const { root, history, historyIndex, maxHistorySize } = get();
    if (!root) return;

    // Clone root for history
    const snapshot = cloneNode(root);

    // Remove future history if we're not at the end
    const newHistory = history.slice(0, historyIndex + 1);

    // Add new snapshot
    newHistory.push([snapshot]);

    // Limit history size
    if (newHistory.length > maxHistorySize) {
      newHistory.shift();
    }

    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },

  // Undo
  undo: () => {
    const { history, historyIndex } = get();

    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const snapshot = history[newIndex][0];

      set({
        root: cloneNode(snapshot),
        components: flattenTree(snapshot),
        historyIndex: newIndex,
      });
    }
  },

  // Redo
  redo: () => {
    const { history, historyIndex } = get();

    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const snapshot = history[newIndex][0];

      set({
        root: cloneNode(snapshot),
        components: flattenTree(snapshot),
        historyIndex: newIndex,
      });
    }
  },

  // Get component
  getComponent: (id) => {
    return get().components.get(id);
  },

  // Get parent
  getParent: (id) => {
    const { root } = get();
    if (!root) return undefined;
    const parent = findParentNode(root, id);
    return parent || undefined;
  },

  // Get children
  getChildren: (id) => {
    const component = get().getComponent(id);
    return component?.children || [];
  },
}));
