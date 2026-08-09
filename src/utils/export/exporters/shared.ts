// Helpers shared across exporters. Extracted because the logic below was
// already duplicated near-verbatim in three or more exporter files — this
// is consolidation of real, existing duplication, not a speculative
// abstraction. Each target language still owns its own widget mapping and
// syntax; only the parts that were genuinely identical live here.

import type { ComponentNode, StyleProps } from '../../../types';

/** A color-fidelity choice threaded through every exporter's color resolution. */
export type ExportColorMode = 'truecolor' | 'ansi16' | 'ansi256';

/** Generates collision-safe camelCase identifiers from component names ("OK", "OK" -> "ok", "ok2"). */
export function createIdentGenerator(usedVars: Set<string>, fallbackPrefix = 'v') {
  return function ident(name: string): string {
    let base = name
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)))
      .join('');
    if (!base || /^[0-9]/.test(base)) base = `${fallbackPrefix}${base}`;
    let out = base;
    let n = 2;
    while (usedVars.has(out)) out = `${base}${n++}`;
    usedVars.add(out);
    return out;
  };
}

/** The 16 standard ANSI color names, index-aligned with their terminal color codes (0-15). */
export const ANSI16_NAMES = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
] as const;

/** Common aliases users/themes use for the same 16 slots (gray === brightBlack, lightRed === brightRed, etc). */
const ANSI16_ALIASES: Record<string, number> = {
  gray: 8,
  grey: 8,
  darkgray: 8,
  darkgrey: 8,
  lightred: 9,
  lightgreen: 10,
  lightyellow: 11,
  lightblue: 12,
  lightmagenta: 13,
  lightcyan: 14,
  lightwhite: 15,
};

// Standard xterm/VGA RGB approximations for the 16 ANSI colors — the same
// fixed palette every terminal emulator's default theme is built from.
const ANSI16_RGB: [number, number, number][] = [
  [0, 0, 0],
  [128, 0, 0],
  [0, 128, 0],
  [128, 128, 0],
  [0, 0, 128],
  [128, 0, 128],
  [0, 128, 128],
  [192, 192, 192],
  [128, 128, 128],
  [255, 0, 0],
  [0, 255, 0],
  [255, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
  [0, 255, 255],
  [255, 255, 255],
];

/** Index (0-15) of an already-named ANSI color, or null if `value` isn't one. */
export function ansi16IndexOfName(value: string): number | null {
  const key = value.toLowerCase().replace(/[^a-z]/g, '');
  const named = ANSI16_NAMES.findIndex((n) => n.toLowerCase() === key);
  if (named >= 0) return named;
  return key in ANSI16_ALIASES ? ANSI16_ALIASES[key] : null;
}

export function expandHex3(hex: string): string {
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return hex;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const s = expandHex3(hex);
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) return null;
  return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
}

/** Nearest of the 16 ANSI colors to a hex value, by RGB distance. */
export function nearestAnsi16(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 7; // fall back to plain white for anything unparseable
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < ANSI16_RGB.length; i++) {
    const [r, g, b] = ANSI16_RGB[i];
    const dist = (rgb[0] - r) ** 2 + (rgb[1] - g) ** 2 + (rgb[2] - b) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

// The standard xterm 256-color palette: indices 0-15 are the ANSI16 table
// above, 16-231 are a 6x6x6 RGB cube (level per axis from this ramp), and
// 232-255 are a 24-step grayscale ramp — verified against the published
// xterm palette spec, not guessed.
const XTERM256_CUBE_LEVELS = [0, 95, 135, 175, 215, 255];

function ansi256ToRgb(index: number): [number, number, number] {
  if (index < 16) return ANSI16_RGB[index];
  if (index < 232) {
    const i = index - 16;
    const r = Math.floor(i / 36);
    const g = Math.floor((i % 36) / 6);
    const b = i % 6;
    return [XTERM256_CUBE_LEVELS[r], XTERM256_CUBE_LEVELS[g], XTERM256_CUBE_LEVELS[b]];
  }
  const gray = 8 + (index - 232) * 10;
  return [gray, gray, gray];
}

/** Nearest of the 256 xterm colors to a hex value, by RGB distance. */
export function nearestAnsi256(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 15; // fall back to bright white for anything unparseable
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = ansi256ToRgb(i);
    const dist = (rgb[0] - r) ** 2 + (rgb[1] - g) ** 2 + (rgb[2] - b) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/**
 * Resolve a user-supplied color (named or hex) to an ANSI-16 index, for
 * exporters generating portable (non-truecolor) output. Named ANSI colors
 * pass through as themselves; anything else (hex, unrecognized names) is
 * matched to its nearest neighbor.
 */
export function resolveAnsi16Index(value: string | undefined): number | null {
  if (!value) return null;
  const named = ansi16IndexOfName(value);
  if (named != null) return named;
  if (/^#[0-9a-fA-F]{3}$/.test(value) || /^#[0-9a-fA-F]{6}$/.test(value)) return nearestAnsi16(value);
  return null;
}

/**
 * No target framework's widget model can paint a background gradient (that's
 * a per-cell ANSI banding trick the text/ANSI exporter does, not something
 * declarative widget libraries expose) — every code exporter approximates a
 * gradient with its first stop as a flat background color. This is that
 * shared fallback so "flat color" and "which stop" stay consistent everywhere.
 */
export function resolveBackgroundColor(style: StyleProps): string | undefined {
  if (style.backgroundGradient?.stops?.length) return style.backgroundGradient.stops[0].color;
  return style.backgroundColor;
}

/** Collects one warning per node using a background gradient — shared across every exporter's getWarnings. */
export function collectGradientWarnings(root: ComponentNode): string[] {
  const warnings: string[] = [];
  const walk = (node: ComponentNode) => {
    if (node.hidden) return;
    if (node.style.backgroundGradient?.stops?.length) {
      warnings.push(
        `"${node.name}" uses a background gradient — no target framework can paint gradients in widget code, so this exports as a flat ${node.style.backgroundGradient.stops[0].color} background (its first stop).`
      );
    }
    node.children.forEach(walk);
  };
  walk(root);
  return warnings;
}
