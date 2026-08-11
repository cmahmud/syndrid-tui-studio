import type { ComponentNode, ComponentStateOverride, ResponsiveOverride } from '../types';
import { cloneNode } from './treeUtils';
import { resolveAuthoredEffects } from './motionResolver';

function mergeOverride(node: ComponentNode, override: ResponsiveOverride | ComponentStateOverride): void {
  if (override.props) node.props = { ...node.props, ...override.props };
  if (override.layout) node.layout = { ...node.layout, ...override.layout };
  if (override.style) node.style = { ...node.style, ...override.style };
  if (typeof override.hidden === 'boolean') node.hidden = override.hidden;
}

/**
 * Resolve a design tree for one terminal viewport and one prototype state.
 * Hidden descendants are pruned after overrides are applied: terminal layout
 * must treat hidden content as absent rather than reserving cells/gaps for it.
 */
export function resolveTreeForPreview(
  root: ComponentNode | null,
  viewportId: string,
  stateName: string = 'default'
): ComponentNode | null {
  if (!root) return null;
  const resolved = cloneNode(root);

  const visit = (node: ComponentNode) => {
    const responsive = node.responsive?.[viewportId];
    if (responsive) mergeOverride(node, responsive);
    if (stateName !== 'default') {
      const state = node.prototype?.states?.[stateName];
      if (state) mergeOverride(node, state);
    }
    node.children.forEach(visit);
    node.children = node.children.filter((child) => !child.hidden);
  };

  visit(resolved);
  return resolved;
}

export function collectResponsiveOverrides(root: ComponentNode | null): Array<{
  id: string;
  name: string;
  viewports: string[];
}> {
  const result: Array<{ id: string; name: string; viewports: string[] }> = [];
  if (!root) return result;
  const visit = (node: ComponentNode) => {
    const viewports = Object.keys(node.responsive ?? {});
    if (viewports.length) result.push({ id: node.id, name: node.name, viewports });
    node.children.forEach(visit);
  };
  visit(root);
  return result;
}

export function collectPrototypeSummary(root: ComponentNode | null): Array<{
  id: string;
  name: string;
  focusable: boolean;
  states: string[];
  animations: string[];
  keyBindings: string[];
}> {
  const result: Array<{
    id: string;
    name: string;
    focusable: boolean;
    states: string[];
    animations: string[];
    keyBindings: string[];
  }> = [];
  if (!root) return result;
  const visit = (node: ComponentNode) => {
    if (node.prototype) {
      result.push({
        id: node.id,
        name: node.name,
        focusable: !!node.prototype.focusable,
        states: Object.keys(node.prototype.states ?? {}),
        animations: resolveAuthoredEffects(node).map(({ effect }) => effect.name),
        keyBindings: (node.prototype.keyBindings ?? []).map((binding) => `${binding.key}: ${binding.action}`),
      });
    }
    node.children.forEach(visit);
  };
  visit(root);
  return result;
}
