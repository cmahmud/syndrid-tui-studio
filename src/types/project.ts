import type { ComponentNode, ComponentProps, LayoutProps, StyleProps } from './components';

export type ViewportId = 'wide' | 'medium' | 'narrow' | 'short' | string;

export interface ViewportPreset {
  id: ViewportId;
  label: string;
  width: number;
  height: number;
  description?: string;
  order: number;
}

export interface ResponsiveOverride {
  props?: Partial<ComponentProps>;
  layout?: Partial<LayoutProps>;
  style?: Partial<StyleProps>;
  hidden?: boolean;
}

export type PrototypeStateName =
  | 'default'
  | 'focused'
  | 'selected'
  | 'disabled'
  | 'loading'
  | 'success'
  | 'warning'
  | 'error'
  | string;

export interface ComponentStateOverride {
  label?: string;
  props?: Partial<ComponentProps>;
  layout?: Partial<LayoutProps>;
  style?: Partial<StyleProps>;
  hidden?: boolean;
  note?: string;
}

export type AnimationTrigger =
  | 'on-enter'
  | 'on-exit'
  | 'on-focus'
  | 'on-blur'
  | 'on-select'
  | 'on-change'
  | 'on-loading'
  | 'on-success'
  | 'on-error'
  | 'manual';

export type AnimationEffect =
  | 'fade'
  | 'slide'
  | 'wipe'
  | 'pulse'
  | 'dissolve'
  | 'glitch'
  | 'typewriter'
  | 'highlight'
  | 'spring';

export type AnimationDirection = 'left' | 'right' | 'up' | 'down' | 'none';
export type AnimationEasing =
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'smoothstep'
  | 'spring';

export interface AnimationSpec {
  id: string;
  name: string;
  trigger: AnimationTrigger;
  effect: AnimationEffect;
  durationMs: number;
  delayMs: number;
  easing: AnimationEasing;
  direction: AnimationDirection;
  enabled: boolean;
  loop?: boolean;
  intensity?: number;
  reducedMotionEffect?: 'none' | 'fade' | 'highlight';
  tachyonFxHint?: string;
}

export interface KeyBindingSpec {
  key: string;
  action: string;
  description?: string;
}

export interface ComponentPrototypeSpec {
  focusable?: boolean;
  focusOrder?: number;
  defaultState?: PrototypeStateName;
  states?: Record<PrototypeStateName, ComponentStateOverride>;
  animations?: AnimationSpec[];
  keyBindings?: KeyBindingSpec[];
}

export interface DesignTokens {
  name: string;
  description?: string;
  colors: Record<string, string>;
  spacing: Record<string, number>;
  borders: Record<string, 'single' | 'double' | 'rounded' | 'bold'>;
  motion: {
    instant: number;
    fast: number;
    normal: number;
    slow: number;
    defaultEasing: AnimationEasing;
  };
}

export interface ReusableComponentDefinition {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  root: ComponentNode;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSettings {
  name: string;
  description: string;
  targetFramework: 'ratatui';
  animationRuntime: 'tachyonfx';
  reducedMotionDefault: boolean;
  terminalCellWidthPx: number;
  terminalCellHeightPx: number;
}

export interface SyndridProjectData {
  version: '2';
  settings: ProjectSettings;
  viewports: ViewportPreset[];
  activeViewportId: ViewportId;
  designTokens: DesignTokens;
  reusableComponents: ReusableComponentDefinition[];
}
