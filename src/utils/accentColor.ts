import type { THEMES } from '../stores/themeStore';

export const ACCENT_PRESETS = [
  { name: 'TUIGreen', value: 'tuigreen', hex: '#3fcf8e', primary: '153 60% 53%', fg: '0 0% 5%' },
  { name: 'Blue', value: 'blue', hex: '#3b82f6', primary: '221 83% 53%', fg: '0 0% 100%' },
  { name: 'Red', value: 'red', hex: '#ef4444', primary: '0 84% 60%', fg: '0 0% 100%' },
  { name: 'Lime', value: 'lime', hex: '#84cc16', primary: '85 60% 45%', fg: '0 0% 5%' },
  { name: 'Orange', value: 'orange', hex: '#f97316', primary: '25 95% 53%', fg: '0 0% 5%' },
  { name: 'Rose', value: 'rose', hex: '#f43f5e', primary: '347 77% 50%', fg: '0 0% 100%' },
  { name: 'Violet', value: 'violet', hex: '#8b5cf6', primary: '263 70% 58%', fg: '0 0% 100%' },
  { name: 'Yellow', value: 'yellow', hex: '#eab308', primary: '48 96% 48%', fg: '0 0% 5%' },
] as const;

export type AccentPreset = (typeof ACCENT_PRESETS)[number]['value'] | 'custom';

function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function isLightHex(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
}

export function resolveColorToHex(color: string, theme: (typeof THEMES)[keyof typeof THEMES]): string {
  if (!color) return '#ffffff';
  if (color.startsWith('#')) return color;
  return theme[color as keyof typeof theme] || '#ffffff';
}

export function applyAccentColor(preset: AccentPreset, customHex?: string) {
  let primary: string;
  let fg: string;
  if (preset === 'custom' && customHex) {
    const hex = customHex.startsWith('#') ? customHex : '#ffffff';
    primary = hexToHsl(hex);
    fg = isLightHex(hex) ? '0 0% 5%' : '0 0% 100%';
  } else {
    const found = ACCENT_PRESETS.find((p) => p.value === preset) || ACCENT_PRESETS[0];
    primary = found.primary;
    fg = found.fg;
  }
  document.documentElement.style.setProperty('--primary', primary);
  document.documentElement.style.setProperty('--primary-foreground', fg);
  document.documentElement.style.setProperty('--ring', primary);
  localStorage.setItem('settings-accent-preset', preset);
  if (preset === 'custom' && customHex) {
    localStorage.setItem('settings-accent-custom', customHex);
  }
}
