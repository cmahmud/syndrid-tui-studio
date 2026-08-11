export type RatatuiEcosystemLibraryId =
  | 'ratatui'
  | 'tachyonfx'
  | 'ratatui-textarea'
  | 'tui-widgets'
  | 'ratatui-image'
  | 'mousefood'
  | 'tui-tree-widget'
  | 'tui-widget-list'
  | 'tui-term'
  | 'ratatui-interact'
  | 'tui-syntax-highlight'
  | 'tui-nodes'
  | 'termprofile'
  | 'ansi-to-tui';

export type RatatuiComponentAdapter =
  | 'native'
  | 'textarea'
  | 'image'
  | 'big-text'
  | 'card'
  | 'popup'
  | 'prompt'
  | 'scrollview'
  | 'tree-widget'
  | 'widget-list'
  | 'terminal'
  | 'interactive'
  | 'syntax-highlight'
  | 'node-graph'
  | 'ansi-text';

export interface TextareaAdapterSpec {
  search: boolean;
  softWrap: boolean;
  lineNumbers: boolean;
  tabWidth: number;
  editorMode: 'standard' | 'vim';
}

export interface ImageAdapterSpec {
  assetId?: string;
  fit: 'contain' | 'cover' | 'stretch' | 'original';
  alignment: 'start' | 'center' | 'end';
  protocol: 'auto' | 'kitty' | 'sixel' | 'iterm2' | 'halfblocks';
  fallback: 'placeholder' | 'alt-text' | 'hidden';
  preserveAspectRatio: boolean;
}

export interface ScrollAdapterSpec {
  axis: 'vertical' | 'horizontal' | 'both';
  showScrollbar: boolean;
  step: number;
}

export interface TerminalAdapterSpec {
  command?: string;
  args?: string[];
  cwd?: string;
  scrollback: number;
  readOnly: boolean;
}

export interface SyntaxAdapterSpec {
  language: string;
  theme: string;
  lineNumbers: boolean;
}

export interface InteractionAdapterSpec {
  focusable: boolean;
  mouse: boolean;
  hover: boolean;
  click: boolean;
}

export interface NodeGraphAdapterSpec {
  orientation: 'horizontal' | 'vertical';
  showPorts: boolean;
  showLabels: boolean;
}

export interface EmbeddedDisplayAdapterSpec {
  enabled: boolean;
  backend: 'mousefood';
  target: 'simulator' | 'framebuffer' | 'epd-weact' | 'epd-waveshare' | 'lilygo-epd47';
  colorMode: 'mono' | 'rgb565' | 'rgb888';
}

/**
 * Optional per-component production/runtime adapter metadata.
 * The visual component remains a portable Syndrid component; this selects the
 * richer Ratatui implementation used by preview/export where available.
 */
export interface ComponentEcosystemSpec {
  adapter: RatatuiComponentAdapter;
  textarea?: TextareaAdapterSpec;
  image?: ImageAdapterSpec;
  scroll?: ScrollAdapterSpec;
  terminal?: TerminalAdapterSpec;
  syntax?: SyntaxAdapterSpec;
  interaction?: InteractionAdapterSpec;
  nodeGraph?: NodeGraphAdapterSpec;
  embedded?: EmbeddedDisplayAdapterSpec;
  libraryOverrides?: Partial<Record<RatatuiEcosystemLibraryId, string>>;
}

export interface RatatuiEcosystemLibrary {
  id: RatatuiEcosystemLibraryId;
  crateName: string;
  version: string;
  purpose: string;
  status: 'core' | 'integrated' | 'optional';
  desktop: boolean;
  embedded: boolean;
}

export interface RatatuiAdapterDefinition {
  id: RatatuiComponentAdapter;
  label: string;
  description: string;
  library: RatatuiEcosystemLibraryId;
  recommendedTypes: string[];
}
