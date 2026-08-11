// Canvas rendering utilities for compositing components

import type { GradientConfig } from '../../types';
import { gradientBgCode } from './ansi';
import { graphemeWidth, splitGraphemes } from './width';

function cell(value: number): number {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function span(value: number): number {
  return Math.max(0, cell(value));
}

/** 2D character canvas for compositing components in integer terminal cells. */
export class CharCanvas {
  private buffer: string[][];
  private styleBuffer: string[][];
  public readonly width: number;
  public readonly height: number;

  constructor(width: number, height: number) {
    this.width = span(width);
    this.height = span(height);
    this.buffer = Array(this.height).fill(null).map(() => Array(this.width).fill(' '));
    this.styleBuffer = Array(this.height).fill(null).map(() => Array(this.width).fill(''));
  }

  /** Clear whichever rendered grapheme owns this terminal cell. */
  private clearOccupant(rawX: number, rawY: number): void {
    const x = cell(rawX);
    const y = cell(rawY);
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    let start = x;
    while (start > 0 && this.buffer[y][start] === '') start--;
    const symbol = this.buffer[y][start];
    const width = Math.max(1, graphemeWidth(symbol));
    if (start < x && width <= x - start) start = x;
    const glyphSpan = Math.max(1, graphemeWidth(this.buffer[y][start]));
    for (let offset = 0; offset < glyphSpan && start + offset < this.width; offset++) {
      this.buffer[y][start + offset] = ' ';
      this.styleBuffer[y][start + offset] = '';
    }
  }

  write(rawX: number, rawY: number, text: string, style?: string): void {
    const y = cell(rawY);
    if (y < 0 || y >= this.height) return;
    let col = cell(rawX);
    for (const grapheme of splitGraphemes(text)) {
      const cellWidth = Math.max(0, graphemeWidth(grapheme));
      if (cellWidth === 0) {
        const previous = col - 1;
        if (previous >= 0 && previous < this.width) this.buffer[y][previous] += grapheme;
        continue;
      }
      if (col + cellWidth > this.width) break;
      if (col >= 0) {
        for (let offset = 0; offset < cellWidth; offset++) this.clearOccupant(col + offset, y);
        this.buffer[y][col] = grapheme;
        if (style) this.styleBuffer[y][col] = style;
        for (let offset = 1; offset < cellWidth; offset++) {
          if (col + offset < this.width) {
            this.buffer[y][col + offset] = '';
            if (style) this.styleBuffer[y][col + offset] = style;
          }
        }
      }
      col += cellWidth;
    }
  }

  writeLines(rawX: number, rawY: number, lines: string[], style?: string): void {
    const x = cell(rawX);
    const y = cell(rawY);
    lines.forEach((line, i) => this.write(x, y + i, line, style));
  }

  fill(rawX: number, rawY: number, rawWidth: number, rawHeight: number, char: string = ' ', style?: string): void {
    const x = cell(rawX);
    const y = cell(rawY);
    const width = span(rawWidth);
    const height = span(rawHeight);
    const fillChar = splitGraphemes(char)[0] ?? ' ';
    for (let row = y; row < y + height && row < this.height; row++) {
      if (row < 0) continue;
      for (let col = x; col < x + width && col < this.width; col++) {
        if (col < 0) continue;
        this.clearOccupant(col, row);
        this.buffer[row][col] = fillChar;
        if (style) this.styleBuffer[row][col] = style;
      }
    }
  }

  hline(x: number, y: number, length: number, char: string = '─', style?: string): void {
    this.write(cell(x), cell(y), char.repeat(span(length)), style);
  }

  vline(x: number, y: number, length: number, char: string = '│', style?: string): void {
    const startX = cell(x);
    const startY = cell(y);
    for (let i = 0; i < span(length); i++) this.write(startX, startY + i, char, style);
  }

  fillGradient(
    rawX: number,
    rawY: number,
    rawWidth: number,
    rawHeight: number,
    gradient: GradientConfig,
    textStyle: string = ''
  ): void {
    const x = cell(rawX);
    const y = cell(rawY);
    const width = span(rawWidth);
    const height = span(rawHeight);
    const angle = ((gradient.angle % 360) + 360) % 360;
    const horizontal = (angle >= 45 && angle < 135) || (angle >= 225 && angle < 315);
    for (let row = y; row < y + height && row < this.height; row++) {
      if (row < 0) continue;
      for (let col = x; col < x + width && col < this.width; col++) {
        if (col < 0) continue;
        let t: number;
        if (horizontal) {
          t = width > 1 ? (col - x) / (width - 1) : 0;
          if (angle >= 225 && angle < 315) t = 1 - t;
        } else {
          t = height > 1 ? (row - y) / (height - 1) : 0;
          if (angle >= 180 && angle < 360) t = 1 - t;
        }
        this.clearOccupant(col, row);
        this.buffer[row][col] = ' ';
        this.styleBuffer[row][col] = textStyle + gradientBgCode(gradient, t);
      }
    }
  }

  get(x: number, y: number): string {
    const col = cell(x);
    const row = cell(y);
    if (col < 0 || col >= this.width || row < 0 || row >= this.height) return ' ';
    return this.buffer[row][col];
  }

  getStyle(x: number, y: number): string {
    const col = cell(x);
    const row = cell(y);
    if (col < 0 || col >= this.width || row < 0 || row >= this.height) return '';
    return this.styleBuffer[row][col];
  }

  clear(char: string = ' '): void {
    const fillChar = splitGraphemes(char)[0] ?? ' ';
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.buffer[y][x] = fillChar;
        this.styleBuffer[y][x] = '';
      }
    }
  }

  toLines(): string[] {
    return this.buffer.map((row, y) => {
      let line = '';
      let currentStyle = '';
      for (let x = 0; x < this.width; x++) {
        const char = row[x];
        const style = this.styleBuffer[y][x];
        if (style !== currentStyle) {
          if (currentStyle) line += '\x1b[0m';
          if (style) line += style;
          currentStyle = style;
        }
        line += char;
      }
      if (currentStyle) line += '\x1b[0m';
      return line;
    });
  }

  toString(): string {
    return this.toLines().join('\n');
  }

  region(rawX: number, rawY: number, rawWidth: number, rawHeight: number): CharCanvas {
    const x = cell(rawX);
    const y = cell(rawY);
    const width = span(rawWidth);
    const height = span(rawHeight);
    const region = new CharCanvas(width, height);
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const srcX = x + col;
        const srcY = y + row;
        if (srcX >= 0 && srcX < this.width && srcY >= 0 && srcY < this.height) {
          region.buffer[row][col] = this.buffer[srcY][srcX];
          region.styleBuffer[row][col] = this.styleBuffer[srcY][srcX];
        }
      }
    }
    return region;
  }
}
