import type { AnimationSpec, ComponentNode, EffectDefinition } from '../types';
import { legacyAnimationToEffect } from '../types';

export type AuthoredMotionSource = 'v3' | 'legacy';

export interface AuthoredMotionRecord {
  componentId: string;
  componentName: string;
  effect: EffectDefinition;
  source: AuthoredMotionSource;
}

export interface AuthoredMotionStats {
  canonical: number;
  legacy: number;
  resolved: number;
  enabled: number;
  rescuedLegacy: number;
}

export interface ResolvedComponentEffect {
  effect: EffectDefinition;
  source: AuthoredMotionSource;
  rescuedLegacy: boolean;
}

function effectKey(effect: EffectDefinition): string {
  return effect.id || `${effect.name}:${effect.trigger.kind}`;
}

function legacyKey(componentId: string, animation: AnimationSpec): string {
  return effectKey(legacyAnimationToEffect(componentId, animation));
}

/**
 * Resolve every persisted motion representation into one canonical view.
 *
 * v3 `prototype.effects` is authoritative when it contains an enabled record.
 * `prototype.animations` is retained as a compatibility mirror for old files
 * and the browser preview. If the mirror is enabled while the same-id v3
 * record is stale/disabled, the mirror wins so preview/save/MCP/export cannot
 * disagree about whether the effect exists.
 */
export function resolveAuthoredEffects(node: ComponentNode): ResolvedComponentEffect[] {
  const canonical = node.prototype?.effects ?? [];
  const legacy = node.prototype?.animations ?? [];
  const merged: ResolvedComponentEffect[] = canonical.map((effect) => ({
    effect,
    source: 'v3',
    rescuedLegacy: false,
  }));
  const indexByKey = new Map(canonical.map((effect, index) => [effectKey(effect), index] as const));

  for (const animation of legacy) {
    const key = legacyKey(node.id, animation);
    const effect = legacyAnimationToEffect(node.id, animation);
    const existingIndex = indexByKey.get(key);

    if (existingIndex === undefined) {
      indexByKey.set(key, merged.length);
      merged.push({ effect, source: 'legacy', rescuedLegacy: false });
      continue;
    }

    const existing = merged[existingIndex];
    if (!existing.effect.enabled && effect.enabled) {
      merged[existingIndex] = { effect, source: 'legacy', rescuedLegacy: true };
    }
  }

  return merged;
}

export function collectAuthoredEffects(
  root: ComponentNode | null,
  options: { enabledOnly?: boolean } = {}
): { records: AuthoredMotionRecord[]; stats: AuthoredMotionStats } {
  const records: AuthoredMotionRecord[] = [];
  const stats: AuthoredMotionStats = {
    canonical: 0,
    legacy: 0,
    resolved: 0,
    enabled: 0,
    rescuedLegacy: 0,
  };

  const visit = (node: ComponentNode) => {
    stats.canonical += node.prototype?.effects?.length ?? 0;
    stats.legacy += node.prototype?.animations?.length ?? 0;

    for (const resolved of resolveAuthoredEffects(node)) {
      stats.resolved += 1;
      if (resolved.effect.enabled) stats.enabled += 1;
      if (resolved.rescuedLegacy) stats.rescuedLegacy += 1;
      if (options.enabledOnly && !resolved.effect.enabled) continue;
      records.push({
        componentId: node.id,
        componentName: node.name,
        effect: resolved.effect,
        source: resolved.source,
      });
    }

    node.children.forEach(visit);
  };

  if (root) visit(root);
  return { records, stats };
}

export function findAuthoredEffect(node: ComponentNode, effectId: string): ResolvedComponentEffect | undefined {
  return resolveAuthoredEffects(node).find(({ effect }) => effect.id === effectId);
}

/** Materialize the unified view back into canonical v3 effects. */
export function canonicalEffects(node: ComponentNode): EffectDefinition[] {
  return resolveAuthoredEffects(node).map(({ effect }) => structuredClone(effect));
}
