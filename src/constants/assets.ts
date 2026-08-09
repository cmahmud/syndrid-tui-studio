// Spinner and progress bar asset presets.
// Spinner frames curated from cli-spinners (https://github.com/sindresorhus/cli-spinners, MIT).
// Emoji/wide-glyph spinners are excluded: they break monospace alignment in real terminals.

export interface SpinnerPreset {
  interval: number; // ms per frame, for generated code comments / future preview animation
  frames: string[];
}

export const SPINNER_PRESETS: Record<string, SpinnerPreset> = {
  dots: { interval: 80, frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] },
  dots2: { interval: 80, frames: ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'] },
  dots3: { interval: 80, frames: ['⠋', '⠙', '⠚', '⠞', '⠖', '⠦', '⠴', '⠲', '⠳', '⠓'] },
  dots9: { interval: 80, frames: ['⢹', '⢺', '⢼', '⣸', '⣇', '⡧', '⡗', '⡏'] },
  dots10: { interval: 80, frames: ['⢄', '⢂', '⢁', '⡁', '⡈', '⡐', '⡠'] },
  dots11: { interval: 100, frames: ['⠁', '⠂', '⠄', '⡀', '⢀', '⠠', '⠐', '⠈'] },
  dotsCircle: { interval: 80, frames: ['⢎ ', '⠎⠁', '⠊⠑', '⠈⠱', ' ⡱', '⢀⡰', '⢄⡠', '⢆⡀'] },
  sand: {
    interval: 80,
    frames: ['⠁', '⠂', '⠄', '⡀', '⡈', '⡐', '⡠', '⣀', '⣁', '⣂', '⣄', '⣌', '⣔', '⣤', '⣥', '⣦', '⣮', '⣶', '⣷', '⣿', '⡿', '⠿', '⢟', '⠟', '⡛', '⠛', '⠫', '⢋', '⠋', '⠍', '⡉', '⠉', '⠑', '⠡', '⢁'],
  },
  line: { interval: 130, frames: ['-', '\\', '|', '/'] },
  line2: { interval: 100, frames: ['⠂', '-', '–', '—', '–', '-'] },
  pipe: { interval: 100, frames: ['┤', '┘', '┴', '└', '├', '┌', '┬', '┐'] },
  simpleDots: { interval: 400, frames: ['.  ', '.. ', '...', '   '] },
  simpleDotsScrolling: { interval: 200, frames: ['.  ', '.. ', '...', ' ..', '  .', '   '] },
  star: { interval: 70, frames: ['✶', '✸', '✹', '✺', '✹', '✷'] },
  star2: { interval: 80, frames: ['+', 'x', '*'] },
  flip: { interval: 70, frames: ['_', '_', '_', '-', '`', '`', "'", '´', '-', '_', '_', '_'] },
  hamburger: { interval: 100, frames: ['☱', '☲', '☴'] },
  growVertical: { interval: 120, frames: ['▁', '▃', '▄', '▅', '▆', '▇', '▆', '▅', '▄', '▃'] },
  growHorizontal: { interval: 120, frames: ['▏', '▎', '▍', '▌', '▋', '▊', '▉', '▊', '▋', '▌', '▍', '▎'] },
  balloon: { interval: 140, frames: [' ', '.', 'o', 'O', '@', '*', ' '] },
  balloon2: { interval: 120, frames: ['.', 'o', 'O', '°', 'O', 'o', '.'] },
  noise: { interval: 100, frames: ['▓', '▒', '░'] },
  bounce: { interval: 120, frames: ['⠁', '⠂', '⠄', '⠂'] },
  boxBounce: { interval: 120, frames: ['▖', '▘', '▝', '▗'] },
  boxBounce2: { interval: 100, frames: ['▌', '▀', '▐', '▄'] },
  triangle: { interval: 50, frames: ['◢', '◣', '◤', '◥'] },
  binary: {
    interval: 80,
    frames: ['010010', '001100', '100101', '111010', '111101', '010111', '101011', '111000', '110011', '110101'],
  },
  arc: { interval: 100, frames: ['◜', '◠', '◝', '◞', '◡', '◟'] },
  circle: { interval: 120, frames: ['◡', '⊙', '◠'] },
  squareCorners: { interval: 180, frames: ['◰', '◳', '◲', '◱'] },
  circleQuarters: { interval: 120, frames: ['◴', '◷', '◶', '◵'] },
  circleHalves: { interval: 50, frames: ['◐', '◓', '◑', '◒'] },
  squish: { interval: 100, frames: ['╫', '╪'] },
  toggle: { interval: 250, frames: ['⊶', '⊷'] },
  toggle3: { interval: 120, frames: ['□', '■'] },
  toggle4: { interval: 100, frames: ['■', '□', '▪', '▫'] },
  toggle9: { interval: 100, frames: ['◉', '◎'] },
  arrow: { interval: 100, frames: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'] },
  arrow3: { interval: 120, frames: ['▹▹▹▹▹', '▸▹▹▹▹', '▹▸▹▹▹', '▹▹▸▹▹', '▹▹▹▸▹', '▹▹▹▹▸'] },
  bouncingBar: {
    interval: 80,
    frames: ['[    ]', '[=   ]', '[==  ]', '[=== ]', '[====]', '[ ===]', '[  ==]', '[   =]', '[    ]', '[   =]', '[  ==]', '[ ===]', '[====]', '[=== ]', '[==  ]', '[=   ]'],
  },
  bouncingBall: {
    interval: 80,
    frames: ['( ●    )', '(  ●   )', '(   ●  )', '(    ● )', '(     ●)', '(    ● )', '(   ●  )', '(  ●   )', '( ●    )', '(●     )'],
  },
  point: { interval: 125, frames: ['∙∙∙', '●∙∙', '∙●∙', '∙∙●', '∙∙∙'] },
  layer: { interval: 150, frames: ['-', '=', '≡'] },
  betaWave: {
    interval: 80,
    frames: ['ρββββββ', 'βρβββββ', 'ββρββββ', 'βββρβββ', 'ββββρββ', 'βββββρβ', 'ββββββρ'],
  },
  aesthetic: {
    interval: 80,
    frames: ['▰▱▱▱▱▱▱', '▰▰▱▱▱▱▱', '▰▰▰▱▱▱▱', '▰▰▰▰▱▱▱', '▰▰▰▰▰▱▱', '▰▰▰▰▰▰▱', '▰▰▰▰▰▰▰', '▰▱▱▱▱▱▱'],
  },
  dqpb: { interval: 100, frames: ['d', 'q', 'p', 'b'] },
};

export const SPINNER_STYLE_NAMES = Object.keys(SPINNER_PRESETS);

export interface ProgressBarStyle {
  filled: string;
  empty: string;
  head?: string; // leading edge of the filled section
  leftCap?: string;
  rightCap?: string;
  smooth?: boolean; // use eighth-block partials for the fractional cell
}

export const PROGRESSBAR_STYLES: Record<string, ProgressBarStyle> = {
  blocks: { filled: '█', empty: '░' },
  smooth: { filled: '█', empty: ' ', smooth: true, leftCap: '▕', rightCap: '▏' },
  shade: { filled: '▓', empty: '░' },
  solid: { filled: '█', empty: ' ', leftCap: '│', rightCap: '│' },
  hash: { filled: '#', empty: '-', leftCap: '[', rightCap: ']' },
  equals: { filled: '=', empty: ' ', head: '>', leftCap: '[', rightCap: ']' },
  braille: { filled: '⣿', empty: '⣀' },
  minimal: { filled: '▰', empty: '▱' },
  line: { filled: '━', empty: '─' },
  slim: { filled: '▮', empty: '▯' },
  circles: { filled: '●', empty: '○' },
  squares: { filled: '■', empty: '□' },
  stars: { filled: '*', empty: '.', leftCap: '[', rightCap: ']' },
};

export const PROGRESSBAR_STYLE_NAMES = Object.keys(PROGRESSBAR_STYLES);

// Eighth-width partial blocks, empty → full, used by 'smooth' style.
export const PARTIAL_BLOCKS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];

