// Canvas rendering utilities for compositing components

import type { GradientConfig } from '../../types';
import { gradientBgCode } from './ansi';
import { graphemeWidth, splitGraphemes } from './width';

/**
 * 2D character canvas for compositing TUI components
 */
export class CharCanvas {
  private buffer: string[][];
  private styleBuffer: string[][];
  public readonly width: number;
  public readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.buffer = Array(height)
      .fill(null)
      .map(() => Array(width).fill(' '));
    this.styleBuffer = Array(height)
      .fill(null)
      .map(() => Array(width).fill(''));
  }

  /** Clear whichever rendered grapheme owns this terminal cell. */
  private clearOccupant(x: number, y: number): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    let start = x;
    while (start > 0 && this.buffer[y][start] === '') start--;
    const symbol = this.buffer[y][start];
    const width = Math.max(1, graphemeWidth(symbol));
    if (start < x && width <= x - start) start = x;
    const span = Math.max(1, graphemeWidth(this.buffer[y][start]));
    for (let offset = 0; offset < span && start + offset < this.width; offset++) {
      this.buffer[y][start + offset] = ' ';
      this.styleBuffer[y][start + offset] = '';
    }
  }

  /**
   * Write text at a specific position
   */
  write(x: number, y: number, text: string, style?: string): void {
    if (y < 0 || y >= this.height) return;

    let col = x;
    for (const grapheme of splitGraphemes(text)) {
      const cellWidth = Math.max(0, graphemeWidth(grapheme));
      if (cellWidth === 0) {
        // Combining-only graphemes are appended to the previous visible cell.
        const previous = col - 1;
        if (previous >= 0 && previous < this.width) this.buffer[y][previous] += grapheme;
        continue;
      }
      if (col + cellWidth > this.width) break;
      if (col >= 0) {
        // Clear both previous wide-glyph owners and any continuations this
        // write overlaps. Without this, overwriting the second half of an
        // emoji/CJK cell leaves the original wide glyph visually occupying it.
        for (let offset = 0; offset < cellWidth; offset++) this.clearOccupant(col + offset, y);
        this.buffer[y][col] = grapheme;
        if (style) this.styleBuffer[y][col] = style;
        // Continuation cells are represented by an empty string so serializing
        // the row does not add an extra terminal column after a wide grapheme.
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

  /**
   * Write multiple lines at a position
   */
  writeLines(x: number, y: number, lines: string[], style?: string): void {
    lines.forEach((line, i) => {
      this.write(x, y + i, line, style);
    });
  }

  /**
   * Fill a rectangle with a character
   */
  fill(
    x: number,
    y: number,
    width: number,
    height: number,
    char: string = ' ',
    style?: string
  ): void {
    for (let row = y; row < y + height && row < this.height; row++) {
      if (row < 0) continue;
      for (let col = x; col < x + width && col < this.width; col++) {
        if (col < 0) continue;
        this.clearOccupant(col, row);
        this.buffer[row][col] = char;
        if (style) {
          this.styleBuffer[row][col] = style;
        }
      }
    }
  }

  /**
   * Draw a horizontal line
   */
  hline(x: number, y: number, length: number, char: string = '─', style?: string): void {
    this.write(x, y, char.repeat(length), style);
  }

  /**
   * Draw a vertical line
   */
  vline(x: number, y: number, length: number, char: string = '│', style?: string): void {
    for (let i = 0; i < length; i++) {
      this.write(x, y + i, char, style);
    }
  }

  /**
   * Fill a rectangle with a gradient background, one ANSI color per column (horizontal)
   * or per row (vertical), based on the gradient angle.
   * `textStyle` is an optional additional ANSI style prefix (e.g. foreground color) to combine.
   */
  fillGradient(
    x: number,
    y: number,
    width: number,
    height: number,
    gradient: GradientConfig,
    textStyle: string = ''
  ): void {
    // Determine whether we interpolate along columns (horizontal-ish) or rows (vertical-ish)
    const angle = ((gradient.angle % 360) + 360) % 360;
    const horizontal = (angle >= 45 && angle < 135) || (angle >= 225 && angle < 315);

    for (let row = y; row < y + height && row < this.height; row++) {
      if (row < 0) continue;
      for (let col = x; col < x + width && col < this.width; col++) {
        if (col < 0) continue;
        let t: number;
        if (horizontal) {
          t = width > 1 ? (col - x) / (width - 1) : 0;
          // Reverse direction if angle points right-to-left
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

  /**
   * Get a character at a position
   */
  get(x: number, y: number): string {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return ' ';
    }
    return this.buffer[y][x];
  }

  /**
   * Get style at a position
   */
  getStyle(x: number, y: number): string {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return '';
    }
    return this.styleBuffer[y][x];
  }

  /**
   * Clear the canvas
   */
  clear(char: string = ' '): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.buffer[y][x] = char;
        this.styleBuffer[y][x] = '';
      }
    }
  }

  /**
   * Export canvas to string array (one string per line)
   */
  toLines(): string[] {
    return this.buffer.map((row, y) => {
      let line = '';
      let currentStyle = '';

      for (let x = 0; x < this.width; x++) {
        const char = row[x];
        const style = this.styleBuffer[y][x];

        // Apply style changes
        if (style !== currentStyle) {
          if (currentStyle) {
            line += '\x1b[0m'; // Reset previous style
          }
          if (style) {
            line += style;
          }
          currentStyle = style;
        }

        line += char;
      }

      // Reset style at end of line
      if (currentStyle) {
        line += '\x1b[0m';
      }

      return line;
    });
  }

  /**
   * Export canvas to a single string
   */
  toString(): string {
    return this.toLines().join('\n');
  }

  /**
   * Create a sub-region of the canvas
   */
  region(x: number, y: number, width: number, height: number): CharCanvas {
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
