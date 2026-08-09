import { describe, expect, it } from 'vitest';
import type { AnimationSpec } from '../../types';
import { animationToTachyonFxDsl } from '../tachyonFxExporter';

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
});