/** Render a progress bar string for a given width and 0–100 percentage. */
export function renderBar(styleName: string, barWidth: number, percentage: number): string {
  const s = PROGRESSBAR_STYLES[styleName] || PROGRESSBAR_STYLES.blocks;
  const innerWidth = Math.max(1, barWidth - (s.leftCap?.length || 0) - (s.rightCap?.length || 0));
  const pct = Math.min(100, Math.max(0, percentage));

  let bar: string;
  if (s.smooth) {
    const exact = (innerWidth * pct) / 100;
    const full = Math.floor(exact);
    const partialIdx = Math.round((exact - full) * 8);
    const partial = full < innerWidth ? PARTIAL_BLOCKS[Math.min(partialIdx, 7)] : '';
    bar = s.filled.repeat(full) + partial + s.empty.repeat(Math.max(0, innerWidth - full - partial.length));
  } else {
    let full = Math.floor((innerWidth * pct) / 100);
    let head = '';
    if (s.head && full > 0 && full < innerWidth) {
      full -= 1;
      head = s.head;
    }
    bar = s.filled.repeat(full) + head + s.empty.repeat(Math.max(0, innerWidth - full - head.length));
  }

  return `${s.leftCap || ''}${bar}${s.rightCap || ''}`;
}

/**
 * Render a progress bar with a text label overlaid/centered on top of it —
 * the Gauge component's distinguishing look (matches how ratatui's real
 * `Gauge::label()` centers text in the bar, and how terminal resource
 * meters like htop/btop typically render a labeled meter).
 */
