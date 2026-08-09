import {
  LayoutGrid,
  TextCursorInput,
  Eye,
  Table2,
  Menu as MenuIcon,
} from 'lucide-react';
import type { ComponentType } from '../types';

export type ToolbarPosition = 'TL' | 'T' | 'TR' | 'BL' | 'B' | 'BR' | 'custom';

export interface ToolbarCoordinates {
  x: number;
  y: number;
}

export const POSITION_PRESETS: Record<Exclude<ToolbarPosition, 'custom'>, ToolbarCoordinates> = {
  TL: { x: 32, y: 32 },
  T: { x: 50, y: 32 }, // percentage for center
  TR: { x: -32, y: 32 }, // negative for right offset
  BL: { x: 32, y: -32 }, // negative for bottom offset
  B: { x: 50, y: -32 },
  BR: { x: -32, y: -32 },
};

export const POSITION_LABELS: Record<Exclude<ToolbarPosition, 'custom'>, string> = {
  TL: 'Top Left',
  T: 'Top Center',
  TR: 'Top Right',
  BL: 'Bottom Left',
  B: 'Bottom Center',
  BR: 'Bottom Right',
};

export interface ComponentGroup {
  id: string;
  name: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  items: ComponentItem[];
}

export interface ComponentItem {
  type: ComponentType;
  label: string;
  hotkey?: string;
}

export const COMPONENT_GROUPS: ComponentGroup[] = [
  {
    id: 'layout',
    name: 'Layout',
    icon: LayoutGrid,
    items: [
      { type: 'Box', label: 'Box', hotkey: 'X' },
      { type: 'Grid', label: 'Grid', hotkey: 'G' },
      { type: 'Spacer', label: 'Spacer', hotkey: 'J' },
      { type: 'Modal', label: 'Modal', hotkey: 'O' },
    ],
  },
  {
    id: 'input',
    name: 'Input',
    icon: TextCursorInput,
    items: [
      { type: 'Button', label: 'Button', hotkey: 'B' },
      { type: 'TextInput', label: 'Text Input', hotkey: 'I' },
      { type: 'Checkbox', label: 'Checkbox', hotkey: 'K' },
      { type: 'Radio', label: 'Radio', hotkey: 'R' },
      { type: 'Select', label: 'Select', hotkey: 'D' },
      { type: 'Toggle', label: 'Toggle', hotkey: 'E' },
    ],
  },
  {
    id: 'display',
    name: 'Display',
    icon: Eye,
    items: [
      { type: 'Text', label: 'Text', hotkey: 'Y' },

      { type: 'Spinner', label: 'Spinner', hotkey: 'N' },
      { type: 'ProgressBar', label: 'Progress Bar', hotkey: 'P' },
    ],
  },
  {
    id: 'data',
    name: 'Data',
    icon: Table2,
    items: [
      { type: 'Table', label: 'Table', hotkey: 'A' },
      { type: 'List', label: 'List', hotkey: 'U' },
      { type: 'Tree', label: 'Tree', hotkey: 'Z' },
    ],
  },
  {
    id: 'navigation',
    name: 'Navigation',
    icon: MenuIcon,
    items: [
      { type: 'Menu', label: 'Menu', hotkey: 'M' },
      { type: 'Tabs', label: 'Tabs', hotkey: 'T' },
      { type: 'Breadcrumb', label: 'Breadcrumb', hotkey: 'C' },
    ],
  },
];
