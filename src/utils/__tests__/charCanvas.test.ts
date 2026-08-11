import { describe, expect, it } from 'vitest';
import { CharCanvas } from '../rendering/canvas';

describe('CharCanvas terminal-cell geometry', () => {
  it('quantizes fractional coordinates instead of indexing sparse fractional properties', () => {
    const canvas = new CharCanvas(10, 3);
    expect(() => canvas.write(2.5, 1.2, 'X')).not.toThrow();
    expect(canvas.get(3, 1)).toBe('X');
  });

  it('quantizes fractional rectangle dimensions safely', () => {
    const canvas = new CharCanvas(8, 4);
    expect(() => canvas.fill(1.4, 0.6, 3.5, 1.5, '#')).not.toThrow();
    expect(canvas.toLines()).toHaveLength(4);
    expect(canvas.toLines().every((line) => line.length === 8)).toBe(true);
  });

  it('treats non-finite geometry as safe zero-cell coordinates', () => {
    const canvas = new CharCanvas(8, 2);
    expect(() => canvas.write(Number.NaN, Number.POSITIVE_INFINITY, 'A')).not.toThrow();
    expect(canvas.get(0, 0)).toBe('A');
  });
});
