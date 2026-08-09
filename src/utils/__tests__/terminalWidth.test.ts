import { describe, expect, it } from 'vitest';
import { graphemeWidth, padToWidth, sliceByWidth, stringWidth } from '../rendering/width';
import { CharCanvas } from '../rendering/canvas';

describe('terminal cell width', () => {
  it('counts ASCII, wide CJK and emoji as terminal cells', () => {
    expect(stringWidth('abc')).toBe(3);
    expect(stringWidth('界')).toBe(2);
    expect(graphemeWidth('🚀')).toBe(2);
    expect(stringWidth('A界🚀')).toBe(5);
  });

  it('does not split a wide grapheme when slicing', () => {
    expect(sliceByWidth('A界B', 2)).toBe('A');
    expect(sliceByWidth('A界B', 3)).toBe('A界');
  });

  it('pads by cells rather than UTF-16 length', () => {
    expect(stringWidth(padToWidth('界', 5))).toBe(5);
  });

  it('serializes wide cells without adding a phantom continuation column', () => {
    const canvas = new CharCanvas(4, 1);
    canvas.write(0, 0, '界A');
    expect(stringWidth(canvas.toLines()[0])).toBe(4);
    expect(canvas.toLines()[0]).toBe('界A ');
  });

  it('clears the owning wide grapheme when its continuation cell is overwritten', () => {
    const canvas = new CharCanvas(5, 1);
    canvas.write(0, 0, '界AB');
    canvas.write(1, 0, 'X');
    expect(canvas.toLines()[0]).toBe(' XAB ');
    expect(stringWidth(canvas.toLines()[0])).toBe(5);
  });
});