export function renderGauge(styleName: string, width: number, percentage: number, label: string): string {
  const bar = renderBar(styleName, width, percentage).split('');
  const text = label.slice(0, width);
  const start = Math.max(0, Math.floor((width - text.length) / 2));
  for (let i = 0; i < text.length && start + i < bar.length; i++) {
    bar[start + i] = text[i];
  }
  return bar.join('');
}

// The 8 non-empty eighths-block levels ratatui's default Sparkline bar_set
// (symbols::bar::NINE_LEVELS) uses, plus a blank 0th level for zero/empty.
const SPARKLINE_CHARS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/**
 * Render a numeric series as a row of block-height characters, bucketing
 * (max-per-bucket, matching Textual's own `summary_function=max` convention)
 * when the series is longer than the target width.
 */
export function renderSparkline(data: number[], width: number, max?: number): string {
  if (!data.length || width <= 0) return ' '.repeat(Math.max(0, width));

  const bucketed: number[] = [];
  for (let i = 0; i < width; i++) {
    const start = Math.floor((i * data.length) / width);
    const end = Math.max(start + 1, Math.floor(((i + 1) * data.length) / width));
    bucketed.push(Math.max(...data.slice(start, end)));
  }

  const effectiveMax = max ?? Math.max(...data, 1);
  return bucketed
    .map((v) => {
      const level = effectiveMax > 0 ? Math.round((Math.max(0, v) / effectiveMax) * 8) : 0;
      return SPARKLINE_CHARS[Math.min(8, Math.max(0, level))];
    })
    .join('');
}

/**
 * Tail a log's lines to fit a fixed visible height, most-recent-at-bottom
 * (like a real log viewer scrolled to the end) — blank-padded at the top
 * when there are fewer lines than the height. Pass `width` to also
 * truncate/pad each line for a fixed character-grid render (the canvas
 * preview and ANSI/text export); omit it for code exporters, which should
 * let the real target framework's own wrapping/clipping handle width.
 */
export function tailLines(lines: string[], height: number, width?: number): string[] {
  const visible = lines.slice(-Math.max(1, height));
  const blankLine = width !== undefined ? ' '.repeat(width) : '';
  const padTop = Array(Math.max(0, height - visible.length)).fill(blankLine);
  const body =
    width !== undefined
      ? visible.map((l) => (l.length > width ? l.slice(0, width) : l.padEnd(width)))
      : visible;
  return [...padTop, ...body];
}

/**
 * Like tailLines, but anchored to the start (for buffers you read top-down,
 * e.g. TextArea) rather than the end (tailLines' log/tail-f semantics) —
 * shows the first N lines and pads any remaining rows at the bottom instead
 * of pushing real content down with blank lines above it.
 */
export function headLines(lines: string[], height: number, width?: number): string[] {
  const visible = lines.slice(0, Math.max(1, height));
  const blankLine = width !== undefined ? ' '.repeat(width) : '';
  const padBottom = Array(Math.max(0, height - visible.length)).fill(blankLine);
  const body =
    width !== undefined
      ? visible.map((l) => (l.length > width ? l.slice(0, width) : l.padEnd(width)))
      : visible;
  return [...body, ...padBottom];
}

/**
 * Render a StatusBar's key/label hints as one gap-separated line
 * (e.g. "^Q Quit  ^S Save  ^H Help"). Shared by every exporter except
 * Textual, which has a real Footer+BINDINGS mechanism instead.
 */
export function renderStatusBar(items: { key?: string; label?: string }[], gap: number): string {
  return items
    .map((it) => `${it.key || ''} ${it.label || ''}`.trim())
    .join(' '.repeat(Math.max(1, gap)));
}

export const TOAST_VARIANT_ICONS: Record<string, string> = {
  info: 'ℹ',
  success: '✓',
  warning: '⚠',
  error: '✗',
};

export function renderToast(message: string, variant: string): string {
  const icon = TOAST_VARIANT_ICONS[variant] || TOAST_VARIANT_ICONS.info;
  return `${icon} ${message}`;
}

/** Box-drawing characters for the Separator component, per line style and orientation. */
export const SEPARATOR_CHARS: Record<string, { horizontal: string; vertical: string }> = {
  single: { horizontal: '─', vertical: '│' },
  double: { horizontal: '═', vertical: '║' },
  thick: { horizontal: '━', vertical: '┃' },
  dashed: { horizontal: '┄', vertical: '┆' },
};

export const SEPARATOR_STYLE_NAMES = Object.keys(SEPARATOR_CHARS);

/** Resolve the line character for a Separator's lineStyle + orientation. */
export function getSeparatorChar(lineStyle: string, orientation: string): string {
  const style = SEPARATOR_CHARS[lineStyle] || SEPARATOR_CHARS.single;
  return orientation === 'vertical' ? style.vertical : style.horizontal;
}
