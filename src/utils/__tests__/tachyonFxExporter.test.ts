import { describe, expect, it } from 'vitest';
import type { AnimationSpec, ComponentNode } from '../../types';
import { makePrimitiveEffect } from '../../types';
import {
  animationToTachyonFxDsl,
  exportTachyonFxCargoSnippet,
  exportTachyonFxMotionPlan,
} from '../tachyonFxExporter';

function motion(overrides: Partial<AnimationSpec> = {}): AnimationSpec {
  return {
    id: 'motion-test',
    name: 'Test motion',
    trigger: 'on-enter',
    effect: 'slide',
    durationMs: 180,
    delayMs: 0,
    easing: 'smoothstep',
    direction: 'left',
    enabled: true,
    reducedMotionEffect: 'fade',
    ...overrides,
  };
}

function component(id = 'root'): ComponentNode {
  return {
    id,
    type: 'Box',
    name: 'Loading shell',
    props: {},
    layout: { type: 'none' },
    style: {},
    events: {},
    children: [],
    locked: false,
    hidden: false,
    collapsed: false,
  };
}

describe('TachyonFX motion export', () => {
  it('maps authored entrance directions to the matching motion sweep', () => {
    expect(animationToTachyonFxDsl(motion({ direction: 'left' }))).toContain('Motion::LeftToRight');
    expect(animationToTachyonFxDsl(motion({ direction: 'right' }))).toContain('Motion::RightToLeft');
    expect(animationToTachyonFxDsl(motion({ direction: 'up' }))).toContain('Motion::UpToDown');
    expect(animationToTachyonFxDsl(motion({ direction: 'down' }))).toContain('Motion::DownToUp');
  });

  it('uses the authored spring interpolation and a short reduced-motion fallback', () => {
    expect(animationToTachyonFxDsl(motion({ easing: 'spring' }))).toContain('Interpolation::Spring');
    expect(animationToTachyonFxDsl(motion({ durationMs: 400, reducedMotionEffect: 'fade' }), true))
      .toContain('EffectTimer::from_ms(120, Interpolation::SmoothStep)');
  });

  it('wraps looping effects without changing their core effect expression', () => {
    const out = animationToTachyonFxDsl(motion({ loop: true }));
    expect(out).toMatch(/^fx::repeating\(fx::slide_in/);
  });

  it('exports an enabled legacy mirror even when a separate v3 effect entry exists', () => {
    const root = component();
    const disabledV3 = makePrimitiveEffect(root.id, 'fade_from', 'Disabled v3 effect');
    disabledV3.id = 'disabled-v3';
    disabledV3.enabled = false;
    root.prototype = {
      effects: [disabledV3],
      animations: [motion({ id: 'loading-comet', name: 'Loading comet', enabled: true })],
    };

    const out = exportTachyonFxMotionPlan(root);
    expect(out).not.toContain('No enabled TachyonFX effects have been authored yet.');
    expect(out).toContain('effect_loading_comet');
    expect(out).toContain('source=legacy');
    expect(out).toContain('Discovery: v3=1 legacy=1 resolved=2 enabled=1 rescuedLegacy=0');
  });

  it('lets an enabled legacy mirror rescue a stale disabled v3 effect with the same id', () => {
    const root = component();
    const staleCanonical = makePrimitiveEffect(root.id, 'fade_from', 'Stale canonical comet');
    staleCanonical.id = 'loading-comet';
    staleCanonical.enabled = false;
    root.prototype = {
      effects: [staleCanonical],
      animations: [motion({ id: 'loading-comet', name: 'Loading comet', enabled: true })],
    };

    const out = exportTachyonFxMotionPlan(root);
    expect(out).not.toContain('No enabled TachyonFX effects have been authored yet.');
    expect(out.match(/fn effect_loading_comet/g)).toHaveLength(1);
    expect(out).toContain('source=legacy');
    expect(out).toContain('Discovery: v3=1 legacy=1 resolved=1 enabled=1 rescuedLegacy=1');
  });

  it('prefers the enabled canonical v3 graph when its legacy compatibility mirror has the same id', () => {
    const root = component();
    const canonical = makePrimitiveEffect(root.id, 'slide_in', 'Canonical comet');
    canonical.id = 'shared-motion';
    canonical.enabled = true;
    root.prototype = {
      effects: [canonical],
      animations: [motion({ id: 'shared-motion', name: 'Legacy mirror', enabled: true })],
    };

    const out = exportTachyonFxMotionPlan(root);
    expect(out.match(/fn effect_shared_motion/g)).toHaveLength(1);
    expect(out).toContain('source=v3');
  });

  it('generates dependency guidance from the project runtime-version source of truth', () => {
    const cargo = exportTachyonFxCargoSnippet({
      ratatui: '0.30.8',
      tachyonfx: '0.25.8',
      ratatuiTextarea: '0.9.8',
      tuiWidgets: '0.7.8',
      ratatuiImage: '11.0.8',
      mousefood: '0.5.8',
      ansiToTui: '8.0.8',
      optional: ['tui-term'],
    });
    expect(cargo).toContain('ratatui = "0.30.8"');
    expect(cargo).toContain('tachyonfx = "0.25.8"');
    expect(cargo).toContain('ratatui-textarea = "0.9.8"');
    expect(cargo).toContain('tui-widgets = "0.7.8"');
    expect(cargo).toContain('ratatui-image = "11.0.8"');
    expect(cargo).toContain('ansi-to-tui = "8.0.8"');
  });
});
